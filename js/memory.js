import { nz } from './util.js';

export const REL_MAX = 12;
export const MEM_MAX = 60;

const key = s =>
  nz(String(s))
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
const parts = s => key(s).split(' ').filter(Boolean);
const words = s => new Set(parts(s).filter(w => w.length > 3));

export const sameName = (a, b) => {
  const A = parts(a),
    B = parts(b);
  if (!A.length || !B.length) return false;
  const [x, y] = A.length <= B.length ? [A, B] : [B, A];
  return x.every(w => y.includes(w));
};

export const near = (a, b) => {
  const A = words(a),
    B = words(b);
  if (!A.size || !B.size) return key(a) === key(b);
  let n = 0;
  for (const w of A) if (B.has(w)) n++;
  return n / Math.min(A.size, B.size) >= 0.6;
};

const marks = s => (String(s).normalize('NFD').match(/[\u0300-\u036f]/g) || []).length;
export const better = (a, b) => (marks(b) > marks(a) || (!a.trim() && b.trim()) ? b : a);

export function mergeRel(cur = {}, inc = {}, keep = [], max = REL_MAX) {
  const out = { ...cur };
  for (const [n, v] of Object.entries(inc)) {
    const name = String(n).trim(),
      val = String(v).trim();
    if (!name || !val || /^aucun/i.test(val)) continue;
    const hit = Object.keys(out).find(x => sameName(x, name)),
      k = hit ? better(hit, name) : name;
    if (hit) delete out[hit];
    delete out[k];
    out[k] = val;
  }
  for (const k of Object.keys(out)) {
    if (Object.keys(out).length <= max) break;
    if (!keep.some(n => sameName(n, k))) delete out[k];
  }
  return out;
}

export function mergeMem(cur = [], inc = [], max = MEM_MAX) {
  const out = [...cur];
  for (const raw of inc) {
    const t = String(raw).trim();
    if (!t) continue;
    const i = out.findIndex(x => near(x, t));
    if (i >= 0) out.splice(i, 1);
    out.push(t);
  }
  return out.slice(-max);
}

// Sépare un résumé « pollué » : tout ce qui suit un intitulé Souvenirs / Relations / Lignes / Objectif
// appartient à d'autres champs. Les souvenirs et relations repérés sont rendus pour être fusionnés.
const HEAD =
  /^[\s#>*_\-[]*(souvenirs?|relations?|lignes|objectifs?)(?:\s+(?:r[ée]centes?|actuel(?:le)?s?|courants?|durables?|en cours|principal|principaux))?[\s\]*_]*(?::|$)/i;
export function splitSummary(t) {
  const src = String(t || ''),
    ls = src.split(/\r?\n/),
    i = ls.findIndex(l => HEAD.test(l));
  if (i < 0) return { summary: src.trim(), souvenirs: [], relations: {} };
  const souvenirs = [],
    relations = {};
  let mode = '';
  const take = x => {
    const v = x.replace(/^[\s\-•*]+/, '').trim();
    if (!v || /^aucun/i.test(v)) return;
    if (mode == 'souv') souvenirs.push(v);
    else if (mode == 'rel') {
      const k = v.indexOf(':');
      if (k > 0) relations[v.slice(0, k).replace(/[*_]/g, '').trim()] = v.slice(k + 1).trim();
    }
  };
  for (const l of ls.slice(i)) {
    const h = l.match(HEAD);
    if (h) {
      const w = nz(h[1]);
      mode = w.startsWith('souv') ? 'souv' : w.startsWith('rel') ? 'rel' : '';
      take(l.slice(h[0].length));
    } else take(l);
  }
  return { summary: ls.slice(0, i).join('\n').trim(), souvenirs, relations };
}

export const cutLines = (lines, i) => (lines || []).filter(l => l.i < i);
export const clip = (t, max) => {
  t = String(t || '').trim();
  if (t.length <= max) return t;
  const c = t.slice(0, max),
    m = c.match(/^[\s\S]*[.!?…»)](?=\s|$)/);
  return m && m[0].length > max * 0.6 ? m[0] : c.replace(/\s+\S*$/, '') + '…';
};
