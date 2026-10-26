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
let skip = false;
const open = () => document.querySelector('dialog[open]');
const sm = HTMLDialogElement.prototype.showModal;
HTMLDialogElement.prototype.showModal = function () {
  sm.call(this);
  if (!history.state?.d) history.pushState({ ...history.state, d: 1 }, '');
};
document.addEventListener(
  'close',
  () =>
    setTimeout(() => {
      if (!open() && history.state?.d) {
        skip = true;
        history.back();
      }
    }),
  true
);
addEventListener('popstate', () => {
  if (skip) {
    skip = false;
    return;
  }
  const d = [...document.querySelectorAll('dialog[open]')].at(-1);
  if (d) {
    d.close();
    if (open()) history.pushState({ ...history.state, d: 1 }, '');
    return;
  }
  if (!$('#chat').hidden) leave();
  if (history.state?.d) {
    skip = true;
    history.back();
  }
});
