import { gis, sync } from './backup.js';
import { showList } from './list.js';
import { S } from './state.js';
import { STATS, load as loadUsage, watch } from './stats.js';
import { loadSet, loadStats, openDB, saveStats } from './store.js';
import { capCheck } from './statview.js';
import './cast.js';
import { LS, toast } from './util.js';
import { applyFs } from './read.js';
import './list.js';
import './chat.js';
import './nav.js';
import './settings.js';
import './backup.js';

const VERSION = 'cf282bbf1a';
const pv = document.querySelector('meta[name="app-version"]')?.content;
if (pv !== VERSION)
  window.__boot?.warn(
    'Version mélangée : page ' + (pv || 'inconnue') + ', scripts ' + VERSION + '.'
  );
window.__started = true;

if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
  const had = !!navigator.serviceWorker.controller;
  let going = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!had || going) return;
    going = true;
    location.reload();
  });
  navigator.serviceWorker
    .register('sw.js')
    .then(reg => {
      const offer = w => {
        if (!w || !had) return;
        toast('Nouvelle version prête', {
          keep: 1,
          label: 'Recharger',
          fn: () => w.postMessage('skip')
        });
      };
      offer(reg.waiting);
      reg.addEventListener('updatefound', () => {
        const w = reg.installing;
        w?.addEventListener('statechange', () => {
          if (w.state == 'installed') offer(w);
        });
      });
    })
    .catch(() => {});
}
if (!LS.get('first')) LS.set('first', Date.now());
openDB()
  .then(() => Promise.resolve(navigator.storage?.persist?.()).catch(() => {}))
  .then(loadSet)
  .then(() => loadStats().then(loadUsage, () => {}))
  .then(() => {
    let t = 0;
    const flush = () => {
      clearTimeout(t);
      t = 0;
      saveStats(STATS).catch(() => {});
    };
    watch(() => {
      if (!t) t = setTimeout(flush, 1500);
      capCheck();
    });
    addEventListener('visibilitychange', () => {
      if (document.visibilityState == 'hidden' && t) flush();
    });
    applyFs();
    return showList();
  })
  .then(() => {
    if (S.bk?.p == 'drive') gis().catch(() => {});
    sync();
  })
  .catch(e =>
    window.__boot?.fail(
      'Stockage local indisponible (navigation privée ?) : ' + (e?.message || e)
    )
  );
