import { S, app } from './state.js';
import { split } from './format.js';
import { LS, plain, uid } from './util.js';
import { REL_MAX, cutLines } from './memory.js';

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
    .map((m, i, all) => {
      const r = one(m);
      if (Number.isFinite(+m.t) && +m.t > 0) r.t = +m.t;
      const a = Array.isArray(m.alts) && i == all.length - 1
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
    for (const k of Object.keys(mm.relations).slice(-REL_MAX))
      if (typeof mm.relations[k] == 'string') rel[k] = mm.relations[k];
  return {
    id: x.id,
    name: s(x.name).trim() || 'Sans titre',
    updated: n(x.updated) || Date.now(),
    remote: !!x.remote,
    pin: !!x.pin,
    folder: s(x.folder),
    system: s(x.system),
    avatar: s(x.avatar),
    pname: s(x.pname),
    note: s(x.note),
    intro: s(x.intro),
    choicePrompt: s(x.choicePrompt),
    noChoices: !!x.noChoices,
    noStyle: !!x.noStyle,
    noPre: !!x.noPre,
    fullBody: !!x.fullBody,
    cover: typeof x.cover == 'string' && x.cover.startsWith('data:') ? x.cover : '',
    accent: typeof x.accent == 'string' && /^#[0-9a-f]{6}$/i.test(x.accent) ? x.accent.toLowerCase() : '',
    maxTok: n(x.maxTok),
    effort: ['low', 'medium', 'high'].includes(x.effort) ? x.effort : '',
    models:
      x.models && typeof x.models == 'object'
        ? Object.fromEntries(Object.entries(x.models).filter(([, v]) => typeof v == 'string' && v.trim()))
        : {},
    temp: o(x.temp),
    top: o(x.top),
    memN: o(x.memN),
    recallN: o(x.recallN),
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
// Nouvelle histoire qui reprend jusqu'au message i inclus ; l'originale n'est pas touchée.
// Le résumé reste tel quel : il peut raconter la suite, l'appelant le signale.
export const forkOf = (s, i, name, id) => {
  const c = structuredClone(s),
    n = i + 1;
  Object.assign(c, { id, name, pin: false });
  c.messages = c.messages.slice(0, n);
  c.mem.lines = cutLines(c.mem.lines, n);
  c.mem.win = Math.min(c.mem.win || 0, n);
  c.mem.upto = Math.min(c.mem.upto, n);
  return c;
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
  pin: !!s.pin,
  folder: s.folder,
  n: s.messages?.length || 0,
  pv: pvOf(s)
});
const CH = 25;
const K = {};
const pack = ms => {
  const a = [];
  for (let i = 0; i < ms.length; i += CH) a.push(JSON.stringify(ms.slice(i, i + CH)));
  return a;
};
const range = (id, from = 0) => IDBKeyRange.bound([id, from], [id, Infinity]);
export const openDB = () =>
  new Promise((res, rej) => {
    // Nom historique de la base : le renommer reviendrait à repartir d'une base vide.
    const r = indexedDB.open('histoires', 4);
    r.onupgradeneeded = e => {
      const d = r.result,
        t = r.transaction,
        o = e.oldVersion;
      if (o < 1) {
        d.createObjectStore('scenarios', { keyPath: 'id' });
        d.createObjectStore('settings', { keyPath: 'key' });
      }
      if (o < 2) d.createObjectStore('meta', { keyPath: 'id' });
      if (o < 4) {
        d.createObjectStore('chunks', { keyPath: 'k' });
        d.createObjectStore('covers', { keyPath: 'id' });
      }
      if (o && o < 4)
        t.objectStore('scenarios').openCursor().onsuccess = ev => {
          const c = ev.target.result;
          if (!c) return;
          const { messages = [], cover, ...h } = c.value;
          h.nc = Math.ceil(messages.length / CH);
          h.rev = uid();
          for (let i = 0; i < messages.length; i += CH)
            t.objectStore('chunks').put({ k: [h.id, i / CH], m: messages.slice(i, i + CH) });
          if (cover) t.objectStore('covers').put({ id: h.id, d: cover });
          t.objectStore('meta').put(META(c.value));
          c.update(h);
          c.continue();
        };
    };
    r.onblocked = () =>
      rej(new Error('Une autre fenêtre de l’application est ouverte : fermez-la, puis rechargez cette page.'));
    r.onsuccess = () => {
      db = r.result;
      db.onversionchange = () => db.close();
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
const read = (names, fn) =>
  new Promise((res, rej) => {
    const t = db.transaction(names, 'readonly'),
      o = {};
    for (const [k, [n, q]] of Object.entries(fn)) {
      const r = q === undefined ? t.objectStore(n).getAll() : t.objectStore(n)[q instanceof IDBKeyRange ? 'getAll' : 'get'](q);
      r.onsuccess = () => (o[k] = r.result);
    }
    t.oncomplete = () => res(o);
    t.onerror = () => rej(t.error);
  });
export const getAll = () =>
  read(['meta', 'covers'], { m: ['meta'], c: ['covers'] }).then(({ m, c }) => {
    const cv = new Map(c.map(x => [x.id, x.d]));
    return m.map(x => ({ ...x, cover: cv.get(x.id) || '' }));
  });
export const getFull = () =>
  read(['scenarios', 'chunks', 'covers'], { h: ['scenarios'], k: ['chunks'], c: ['covers'] }).then(
    ({ h, k, c }) => {
      const ms = {},
        cv = new Map(c.map(x => [x.id, x.d]));
      for (const x of k) (ms[x.k[0]] ??= []).push(...x.m);
      return h.map(({ nc, rev, ...x }) => ({ ...x, messages: x.messages || ms[x.id] || [], cover: cv.get(x.id) || '' }));
    }
  );
export const getOne = id =>
  read(['scenarios', 'chunks', 'covers'], {
    h: ['scenarios', id],
    k: ['chunks', range(id)],
    c: ['covers', id]
  }).then(({ h, k, c }) => {
    if (!h) return h;
    const { nc, rev, ...x } = h,
      ms = x.messages || k.flatMap(y => y.m);
    K[id] = { c: pack(ms), v: c?.d || '', rev };
    return clean({ ...x, messages: ms, cover: c?.d || '' });
  });
export const put = o =>
  new Promise((res, rej) => {
    LS.set('bkd', 1);
    const { messages = [], cover, ...head } = o,
      c = pack(messages),
      v = cover || '',
      k = K[o.id],
      t = db.transaction(['scenarios', 'chunks', 'covers', 'meta'], 'readwrite'),
      [A, C, V, M] = ['scenarios', 'chunks', 'covers', 'meta'].map(n => t.objectStore(n));
    let nk = null;
    const r = A.get(o.id);
    r.onsuccess = () => {
      const ok = k && r.result && r.result.rev === k.rev && !r.result.messages;
      head.nc = c.length;
      head.rev = uid();
      A.put(head);
      c.forEach((x, i) => {
        if (!ok || k.c[i] !== x) C.put({ k: [o.id, i], m: messages.slice(i * CH, (i + 1) * CH) });
      });
      C.delete(range(o.id, c.length));
      if (!ok || k.v !== v) v ? V.put({ id: o.id, d: v }) : V.delete(o.id);
      M.put(META(o));
      nk = { c, v, rev: head.rev };
    };
    t.oncomplete = () => {
      K[o.id] = nk;
      res();
    };
    t.onerror = () => {
      delete K[o.id];
      rej(t.error);
    };
  });
export const del = id => {
  LS.set('bkd', 1);
  LS.del('draft:' + id);
  LS.del('pos:' + id);
  delete K[id];
  return new Promise((res, rej) => {
    const t = db.transaction(['scenarios', 'chunks', 'covers', 'meta'], 'readwrite');
    t.objectStore('scenarios').delete(id);
    t.objectStore('chunks').delete(range(id));
    t.objectStore('covers').delete(id);
    t.objectStore('meta').delete(id);
    t.oncomplete = () => res();
    t.onerror = () => rej(t.error);
  });
};
export const loadSet = () =>
  tx('settings', 'readonly', s => s.get('main')).then(r => {
    if (r) Object.assign(S, r.value);
  });
export const saveSet = () => tx('settings', 'readwrite', s => s.put({ key: 'main', value: S }));
export const loadStats = () => tx('settings', 'readonly', s => s.get('stats')).then(r => r?.value || null);
export const saveStats = v => tx('settings', 'readwrite', s => s.put({ key: 'stats', value: v }));
export const save = (s = app.cur) => {
  s.updated = Date.now();
  return put(s);
};
