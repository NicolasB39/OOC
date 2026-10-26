import { uid } from './util.js';

export const TOMB_TTL = 1.5552e10;
export const syncable = s => !(s.remote && !(s.messages ? s.messages.length : s.n));

export function merge(loc, rem, t1, t2, { seen = {}, now = Date.now(), nid = uid } = {}) {
  const tomb = { ...t1 };
  let up = false;
  for (const k in t2) if ((t2[k] || 0) > (tomb[k] || 0)) tomb[k] = t2[k];
  for (const k in tomb) if ((t2[k] || 0) < tomb[k]) up = true;
  for (const k in tomb)
    if (now - tomb[k] > TOMB_TTL) {
      delete tomb[k];
      up = true;
    }
  const L = new Map(loc.filter(syncable).map(s => [s.id, s])),
    R = new Map(rem.filter(syncable).map(s => [s.id, s]));
  const keep = [],
    toLocal = [],
    delLocal = [],
    copies = [],
    next = {};
  for (const id of new Set([...L.keys(), ...R.keys()])) {
    const l = L.get(id),
      r = R.get(id),
      p = !r || (l && l.updated >= r.updated) ? l : r;
    if ((tomb[id] || 0) >= p.updated) {
      if (l) delLocal.push(id);
      if (r) up = true;
      continue;
    }
    const base = seen[id];
    if (l && r && base != null && l.updated !== r.updated && l.updated > base && r.updated > base) {
      const lose = p === l ? r : l,
        c = { ...lose, id: nid(), name: lose.name + ' (conflit)', updated: now };
      keep.push(c);
      toLocal.push(c);
      copies.push([c, lose.id, lose === r]);
      next[c.id] = c.updated;
      up = true;
    }
    keep.push(p);
    next[id] = p.updated;
    if (p === r && (!l || r.updated > l.updated)) toLocal.push(r);
    if (p === l && (!r || l.updated > r.updated)) up = true;
  }
  return { keep, toLocal, delLocal, copies, tomb, up, seen: next };
}
