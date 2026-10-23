const C='histoires-v4',A=['./','index.html','manifest.json','icon-180.png','icon-192.png','icon-512.png','css/style.css','js/main.js','js/state.js','js/util.js','js/store.js','js/scenarios.js','js/format.js','js/prompt.js','js/ai.js','js/chat.js','js/list.js','js/nav.js','js/settings.js','js/backup.js'];
self.addEventListener('install',e=>e.waitUntil(caches.open(C).then(c=>Promise.all(A.map(u=>c.add(u).catch(()=>{})))).then(()=>self.skipWaiting())));
self.addEventListener('activate',e=>e.waitUntil(caches.keys().then(k=>Promise.all(k.filter(x=>x!=C).map(x=>caches.delete(x)))).then(()=>clients.claim())));
self.addEventListener('fetch',e=>{
const r=e.request;
if(r.method!='GET'||new URL(r.url).origin!=location.origin)return;
const n=fetch(r).then(x=>{if(x.ok){const c=x.clone();caches.open(C).then(k=>k.put(r,c))}return x});
e.waitUntil(n.catch(()=>{}));
e.respondWith(Promise.race([n,new Promise((_,j)=>setTimeout(j,4000))]).catch(()=>caches.match(r,{ignoreSearch:true}).then(m=>m||(r.mode=='navigate'?caches.match('./'):0)).then(m=>m||n)));
});
