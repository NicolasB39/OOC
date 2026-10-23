import { gis, sync } from './backup.js';
import { showList } from './list.js';
import { S } from './state.js';
import { loadSet, openDB } from './store.js';
import { LS } from './util.js';
import './list.js';
import './chat.js';
import './nav.js';
import './settings.js';
import './backup.js';

if ('serviceWorker' in navigator && location.protocol.startsWith('http'))
  navigator.serviceWorker.register('sw.js').catch(() => {});
if (!LS.get('first')) LS.set('first', Date.now());
openDB()
  .then(() => Promise.resolve(navigator.storage?.persist?.()).catch(() => {}))
  .then(loadSet)
  .then(showList)
  .then(() => {
    if (S.bk?.p == 'drive') gis().catch(() => {});
    sync();
  });
