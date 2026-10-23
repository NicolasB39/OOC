import { sync } from './backup.js';
import { openScenario } from './chat.js';
import { showList } from './list.js';
import { app } from './state.js';
import { $, LS } from './util.js';

export const go = async id => {
  history.pushState({ c: 1 }, '');
  await openScenario(id);
  if ($('#chat').hidden) history.back();
};
const leave = () => {
  if (app.busy) app.ctl?.abort();
  showList();
  if (LS.get('bkd')) sync();
};
$('#back').onclick = () => (history.state?.c ? history.back() : leave());
addEventListener('popstate', () => {
  const d = document.querySelector('dialog[open]');
  if (d) {
    d.close();
    history.pushState({ c: 1 }, '');
    return;
  }
  if (!$('#chat').hidden) leave();
});
