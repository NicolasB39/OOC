import { S, app } from './state.js';
import { LS } from './util.js';

let db;
export const clean = x => {
  if (!x || typeof x.id != 'string' || !x.id || !Array.isArray(x.messages)) return null;
  const s = v => (typeof v == 'string' ? v : ''),
    n = v => (Number.isFinite(+v) && +v > 0 ? +v : 0),
    o = v => (v === '' || v == null || !Number.isFinite(+v) ? null : +v);
  const messages = x.messages
    .filter(m => m && (m.role == 'user' || m.role == 'assistant') && typeof m.content == 'string')
    .map(m => {
      const r = { role: m.role, content: m.content };
      if (Array.isArray(m.alts) && m.alts.length > 1 && m.alts.every(a => typeof a == 'string')) {
        r.alts = m.alts;
        r.ai = Math.min(Math.max(0 | m.ai, 0), m.alts.length - 1);
      }
      return r;
    });
  const mm = x.mem || {};
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
    maxTok: n(x.maxTok),
    temp: o(x.temp),
    top: o(x.top),
    memN: o(x.memN),
    loreDepth: n(x.loreDepth),
    loreMax: n(x.loreMax),
    messages,
    mem: {
      summary: s(mm.summary),
      memories: Array.isArray(mm.memories) ? mm.memories.filter(v => typeof v == 'string') : [],
      upto: Math.min(n(mm.upto), messages.length)
    }
  };
};
const pvOf = s => {
  const m = s.messages?.at(-1);
  return m
    ? m.content
        .replace(/<choix>[\s\S]*?(?:<\/choix>|$)/gi, '')
        .replace(/\{\{img::[^}]*\}\}/g, '')
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
export const getOne = id => tx('scenarios', 'readonly', s => s.get(id));
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
