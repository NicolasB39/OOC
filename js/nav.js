import { readPos, stopSpeech } from './read.js';
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
  readPos(app.cur?.id);
  stopSpeech();
  if (app.busy) app.ctl?.abort('stop');
  showList();
  if (LS.get('bkd')) sync();
};
$('#back').onclick = () => (history.state?.c ? history.back() : leave());
addEventListener('visibilitychange', () => {
  if (document.visibilityState == 'hidden') readPos(app.cur?.id);
});
addEventListener('keydown', e => {
  if (e.defaultPrevented || e.metaKey || e.ctrlKey || e.altKey) return;
  const t = e.target,
    g = t.tagName;
  if (g == 'INPUT' || g == 'TEXTAREA' || g == 'SELECT' || t.isContentEditable) return;
  if (document.querySelector('dialog[open]')) return;
  if (e.key == '/' && !$('#list').hidden) {
    e.preventDefault();
    $('#q').focus();
  } else if (e.key == 'Escape' && !$('#chat').hidden) $('#back').click();
});
addEventListener('popstate', () => {
  const d = document.querySelector('dialog[open]');
  if (d) {
    d.close();
    history.pushState({ c: 1 }, '');
    return;
  }
  if (!$('#chat').hidden) leave();
});
