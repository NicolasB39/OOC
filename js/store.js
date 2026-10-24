import { S, app } from './state.js';
import { split } from './format.js';
import { LS, plain } from './util.js';

let db;
const one = m => {
  const r = { role: m.role, content: m.content };
  if (Array.isArray(m.choices) || Array.isArray(m.state)) {
    const c = (m.choices || []).filter(x => typeof x == 'string').slice(0, 3),
      t = (m.state || []).filter(e => Array.isArray(e) && e.length == 2).slice(0, 12);
    if (c.length) r.choices = c;
    if (t.length) r.state = t;
    return r;
  }
  return { role: m.role, ...split(m.content) };
};
export const clean = x => {
  if (!x || typeof x.id != 'string' || !x.id || !Array.isArray(x.messages)) return null;
  const s = v => (typeof v == 'string' ? v : ''),
    n = v => (Number.isFinite(+v) && +v > 0 ? +v : 0),
    o = v => (v === '' || v == null || !Number.isFinite(+v) ? null : +v);
  const messages = x.messages
    .filter(m => m && (m.role == 'user' || m.role == 'assistant') && typeof m.content == 'string')
    .map(m => {
      const r = one(m);
      const a = Array.isArray(m.alts)
        ? m.alts.map(v =>
            typeof v == 'string'
              ? { role: m.role, ...split(v) }
              : v && typeof v.content == 'string'
                ? one({ ...v, role: m.role })
                : null
          )
        : null;
      if (a && a.length > 1 && a.every(Boolean)) {
        r.alts = a.map(({ role, ...rest }) => rest);
        r.ai = Math.min(Math.max(0 | m.ai, 0), r.alts.length - 1);
      }
      return r;
    });
  const mm = x.mem || {};
  const rel = {};
  if (mm.relations && typeof mm.relations == 'object')
    for (const k of Object.keys(mm.relations).slice(0, 20))
      if (typeof mm.relations[k] == 'string') rel[k] = mm.relations[k];
  return {
    id: x.id,
    name: s(x.name).trim() || 'Sans titre',
    updated: n(x.updated) || Date.now(),
    remote: !!x.remote,
    folder: s(x.folder),
    system: s(x.system),
    avatar: s(x.avatar),
    pname: s(x.pname),
    note: s(x.note),
    choicePrompt: s(x.choicePrompt),
    noChoices: !!x.noChoices,
    noPre: !!x.noPre,
    cover: typeof x.cover == 'string' && x.cover.startsWith('data:') ? x.cover : '',
    maxTok: n(x.maxTok),
    temp: o(x.temp),
    top: o(x.top),
    memN: o(x.memN),
    loreDepth: n(x.loreDepth),
    loreMax: n(x.loreMax),
    stat: typeof x.stat == 'boolean' ? x.stat : undefined,
    statFields: s(x.statFields),
    messages,
    mem: {
      summary: s(mm.summary),
      memories: Array.isArray(mm.memories) ? mm.memories.filter(v => typeof v == 'string') : [],
      lines: Array.isArray(mm.lines)
        ? mm.lines
            .map(v => (typeof v == 'string' ? { i: -1, t: v } : v))
            .filter(v => v && typeof v.t == 'string')
            .map(v => ({ i: 0 | v.i, t: v.t }))
            .slice(-24)
        : [],
      relations: rel,
      win: Math.min(n(mm.win), messages.length),
      upto: Math.min(n(mm.upto), messages.length)
    }
  };
};
const pvOf = s => {
  const m = s.messages?.at(-1);
  return m
    ? plain(m.content, s.pname)
        .replace(/[*_#>]/g, '')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, 100)
    : '';
};
const META = s => ({
  id: s.id,
  name: s.name,
  updated: s.updated,
  remote: s.remote,
  folder: s.folder,
  cover: s.cover || '',
  n: s.messages?.length || 0,
  pv: pvOf(s)
});
export const openDB = () =>
  new Promise((res, rej) => {
    const r = indexedDB.open('histoires', 3);
    r.onupgradeneeded = e => {
      const d = r.result,
        t = r.transaction;
      if (e.oldVersion < 1) {
        d.createObjectStore('scenarios', { keyPath: 'id' });
        d.createObjectStore('settings', { keyPath: 'key' });
      }
      if (e.oldVersion < 2) d.createObjectStore('meta', { keyPath: 'id' });
      if (e.oldVersion < 3)
        t.objectStore('scenarios').openCursor().onsuccess = ev => {
          const c = ev.target.result;
          if (c) {
            t.objectStore('meta').put(META(c.value));
            c.continue();
          }
        };
    };
    r.onsuccess = () => {
      db = r.result;
      res();
    };
    r.onerror = () => rej(r.error);
  });
const tx = (st, m, fn) =>
  new Promise((res, rej) => {
    const t = db.transaction(st, m);
    const rq = fn(t.objectStore(st));
    t.oncomplete = () => res(rq && rq.result);
    t.onerror = () => rej(t.error);
  });
export const getAll = () => tx('meta', 'readonly', s => s.getAll());
export const getFull = () => tx('scenarios', 'readonly', s => s.getAll());
export const getOne = id => tx('scenarios', 'readonly', s => s.get(id)).then(r => (r ? clean(r) : r));
const both = fn =>
  new Promise((res, rej) => {
    const t = db.transaction(['scenarios', 'meta'], 'readwrite');
    fn(t.objectStore('scenarios'), t.objectStore('meta'));
    t.oncomplete = () => res();
    t.onerror = () => rej(t.error);
  });
export const put = o => {
  LS.set('bkd', 1);
  return both((a, m) => {
    a.put(o);
    m.put(META(o));
  });
};
export const del = id => {
  LS.set('bkd', 1);
  LS.del('draft:' + id);
  return both((a, m) => {
    a.delete(id);
    m.delete(id);
  });
};
export const loadSet = () =>
  tx('settings', 'readonly', s => s.get('main')).then(r => {
    if (r) Object.assign(S, r.value);
  });
export const saveSet = () => tx('settings', 'readwrite', s => s.put({ key: 'main', value: S }));
export const save = (s = app.cur) => {
  s.updated = Date.now();
  return put(s);
};
