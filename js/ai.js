import { budgetOf, estTok, omittedCount } from './prompt.js';
import { clip, mergeMem, mergeRel, splitSummary } from './memory.js';
import { hintOf, hit429, note, resetDur, wait } from './rate.js';
import { cacheOf, record, usageOf } from './stats.js';
import { PROVIDERS, S, app, ctx } from './state.js';
import { getOne, save } from './store.js';
import { err, strip } from './util.js';

const ANT = p => PROVIDERS[p]?.fmt == 'anthropic';
export const sumGate = (u, big, go) => (big ? u >= 80 || (go && u > 40) : u >= 40);
export const authH = (p, k) =>
  ANT(p)
    ? { 'x-api-key': k, 'anthropic-version': ANT_VERSION, 'anthropic-dangerous-direct-browser-access': 'true' }
    : { Authorization: 'Bearer ' + k };
// Version de l'API Claude. Depuis 2026-10-21, temperature, top_p et top_k sont refusés (erreur 400)
// sur tous les modèles : toAnt ne les envoie jamais, la température des Réglages ne vaut que pour
// les autres fournisseurs.
export const ANT_VERSION = '2026-10-21';
// Résumés de mémoire avec Claude quand aucun modèle n'est choisi : un résumé ne demande pas le meilleur
// modèle, et Haiku 5.5 coûte une vingtaine de fois moins que Sonnet 5.5.
export const MEM_CLAUDE = 'claude-haiku-5-5';
export const memModel = (p = S.provider) => S.memModels?.[p] || (ANT(p) ? MEM_CLAUDE : '');
export const EFFORTS = ['low', 'medium', 'high'];
// L'effort (output_config.effort) règle la réflexion facturée avant chaque réponse. Accepté par Opus et
// Sonnet 4.6 et suivants, Haiku 5.5, Fable et Mythos (et Opus 4.5) ; Haiku 4.5 et Sonnet 4.5 le refusent.
export const effortOk = model => {
  const m = String(model || '').match(/^claude-([a-z]+)-(\d+)(?:-(\d{1,2}))?(?=-|$)/);
  if (!m) return false;
  const [f, maj, min] = [m[1], +m[2], +m[3] || 0];
  if (f == 'fable' || f == 'mythos') return true;
  if (f == 'haiku') return maj >= 5;
  return maj > 4 || (maj == 4 && min >= (f == 'opus' ? 5 : 6));
};
export const toAnt = (ms, { model, max, stream, ttl, effort }) => {
  const cc = { type: 'ephemeral', ...(ttl ? { ttl: '1h' } : {}) },
    sys = [],
    out = [];
  for (const m of ms)
    if (m.role == 'system') {
      const k = m.cut ?? m.content.length;
      for (const t of [m.content.slice(0, k), m.content.slice(k)])
        if (t.trim()) sys.push({ type: 'text', text: t, cache_control: cc });
    }
  sys.slice(0, -3).forEach(b => delete b.cache_control);
  for (const m of ms) {
    if (m.role == 'system') continue;
    const l = out.at(-1);
    if (l?.role == m.role) l.content += '\n\n' + m.content;
    else out.push({ role: m.role, content: m.content });
  }
  if (out[0]?.role == 'assistant') out.unshift({ role: 'user', content: '(Suite de l’histoire.)' });
  const b = out.at(-2);
  if (b?.content.trim()) b.content = [{ type: 'text', text: b.content, cache_control: cc }];
  return {
    model,
    max_tokens: max || 4096,
    ...(sys.length ? { system: sys } : {}),
    messages: out,
    ...(EFFORTS.includes(effort) && effortOk(model) ? { output_config: { effort } } : {}),
    ...(stream ? { stream: true } : {})
  };
};
// Fournisseurs compatibles OpenAI : seulement role et content. Les messages internes portent des repères
// (cut, la fin de la partie fixe du prompt, lu par toAnt) que Groq refuse et que les autres n'ont pas à voir.
export const toOai = ms => ms.map(({ role, content }) => ({ role, content }));
export const normU = u =>
  u && !('prompt_tokens' in u) && ('input_tokens' in u || 'cache_read_input_tokens' in u)
    ? {
        prompt_tokens: (u.input_tokens || 0) + (u.cache_read_input_tokens || 0) + (u.cache_creation_input_tokens || 0),
        completion_tokens: u.output_tokens || 0,
        total_tokens:
          (u.input_tokens || 0) + (u.cache_read_input_tokens || 0) + (u.cache_creation_input_tokens || 0) + (u.output_tokens || 0),
        prompt_tokens_details: { cached_tokens: u.cache_read_input_tokens || 0 },
        cache_write: u.cache_creation_input_tokens || 0,
        rl: (u.input_tokens || 0) + (u.cache_creation_input_tokens || 0)
      }
    : u;
// Maintien du cache : le cache de Claude expire 5 minutes après le début de la dernière requête qui l'a
// lu ou écrit. Pendant une pause, renvoyer la même requête avec max_tokens: 0 (sans streaming, refusé
// dans ce cas) relit le préfixe au tarif réduit et repousse l'échéance, au lieu de le réécrire à 1,25 fois
// le prix d'entrée au tour suivant. Même effort que la vraie requête : il fait partie du préfixe.
let LAST = null;
export const WARM_AT = 270000;
export const lastWarmable = () => LAST;
export async function keepWarm() {
  const p = S.provider,
    k = S.keys[p];
  if (!LAST || LAST.p !== p || !ANT(p) || !k) return false;
  const { stream, ...b } = LAST.body;
  LAST.at = Date.now();
  try {
    const r = await fetch(PROVIDERS[p].u + '/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authH(p, k) },
      body: JSON.stringify({ ...b, max_tokens: 0 })
    });
    if (!r.ok) return false;
    const u = normU((await r.json().catch(() => ({}))).usage);
    note(r.headers, u, b.model, false);
    track([], '', u, p + '/' + b.model);
    return true;
  } catch (e) {
    return false;
  }
}
// Erreurs passagères du fournisseur (surcharge, passerelle) : on retente, sans toucher à la jauge de débit.
export const BUSY = new Set([500, 502, 503, 504, 529]);
export const TRIES = 3;
export const backoff = (a, ra) => Math.min(60, Math.max(1, Math.round(+ra || 2 ** (a + 1))));
const pause = (ms, sig) =>
  new Promise(r => {
    const t = setTimeout(r, ms);
    sig?.addEventListener('abort', () => {
      clearTimeout(t);
      r();
    }, { once: true });
  });
const track = (ms, out, u, key) => {
  try {
    const x = usageOf(u);
    if (x) {
      const [cr, cw] = cacheOf(u),
        h1 = ANT(key.split('/')[0]) && S.c1h;
      return record(key, x[0], x[1], false, Date.now(), [cr, h1 ? 0 : cw, h1 ? cw : 0]);
    }
    record(
      key,
      ms.reduce((a, m) => a + estTok(m.content) + 4, 0),
      estTok(out),
      true
    );
  } catch (e) {}
};
const calib = (ms, u) => {
  const pt = u?.prompt_tokens,
    ov = 4 * ms.length;
  if (!pt || pt <= ov) return;
  const r = ms.reduce((a, m) => a + m.content.length, 0) / (pt - ov);
  if (r > 2 && r < 6) S.cpt = +((S.cpt || 3.4) * 0.75 + r * 0.25).toFixed(3);
  app.pt = pt;
};
export async function chat(
  ms,
  { max = 0, ac = new AbortController(), od = null, temp = null, top = null, model = '', effort = '', json = false, onWait = null, primary = false, timeout = 120000 } = {}
) {
  const p = S.provider,
    k = S.keys[p];
  if (!k) throw new Error('clé API manquante');
  let jm = json;
  const A = ANT(p),
    mdl = model || S.models[p] || PROVIDERS[p].m;
  const est = (A ? ms.slice(-2) : ms).reduce((a, m) => a + estTok(m.content), 0) + (max || 500);
  const hold = async (next, why) => {
    for (let w = next(); w > 0 && !ac.signal.aborted; w = next()) {
      onWait?.(w, why);
      await pause(1000, ac.signal);
    }
    onWait?.(0);
    if (ac.signal.aborted) throw new Error('Annulé.');
  };
  await hold(() => wait(est, mdl), 'pace');
  let tm;
  const arm = () => {
    clearTimeout(tm);
    tm = setTimeout(() => ac.abort('timeout'), timeout);
  };
  arm();
  const t0 = Date.now();
  const retry = async (secs, why) => {
    let left = secs;
    await hold(() => left--, why);
    arm();
  };
  try {
    for (let a = 0; ; a++) {
      let r;
      const body = A
        ? toAnt(ms, { model: mdl, max, stream: !!od, ttl: S.c1h, effort })
        : {
            model: mdl,
            messages: toOai(ms),
            ...(max ? { max_tokens: max } : {}),
            ...(temp != null ? { temperature: +temp } : {}),
            ...(top != null ? { top_p: +top } : {}),
            ...(od ? { stream: true } : {}),
            ...(jm ? { response_format: { type: 'json_object' } } : {})
          };
      // La dernière requête de narration Claude sert de modèle au maintien du cache (keepWarm).
      if (A && primary) LAST = { p, body, at: Date.now() };
      try {
        r = await fetch(PROVIDERS[p].u + (A ? '/messages' : '/chat/completions'), {
          method: 'POST',
          signal: ac.signal,
          headers: { 'Content-Type': 'application/json', ...authH(p, k) },
          body: JSON.stringify(body)
        });
      } catch (e) {
        // Coupure réseau avant toute réponse : rien n'a été facturé, on peut retenter.
        if (ac.signal.aborted || !(e instanceof TypeError) || a >= TRIES) throw e;
        await retry(backoff(a), 'net');
        continue;
      }
      if (r.ok && od && r.body && (r.headers.get('content-type') || '').includes('event-stream')) {
        const rd = r.body.getReader(),
          dc = new TextDecoder();
        let buf = '',
          tt = '',
          fr = '',
          fin = false,
          part = false,
          n = 0,
          us = null,
          ex = '';
        const feed = l => {
          if (!l.startsWith('data:')) return;
          const d = l.slice(5).trim();
          if (A) {
            try {
              const o = JSON.parse(d),
                dl = o.delta;
              if (o.type == 'message_start') us = { ...o.message?.usage };
              else if (o.type == 'content_block_delta' && dl?.type == 'text_delta') {
                tt += dl.text;
                n++;
                od(tt);
              } else if (o.type == 'content_block_delta' && dl?.type == 'thinking_delta') od(tt, true);
              else if (o.type == 'message_delta') {
                if (dl?.stop_reason) fr = dl.stop_reason;
                us = { ...us, ...o.usage };
              } else if (o.type == 'message_stop') fin = true;
              else if (o.type == 'error') {
                ex = o.error?.message || 'erreur du fournisseur';
                fin = true;
              }
            } catch (e) {}
            return;
          }
          if (d == '[DONE]') {
            fin = true;
            return;
          }
          try {
            const o = JSON.parse(d),
              c = o.choices?.[0],
              dl = c?.delta;
            us = o.usage || o.x_groq?.usage || us;
            if (dl?.content) {
              tt += dl.content;
              n++;
              od(tt);
            } else if (dl?.reasoning_content || dl?.reasoning) od(tt, true);
            if (c?.finish_reason) fr = c.finish_reason;
          } catch (e) {}
        };
        try {
          while (!fin) {
            const { done, value } = await rd.read();
            if (done) break;
            arm();
            buf += dc.decode(value, { stream: true });
            const ls = buf.split('\n');
            buf = ls.pop();
            for (const l of ls) feed(l);
          }
          if (!fin && buf) feed(buf);
          rd.cancel().catch(() => {});
          if (ex && !tt) throw new Error(ex);
          if (ex) part = true;
        } catch (e) {
          if (!(tt && (ac.signal.reason == 'timeout' || ac.signal.reason == 'stop'))) throw e;
          part = true;
        }
        const out = strip(tt);
        if (!out)
          throw new Error('réponse vide (modèle de raisonnement ? augmentez la longueur maximale)');
        us = normU(us);
        if (primary) calib(ms, us);
        note(r.headers, us, mdl, primary);
        track(ms, out, us, p + '/' + mdl);
        return {
          t: out,
          cut: fr == 'length' || fr == 'max_tokens',
          mode: 'stream',
          chunks: n,
          ms: Date.now() - t0,
          partial: part
        };
      }
      const j = await r.json().catch(() => ({}));
      const er = (Array.isArray(j) ? j[0] : j)?.error;
      if (r.status == 429 && a < TRIES) {
        const secs = Math.min(
            90,
            Math.max(
              3,
              Math.round(
                (hintOf(er?.message) ||
                  (+r.headers.get('retry-after') || 0) * 1000 ||
                  resetDur(r.headers.get('x-ratelimit-reset-tokens')) ||
                  (a + 1) * 15000) / 1000
              )
            )
          );
        hit429(mdl, secs * 1000);
        await retry(secs, 'retry');
        continue;
      }
      if (BUSY.has(r.status) && a < TRIES) {
        await retry(backoff(a, r.headers.get('retry-after')), 'busy');
        continue;
      }
      if (!r.ok && jm && /response_format|json/i.test(er?.message || '')) {
        jm = false;
        (S.nj ??= {})[p] = 1;
        continue;
      }
      if (!r.ok || er) throw new Error(er?.message || 'Erreur ' + r.status);
      const ch = j.choices?.[0],
        u = normU(j.usage);
      if (primary) calib(ms, u);
      note(r.headers, u, mdl, primary);
      const out = strip(
        A
          ? (j.content || [])
              .filter(b => b.type == 'text')
              .map(b => b.text)
              .join('')
          : (ch?.message?.content ?? '')
      );
      track(ms, out, u, p + '/' + mdl);
      if (!out)
        throw new Error('réponse vide (modèle de raisonnement ? augmentez la longueur maximale)');
      return {
        t: out,
        cut: A ? j.stop_reason == 'max_tokens' : ch?.finish_reason == 'length',
        mode: 'block',
        chunks: 1,
        ms: Date.now() - t0
      };
    }
  } catch (e) {
    if (ac.signal.aborted)
      throw new Error(
        ac.signal.reason == 'timeout'
          ? 'Délai dépassé (' + Math.round(timeout / 1000) + ' s sans réponse du fournisseur).'
          : 'Annulé.'
      );
    throw e;
  } finally {
    clearTimeout(tm);
  }
}
// Texte d'attente affiché pendant une pause de chat() : `why` dit qui fait attendre.
export const waitMsg = (w, why) =>
  (why == 'retry'
    ? 'le fournisseur a refusé l’envoi (limite de débit)'
    : why == 'busy'
      ? 'le fournisseur est surchargé ou en panne'
      : why == 'net'
        ? 'connexion perdue'
        : 'pause pour respecter la limite de débit du fournisseur') +
  (why == 'pace' ? ' : envoi dans ' : ' : nouvelle tentative dans ') +
  w +
  ' s…';
const SUMP =
  "Tu mets à jour la mémoire d'une histoire interactive. Réponds uniquement dans ce format, sections dans cet ordre :\n[RÉSUMÉ]\n(résumé complet mis à jour de toute l'histoire, 1200 caractères maximum, deux parties : Événements, Situation actuelle. N'y mets ni souvenirs, ni relations, ni objectif : ils ont leurs propres sections.)\n[SOUVENIRS]\n- (un ou deux faits durables à retenir, une phrase chacun, ou « aucun »)\n[RELATIONS]\n- Nom: état de sa relation avec le joueur, une phrase (ou « aucun »)\n[LIGNES]\n- (une ligne par message fourni, dans l'ordre, une phrase courte et factuelle)";
const SUMJ =
  "Tu mets à jour la mémoire d'une histoire interactive. Réponds uniquement par un objet JSON valide, sans texte autour, avec ces clés :\n" +
  '{"resume": "récit condensé et mis à jour de toute l\'histoire, 1200 caractères maximum, uniquement le récit (Événements, Situation actuelle), sans souvenirs, sans relations ni l\'objectif (ils ont leurs propres clés)",\n' +
  ' "souvenirs": ["faits durables NOUVEAUX seulement, une phrase chacun ; ne répète pas ceux déjà connus"],\n' +
  ' "relations": {"Nom du personnage": "état de sa relation avec le joueur, une phrase"},\n' +
  ' "lignes": ["une entrée par message fourni, dans l\'ordre, une phrase courte et factuelle"]}\n' +
  'Les tableaux et objets peuvent être vides. Écris en français.\n' +
  "Pour les relations : uniquement les personnages récurrents, jamais les figurants de passage. Reprends EXACTEMENT les noms déjà connus, sans les reformuler ni y ajouter de titre.";
const SUMS = new Set();
const SUM_MAX = 1400;
const LINES_MAX = 24;
export const sect = (t, n) => {
  const m = t.match(
    new RegExp('\\[' + n + '\\][*_ \\t]*([\\s\\S]*?)(?=\\n[^\\n\\w\\[]*\\[[A-ZÉÈ]{4,}\\]|$)', 'i')
  );
  return m ? m[1].trim() : '';
};
const known = () => (ctx.chars || []).map(c => c.name);
const absorb = (s, x) => {
  if (x.souvenirs.length) s.mem.memories = mergeMem(s.mem.memories, x.souvenirs);
  if (Object.keys(x.relations).length)
    s.mem.relations = mergeRel(s.mem.relations, x.relations, known());
};
const persist = async s => {
  const f = await getOne(s.id);
  if (f) {
    f.mem = s.mem;
    await save(f);
  }
  if (app.cur && app.cur.id == s.id && app.cur !== s) app.cur.mem = s.mem;
};
export const asJson = t => {
  const b = t.lastIndexOf('}');
  for (let a = t.indexOf('{'); a >= 0 && a < b; a = t.indexOf('{', a + 1)) {
    try {
      const o = JSON.parse(t.slice(a, b + 1));
      if (o && typeof o == 'object' && typeof o.resume == 'string' && o.resume.trim()) return o;
    } catch (e) {}
  }
  return null;
};
export const toRel = v => {
  const o = {};
  if (Array.isArray(v))
    for (const x of v) {
      if (typeof x == 'string') {
        const i = x.indexOf(':');
        if (i > 0) o[x.slice(0, i).trim()] = x.slice(i + 1).trim();
      } else if (x && typeof x == 'object')
        for (const k of ['nom', 'name', 'personnage'])
          if (typeof x[k] == 'string') o[x[k]] = String(x.relation ?? x.etat ?? x.valeur ?? '');
    }
  else if (v && typeof v == 'object')
    for (const k in v) if (typeof v[k] == 'string') o[k] = v[k];
  return o;
};
export const strs = v =>
  (Array.isArray(v) ? v : typeof v == 'string' ? v.split('\n') : [])
    .map(x => String(x).replace(/^[\s\-•*]+/, '').trim())
    .filter(x => x && !/^aucun/i.test(x));
const addLines = (s, ln, n) => {
  if (ln.length)
    s.mem.lines = [
      ...(s.mem.lines || []),
      ...ln.map((t, k) => ({ i: ln.length == n ? s.mem.upto + k : -1, t }))
    ].slice(-LINES_MAX);
};
const bullets = t =>
  t
    .split('\n')
    .map(v => v.replace(/^[\s\-•*]+/, '').trim())
    .filter(x => x && !/^aucun/i.test(x));
export async function summarize(s) {
  if (!s || SUMS.has(s.id)) return;
  SUMS.add(s.id);
  let shown = false;
  try {
    const big = ANT(S.provider) && !S.ctxLim;
    let go = false;
    const need = () => {
      go = sumGate(s.messages.length - s.mem.upto, big, go);
      return go || (S.ctxLim && omittedCount(s) >= 6);
    };
    while (need()) {
      if (app.cur === s && !app.busy) {
        err('Mise à jour de la mémoire…');
        shown = true;
      }
      const pr = splitSummary(s.mem.summary);
      if (pr.summary && pr.summary !== (s.mem.summary || '').trim()) {
        absorb(s, pr);
        s.mem.summary = pr.summary;
      }
      const om = S.ctxLim ? omittedCount(s) : 0,
        n = Math.min(om >= 6 ? Math.min(om, 12) : 10, s.messages.length - s.mem.upto),
        room = S.ctxLim
          ? Math.max(400, budgetOf(s) - estTok(SUMP) - estTok(s.mem.summary || '') - 300)
          : Infinity,
        parts = [];
      let acc = 0;
      for (const m of s.messages.slice(s.mem.upto, s.mem.upto + n)) {
        let x = (m.role == 'user' ? 'Joueur : ' : 'Narrateur : ') + m.content.replace(/\{\{img::[^}]*\}\}/g, '').trim();
        if (parts.length && acc + estTok(x) > room) break;
        if (!parts.length && estTok(x) > room) x = x.slice(0, Math.floor(room * 3));
        parts.push(x);
        acc += estTok(x);
      }
      const useJson = !S.nj?.[S.provider];
      const { t } = await chat(
        [
          { role: 'system', content: useJson ? SUMJ : SUMP },
          {
            role: 'user',
            content:
              'Résumé actuel :\n' +
              (s.mem.summary || '(vide)') +
              '\n\nRelations connues (reprends ces noms tels quels) :\n' +
              (Object.entries(s.mem.relations || {})
                .map(([k, v]) => '- ' + k + ' : ' + v)
                .join('\n') || '(aucune)') +
              '\n\nSouvenirs déjà retenus (ne les répète pas) :\n' +
              ((s.mem.memories || []).slice(-20).map(x => '- ' + x).join('\n') || '(aucun)') +
              '\n\nMessages à intégrer (' +
              parts.length +
              ') :\n' +
              parts.map((x, i) => i + 1 + '. ' + x).join('\n\n')
          }
        ],
        {
          model: memModel(),
          effort: 'low',
          json: useJson,
          timeout: 300000,
          onWait: (w, why) => {
            if (app.cur === s && !app.busy)
              err(w ? 'Mémoire : ' + waitMsg(w, why) : 'Mise à jour de la mémoire…');
          }
        }
      );
      const j = useJson ? asJson(t) : null;
      if (useJson && !j) {
        S.jf = (S.jf || 0) + 1;
        if (S.jf >= 2) (S.nj ??= {})[S.provider] = 1;
      } else if (useJson) S.jf = 0;
      if (j) {
        const x = splitSummary(j.resume);
        s.mem.summary = clip(x.summary || j.resume, SUM_MAX);
        absorb(s, x);
        s.mem.memories = mergeMem(s.mem.memories, strs(j.souvenirs));
        s.mem.relations = mergeRel(s.mem.relations, toRel(j.relations), known());
        addLines(s, strs(j.lignes), parts.length);
        s.mem.upto += parts.length;
        await persist(s);
        continue;
      }
      const sum = sect(t, 'R[ÉE]SUM[ÉE]');
      if (!sum) throw new Error('réponse inattendue');
      const x = splitSummary(sum);
      s.mem.summary = clip(x.summary || sum, SUM_MAX);
      absorb(s, x);
      s.mem.memories = mergeMem(s.mem.memories, bullets(sect(t, 'SOUVENIRS')));
      s.mem.relations = mergeRel(s.mem.relations, toRel(bullets(sect(t, 'RELATIONS'))), known());
      addLines(s, bullets(sect(t, 'LIGNES')), parts.length);
      s.mem.upto += parts.length;
      await persist(s);
    }
    if (shown && !app.busy) err('');
  } catch (e) {
    if (app.cur === s)
      err(
        'Mémoire non mise à jour (' +
          (/^réponse vide/.test(e.message)
            ? 'le modèle a raisonné sans donner de réponse : choisissez un modèle sans raisonnement dans « Modèle pour la mémoire »'
            : e.message) +
          ') : nouvel essai au prochain tour.'
      );
  } finally {
    SUMS.delete(s.id);
  }
}
