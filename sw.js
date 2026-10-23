const C = 'histoires-v10',
  A = [
    './',
    'index.html',
    'manifest.json',
    'icon-180.png',
    'icon-192.png',
    'icon-512.png',
    'css/style.css',
    'js/boot.js',
    'js/main.js',
    'js/state.js',
    'js/util.js',
    'js/store.js',
    'js/scenarios.js',
    'js/format.js',
    'js/prompt.js',
    'js/ai.js',
    'js/chat.js',
    'js/list.js',
    'js/nav.js',
    'js/settings.js',
    'js/read.js',
    'js/backup.js'
  ],
  MAX = 120;
const SH = new Set(A.map(a => new URL(a, self.registration.scope).href));
self.addEventListener('install', e =>
  e.waitUntil(
    caches
      .open(C)
      .then(c => Promise.all(A.map(u => c.add(new Request(u, { cache: 'reload' })))))
      .then(() => self.skipWaiting())
  )
);
self.addEventListener('activate', e =>
  e.waitUntil(
    caches
      .keys()
      .then(k => Promise.all(k.filter(x => x != C).map(x => caches.delete(x))))
      .then(() => clients.claim())
  )
);
const trim = async () => {
  const c = await caches.open(C);
  const k = (await c.keys()).filter(r => !SH.has(r.url));
  for (const r of k.slice(0, Math.max(0, k.length - MAX))) await c.delete(r);
};
const store = (r, x) => {
  if (!x.ok) return;
  const c = x.clone();
  return caches
    .open(C)
    .then(k => k.put(r, c))
    .then(() => (SH.has(r.url) ? 0 : trim()));
};
const swr = (e, r) => {
  const ps = [];
  const n = fetch(r.url, { cache: 'no-cache' }).then(x => {
    ps.push(store(r, x));
    return x;
  });
  e.waitUntil(n.then(() => Promise.all(ps)).catch(() => {}));
  return caches.match(r, { ignoreSearch: true }).then(m => m || n);
};
const nf = (e, r) => {
  const ps = [];
  const n = fetch(r.url, { cache: 'no-cache' }).then(x => {
    ps.push(store(r, x));
    return x;
  });
  e.waitUntil(n.then(() => Promise.all(ps)).catch(() => {}));
  return Promise.race([n, new Promise((_, j) => setTimeout(j, 4000))]).catch(() =>
    caches
      .match(r, { ignoreSearch: true })
      .then(m => m || (r.mode == 'navigate' ? caches.match('./') : 0))
      .then(m => m || n)
  );
};
self.addEventListener('fetch', e => {
  const r = e.request,
    u = new URL(r.url);
  if (r.method != 'GET' || u.origin != location.origin) return;
  e.respondWith(SH.has(u.href) || r.destination == 'image' ? swr(e, r) : nf(e, r));
});
