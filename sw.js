const C='histoires-v3',A=['./','index.html','manifest.json','icon-180.png','icon-192.png','icon-512.png'];
self.addEventListener('install',e=>e.waitUntil(caches.open(C).then(c=>Promise.all(A.map(u=>c.add(u).catch(()=>{})))).then(()=>self.skipWaiting())));
self.addEventListener('activate',e=>e.waitUntil(caches.keys().then(k=>Promise.all(k.filter(x=>x!=C).map(x=>caches.delete(x)))).then(()=>clients.claim())));
self.addEventListener('fetch',e=>{
const r=e.request;
if(r.method!='GET'||new URL(r.url).origin!=location.origin)return;
const n=fetch(r).then(x=>{if(x.ok){const c=x.clone();caches.open(C).then(k=>k.put(r,c))}return x});
e.waitUntil(n.catch(()=>{}));
e.respondWith(Promise.race([n,new Promise((_,j)=>setTimeout(j,4000))]).catch(()=>caches.match(r,{ignoreSearch:true}).then(m=>m||(r.mode=='navigate'?caches.match('./'):0)).then(m=>m||n)));
});
