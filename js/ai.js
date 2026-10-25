import { budgetOf, estTok, omittedCount } from './prompt.js';
import { mergeMem, mergeRel, splitSummary } from './memory.js';
import { hintOf, hit429, note, resetDur, wait } from './rate.js';
import { record, usageOf } from './stats.js';
import { PROVIDERS, S, app, ctx } from './state.js';
import { getOne, put } from './store.js';
import { err, strip } from './util.js';

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
    if (x) return record(key, x[0], x[1]);
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
  { max = 0, ac = new AbortController(), od = null, temp = null, top = null, model = '', json = false, onWait = null, primary = false, timeout = 120000 } = {}
) {
  const p = S.provider,
    k = S.keys[p];
  if (!k) throw new Error('clé API manquante');
  let jm = json;
  const mdl = model || S.models[p] || PROVIDERS[p].m;
  const est = ms.reduce((a, m) => a + estTok(m.content), 0) + (max || 500);
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
  try {
    for (let a = 0; ; a++) {
      const r = await fetch(PROVIDERS[p].u + '/chat/completions', {
        method: 'POST',
        signal: ac.signal,
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + k },
        body: JSON.stringify({
          model: mdl,
          messages: ms,
          ...(max ? { max_tokens: max } : {}),
          ...(temp != null ? { temperature: +temp } : {}),
          ...(top != null ? { top_p: +top } : {}),
          ...(od ? { stream: true } : {}),
          ...(jm ? { response_format: { type: 'json_object' } } : {})
        })
      });
      if (r.ok && od && r.body && (r.headers.get('content-type') || '').includes('event-stream')) {
        const rd = r.body.getReader(),
          dc = new TextDecoder();
        let buf = '',
          tt = '',
          fr = '',
          fin = false,
          part = false,
          n = 0,
          us = null;
        const feed = l => {
          if (!l.startsWith('data:')) return;
          const d = l.slice(5).trim();
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
        } catch (e) {
          if (!(tt && (ac.signal.reason == 'timeout' || ac.signal.reason == 'stop'))) throw e;
          part = true;
        }
        const out = strip(tt);
        if (!out)
          throw new Error('réponse vide (modèle de raisonnement ? augmentez la longueur maximale)');
        if (primary) calib(ms, us);
        note(r.headers, us, mdl, primary);
        track(ms, out, us, p + '/' + mdl);
        return {
          t: out,
          cut: fr == 'length',
          mode: 'stream',
          chunks: n,
          ms: Date.now() - t0,
          partial: part
        };
      }
      const j = await r.json().catch(() => ({}));
      const er = (Array.isArray(j) ? j[0] : j)?.error;
      if (r.status == 429 && a < 3) {
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
        let left = secs;
        await hold(() => left--, 'retry');
        continue;
      }
      if (!r.ok && jm && /response_format|json/i.test(er?.message || '')) {
        jm = false;
        (S.nj ??= {})[p] = 1;
        continue;
      }
      if (!r.ok || er) throw new Error(er?.message || 'Erreur ' + r.status);
      const ch = j.choices?.[0];
      if (primary) calib(ms, j.usage);
      note(r.headers, j.usage, mdl, primary);
      const out = strip(ch?.message?.content ?? '');
      track(ms, out, j.usage, p + '/' + mdl);
      if (!out)
        throw new Error('réponse vide (modèle de raisonnement ? augmentez la longueur maximale)');
      return {
        t: out,
        cut: ch.finish_reason == 'length',
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
    await put(f);
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
    const need = () => s.messages.length - s.mem.upto >= 40 || (S.ctxLim && omittedCount(s) >= 6);
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
          model: S.memModels?.[S.provider] || '',
          json: useJson,
          timeout: 300000,
          onWait: w => {
            if (app.cur === s && !app.busy)
              err(
                w
                  ? 'Mémoire : quota du fournisseur atteint, nouvel essai dans ' + w + ' s…'
                  : 'Mise à jour de la mémoire…'
              );
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
        s.mem.summary = (x.summary || j.resume.trim()).slice(0, SUM_MAX);
        absorb(s, x);
        s.mem.memories = mergeMem(s.mem.memories, strs(j.souvenirs));
        s.mem.relations = mergeRel(s.mem.relations, toRel(j.relations), known());
        const ln = strs(j.lignes);
        if (ln.length)
          s.mem.lines = [
            ...(s.mem.lines || []),
            ...ln.map((t, k) => ({ i: s.mem.upto + k, t }))
          ].slice(-LINES_MAX);
        s.mem.upto += parts.length;
        await persist(s);
        continue;
      }
      const sum = sect(t, 'R[ÉE]SUM[ÉE]');
      if (!sum) throw new Error('réponse inattendue');
      const x = splitSummary(sum);
      s.mem.summary = (x.summary || sum).slice(0, SUM_MAX);
      absorb(s, x);
      s.mem.memories = mergeMem(s.mem.memories, bullets(sect(t, 'SOUVENIRS')));
      s.mem.relations = mergeRel(s.mem.relations, toRel(bullets(sect(t, 'RELATIONS'))), known());
      const li = bullets(sect(t, 'LIGNES'));
      if (li.length)
        s.mem.lines = [
          ...(s.mem.lines || []),
          ...li.map((t, k) => ({ i: s.mem.upto + k, t }))
        ].slice(-LINES_MAX);
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
