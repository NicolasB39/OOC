// Statistiques d'usage : d[jour][fournisseur/modèle] = [entrée, sortie, requêtes, requêtes estimées]
export const STATS = { v: 1, d: {} };
export const SESSION = {};

let hook = null;
export const watch = fn => (hook = fn);

const two = n => String(n).padStart(2, '0');
export const dayKey = (t = Date.now()) => {
  const d = new Date(t);
  return d.getFullYear() + '-' + two(d.getMonth() + 1) + '-' + two(d.getDate());
};
export const monthKey = k => k.slice(0, 7);
export const splitKey = k => {
  const i = k.indexOf('/');
  return i < 0 ? ['', k] : [k.slice(0, i), k.slice(i + 1)];
};

export const usageOf = u => {
  if (!u) return null;
  const p = +u.prompt_tokens || +u.input_tokens || 0,
    t = +u.total_tokens || 0,
    c = Math.max(+u.completion_tokens || +u.output_tokens || 0, t - p);
  return p || c > 0 ? [p, Math.max(0, c)] : null;
};

const bump = (map, key, p, c, est) => {
  const e = (map[key] ??= [0, 0, 0, 0]);
  e[0] += p;
  e[1] += c;
  e[2] += 1;
  if (est) e[3] += 1;
};

export const record = (key, p, c, est = false, t = Date.now()) => {
  if (!key || !(p > 0 || c > 0)) return;
  bump((STATS.d[dayKey(t)] ??= {}), key, p, c, est);
  bump(SESSION, key, p, c, est);
  hook?.();
};

export const load = v => {
  if (v && typeof v.d == 'object' && v.d) STATS.d = v.d;
};
export const clear = () => {
  STATS.d = {};
  for (const k in SESSION) delete SESSION[k];
  hook?.();
};

export const merge = (...maps) => {
  const o = {};
  for (const m of maps)
    for (const k in m || {}) {
      const e = (o[k] ??= [0, 0, 0, 0]);
      for (let i = 0; i < 4; i++) e[i] += m[k][i] || 0;
    }
  return o;
};
export const dayMap = (k, st = STATS) => st.d[k] || {};
export const monthMap = (ym, st = STATS) =>
  merge(...Object.keys(st.d).filter(k => k.startsWith(ym)).map(k => st.d[k]));
export const total = map => {
  const o = [0, 0, 0, 0];
  for (const k in map) for (let i = 0; i < 4; i++) o[i] += map[k][i] || 0;
  return o;
};
export const monthDays = (ym, st = STATS) => {
  const [y, m] = ym.split('-').map(Number),
    n = new Date(y, m, 0).getDate(),
    o = [];
  for (let d = 1; d <= n; d++) {
    const k = ym + '-' + two(d);
    o.push([k, total(st.d[k] || {})]);
  }
  return o;
};
