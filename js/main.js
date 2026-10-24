import { gis, sync } from './backup.js';
import { showList } from './list.js';
import { S } from './state.js';
import { loadSet, openDB } from './store.js';
import { LS } from './util.js';
import { applyFs } from './read.js';
import './list.js';
import './chat.js';
import './nav.js';
import './settings.js';
import './backup.js';

const VERSION = '877a034757';
const pv = document.querySelector('meta[name="app-version"]')?.content;
if (pv !== VERSION)
  window.__boot?.warn(
    'Version mélangée : page ' + (pv || 'inconnue') + ', scripts ' + VERSION + '.'
  );
window.__started = true;

if ('serviceWorker' in navigator && location.protocol.startsWith('http'))
  navigator.serviceWorker.register('sw.js').catch(() => {});
if (!LS.get('first')) LS.set('first', Date.now());
openDB()
  .then(() => Promise.resolve(navigator.storage?.persist?.()).catch(() => {}))
  .then(loadSet)
  .then(() => {
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
