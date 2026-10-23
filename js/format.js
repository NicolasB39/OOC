import { IMG, app, ctx } from './state.js';
import { esc, ikey } from './util.js';

const fmt = t =>
  t
    .replace(/\*\*([^*]+?)\*\*/g, '<b>$1</b>')
    .replace(/\*([^*]+?)\*/g, '<span class="act">$1</span>')
    .replace(/(^|[\s(])_([^_\n]+?)_(?=$|[\s.,;:!?)])/g, '$1<span class="act">$2</span>')
    .replace(/\n?^-{3,}$\n?/gm, '<hr>')
    .replace(/^&gt; ?(.*)$\n?/gm, '<span class="q">$1</span>');
export const CHX = /<choix>[\s\S]*?(?:<\/choix>|$)/gi;
export const ETX = /<etat>[\s\S]*?(?:<\/etat>|$)/gi;
export const parseEtat = t => {
  const m = t.match(/<etat>([\s\S]*?)<\/etat>/i);
  if (!m) return [];
  return m[1]
    .split('\n')
    .map(l => {
      const x = l.replace(/^[\s\-*•]+/, '').replace(/\*\*/g, ''),
        i = x.indexOf(':');
      return i > 0 ? [x.slice(0, i).trim(), x.slice(i + 1).trim()] : null;
    })
    .filter(e => e && e[0] && e[1])
    .slice(0, 12);
};
export const lastEtat = ms => {
  for (let i = ms.length - 1; i >= 0; i--) {
    if (ms[i].role != 'assistant') continue;
    const e = parseEtat(ms[i].content);
    if (e.length) return e;
  }
  return null;
};
const imgFor = c => {
  c = c.trim();
  const k = ikey(c);
  if (IMG[c.toLowerCase()] || IMG[k]) return IMG[c.toLowerCase()] || IMG[k];
  const m = ctx.images.filter(i => ikey(i.code).endsWith('_' + k));
  return m.length == 1 ? m[0].url : '';
};
const imgTag = c => {
  const u = imgFor(c);
  return u
    ? `<img class="pic" src="${esc(u)}" alt="" loading="lazy" decoding="async">`
    : `<span class="miss">image introuvable : ${esc(c.trim())}</span>`;
};
export const choicesOf = t => {
  const m = t.match(/<choix>([\s\S]*?)<\/choix>/i);
  return m
    ? m[1]
        .split('\n')
        .map(x => x.replace(/^\s*(\d+[.)]|[-*])\s*/, '').trim())
        .filter(Boolean)
        .slice(0, 3)
    : [];
};
export const body = t =>
  t
    .replace(CHX, '')
    .replace(ETX, '')
    .replace(/\{\{user\}\}/gi, app.cur?.pname?.trim() || 'Joueur')
    .split(/\{\{img::([^}]*)\}\}/g)
    .map((s, i) => (i % 2 ? imgTag(s) : fmt(esc(s.replace(/^\n+|\n+$/g, '')))))
    .join('');
