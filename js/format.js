import { IMG, app } from './state.js';
import { esc } from './util.js';

const fmt = t =>
  t
    .replace(/\*\*([^*]+?)\*\*/g, '<b>$1</b>')
    .replace(/\*([^*]+?)\*/g, '<span class="act">$1</span>')
    .replace(/(^|[\s(])_([^_\n]+?)_(?=$|[\s.,;:!?)])/g, '$1<span class="act">$2</span>')
    .replace(/\n?^-{3,}$\n?/gm, '<hr>')
    .replace(/^&gt; ?(.*)$\n?/gm, '<span class="q">$1</span>');
export const CHX = /<choix>[\s\S]*?(?:<\/choix>|$)/gi;
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
    .replace(/\{\{user\}\}/gi, app.cur?.pname?.trim() || 'Joueur')
    .split(/\{\{img::([^}]*)\}\}/g)
    .map((s, i) =>
      i % 2
        ? IMG[s.trim().toLowerCase()]
          ? `<img class="pic" src="${IMG[s.trim().toLowerCase()]}" alt="" loading="lazy" decoding="async">`
          : '\n'
        : fmt(esc(s.replace(/^\n+|\n+$/g, '')))
    )
    .join('');
