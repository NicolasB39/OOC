import { IMG, app, ctx } from './state.js';
import { el, ikey } from './util.js';

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
export const split = raw => {
  const o = { content: raw.replace(CHX, '').replace(ETX, '').trim() },
    c = choicesOf(raw),
    s = parseEtat(raw);
  if (c.length) o.choices = c;
  if (s.length) o.state = s;
  return o;
};
export const raw = m =>
  m.content +
  (m.state?.length ? '\n\n<etat>\n' + m.state.map(([k, v]) => k + ': ' + v).join('\n') + '\n</etat>' : '') +
  (m.choices?.length
    ? '\n\n<choix>\n' + m.choices.map((c, i) => i + 1 + '. ' + c).join('\n') + '\n</choix>'
    : '');
export const lastEtat = ms => {
  for (let i = ms.length - 1; i >= 0; i--)
    if (ms[i].role == 'assistant' && ms[i].state?.length) return ms[i].state;
  return null;
};
const imgFor = c => {
  c = c.trim();
  const k = ikey(c);
  if (IMG[c.toLowerCase()] || IMG[k]) return IMG[c.toLowerCase()] || IMG[k];
  const m = ctx.images.filter(i => ikey(i.code).endsWith('_' + k));
  return m.length == 1 ? m[0].url : '';
};
const imgNode = c => {
  const u = imgFor(c);
  return u
    ? el('img', { class: 'pic', src: u, alt: '', loading: 'lazy', decoding: 'async' })
    : el('span', { class: 'miss', text: 'image introuvable : ' + c.trim() });
};
const INL = /\*\*([^*]+?)\*\*|\*([^*]+?)\*|(^|[\s(])_([^_\n]+?)_(?=$|[\s.,;:!?)])/g;
const inline = (s, out) => {
  let i = 0,
    m;
  INL.lastIndex = 0;
  while ((m = INL.exec(s))) {
    if (m.index > i) out.push(s.slice(i, m.index));
    if (m[1] != null) out.push(el('b', { text: m[1] }));
    else if (m[2] != null) out.push(el('span', { class: 'act', text: m[2] }));
    else {
      if (m[3]) out.push(m[3]);
      out.push(el('span', { class: 'act', text: m[4] }));
    }
    i = INL.lastIndex;
  }
  if (i < s.length) out.push(s.slice(i));
};
const blocks = (s, out) => {
  let buf = [],
    q = false;
  const flush = () => {
    const t = buf.join('\n'),
      k = q;
    buf = [];
    q = false;
    if (!t.trim()) return;
    const c = [];
    inline(t, c);
    out.push(el('p', k ? { class: 'q' } : null, c));
  };
  for (const ln of s.split('\n')) {
    if (/^-{3,}$/.test(ln)) {
      flush();
      out.push(el('hr'));
    } else if (/^> ?/.test(ln)) {
      if (!q) flush();
      q = true;
      buf.push(ln.replace(/^> ?/, ''));
    } else if (!ln.trim()) {
      flush();
    } else {
      if (q) flush();
      buf.push(ln);
    }
  }
  flush();
};
export const line = t => {
  const out = [];
  inline(t, out);
  return out;
};
export const body = t => {
  const out = [];
  t.replace(CHX, '')
    .replace(ETX, '')
    .replace(/\{\{user\}\}/gi, app.cur?.pname?.trim() || 'Joueur')
    .replace(/\s*\{\{[^}]*$/, '')
    .split(/\{\{img::([^}]*)\}\}/g)
    .forEach((x, i) => (i % 2 ? out.push(imgNode(x)) : blocks(x.replace(/^\n+|\n+$/g, ''), out)));
  return out;
};
