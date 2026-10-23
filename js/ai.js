import { CHX } from './format.js';
import { PROVIDERS, S, app } from './state.js';
import { getOne, put } from './store.js';
import { $, strip } from './util.js';

export async function chat(
  ms,
  { max = 0, ac = new AbortController(), od = null, temp = null, top = null } = {}
) {
  const p = S.provider,
    k = S.keys[p];
  if (!k) throw new Error('clé API manquante');
  let tm;
  const arm = () => {
    clearTimeout(tm);
    tm = setTimeout(() => ac.abort('timeout'), 120000);
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
          model: S.models[p] || PROVIDERS[p].m,
          messages: ms,
          ...(max ? { max_tokens: max } : {}),
          ...(temp != null ? { temperature: +temp } : {}),
          ...(top != null ? { top_p: +top } : {}),
          ...(od ? { stream: true } : {})
        })
      });
      if (r.ok && od && r.body && (r.headers.get('content-type') || '').includes('event-stream')) {
        const rd = r.body.getReader(),
          dc = new TextDecoder();
        let buf = '',
          tt = '',
          fr = '',
          fin = false,
          n = 0;
        const feed = l => {
          if (!l.startsWith('data:')) return;
          const d = l.slice(5).trim();
          if (d == '[DONE]') {
            fin = true;
            return;
          }
          try {
            const c = JSON.parse(d).choices?.[0],
              dl = c?.delta;
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
          if (!(tt && ac.signal.reason == 'timeout')) throw e;
        }
        const out = strip(tt);
        if (!out)
          throw new Error('réponse vide (modèle de raisonnement ? augmentez la longueur maximale)');
        return { t: out, cut: fr == 'length', mode: 'stream', chunks: n, ms: Date.now() - t0 };
      }
      const j = await r.json().catch(() => ({}));
      if (r.status == 429 && a < 1) {
        await new Promise(x =>
          setTimeout(x, Math.min(+r.headers.get('retry-after') || 5, 20) * 1000)
        );
        continue;
      }
      const er = (Array.isArray(j) ? j[0] : j)?.error;
      if (!r.ok || er) throw new Error(er?.message || 'Erreur ' + r.status);
      const ch = j.choices?.[0];
      const out = strip(ch?.message?.content ?? '');
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
          ? 'Délai dépassé (120 s sans réponse du fournisseur).'
          : 'Annulé.'
      );
    throw e;
  } finally {
    clearTimeout(tm);
  }
}
const SUMP =
  "Tu mets à jour la mémoire d'une histoire interactive. Intègre les nouveaux messages au résumé actuel et réponds uniquement dans ce format :\n[RÉSUMÉ]\n(résumé complet mis à jour, concis, en trois parties : Événements récents, Relations des personnages, Objectif actuel)\n[SOUVENIRS]\n- (un ou deux souvenirs marquants à retenir à long terme, une phrase chacun, ou « aucun »)";
const SUMS = new Set();
export async function summarize(s) {
  if (!s || SUMS.has(s.id)) return;
  SUMS.add(s.id);
  let shown = false;
  try {
    while (s.messages.length - s.mem.upto >= 40) {
      if (app.cur === s && !app.busy) {
        $('#err').textContent = 'Mise à jour de la mémoire…';
        shown = true;
      }
      const b = s.messages
        .slice(s.mem.upto, s.mem.upto + 10)
        .map(
          m =>
            (m.role == 'user' ? 'Joueur : ' : 'Narrateur : ') +
            m.content
              .replace(/\{\{img::[^}]*\}\}/g, '')
              .replace(CHX, '')
              .trim()
        )
        .join('\n\n');
      const { t } = await chat([
        { role: 'system', content: SUMP },
        {
          role: 'user',
          content:
            'Résumé actuel :\n' +
            (s.mem.summary || '(vide)') +
            '\n\nNouveaux messages à intégrer :\n' +
            b
        }
      ]);
      const r = t.match(/\[R[ÉE]SUM[ÉE]\]([\s\S]*?)(?=\[SOUVENIRS\]|$)/i);
      if (!r || !r[1].trim()) throw new Error('réponse inattendue');
      const m = t.match(/\[SOUVENIRS\]([\s\S]*)$/i);
      s.mem.summary = r[1].trim();
      for (const x of (m ? m[1] : '').split('\n').map(v => v.replace(/^[\s\-•*]+/, '').trim()))
        if (x && !/^aucun/i.test(x) && !s.mem.memories.includes(x)) s.mem.memories.push(x);
      s.mem.upto += 10;
      const f = await getOne(s.id);
      if (f) {
        f.mem = s.mem;
        await put(f);
      }
      if (app.cur && app.cur.id == s.id && app.cur !== s) app.cur.mem = s.mem;
    }
    if (shown && !app.busy) $('#err').textContent = '';
  } catch (e) {
    if (app.cur === s)
      $('#err').textContent =
        'Mémoire non mise à jour (' + e.message + ') : nouvel essai au prochain tour.';
  } finally {
    SUMS.delete(s.id);
  }
}
