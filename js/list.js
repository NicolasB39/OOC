import { bkOn, sync } from './backup.js';
import { go } from './nav.js';
import { coverOf, getTree } from './scenarios.js';
import { openSc } from './settings.js';
import { S, app } from './state.js';
import { del, getAll, getOne, put, saveSet } from './store.js';
import { $, LS, ago, dlg, el, hue, ic, nz, plain, uid } from './util.js';

export async function showList() {
  app.cur = null;
  $('#chat').hidden = true;
  $('#list').hidden = false;
  await draw();
  const T = await getTree();
  const fs = [
    ...new Set(T.map(p => p.match(/^scenarios\/([^/]+)\/systeme\.md$/)?.[1]).filter(Boolean))
  ];
  const have = await getAll();
  let n = 0;
  for (const f of fs)
    if (!have.some(s => s.remote && s.folder == f)) {
      await put({
        id: 'gh:' + f,
        name: f,
        folder: f,
        remote: true,
        updated: Date.now(),
        messages: []
      });
      n++;
    }
  await draw();
}
export async function draw() {
  const a = (await getAll()).sort((x, y) => y.updated - x.updated);
  const q = nz($('#q').value.trim());
  let f = a.filter(s =>
    app.FIL == 'play' ? s.n > 0 : app.FIL == 'lib' ? s.remote : app.FIL == 'own' ? !s.remote : true
  );
  if (q) f = f.filter(s => nz(s.name + ' ' + (s.pv || '')).includes(q));
  const hero = !q && app.FIL == 'all' ? f.find(s => s.n > 0) : null;
  const card = (s, h) => {
    const cv = coverOf(s);
    return el(
      'div',
      { class: 'item ' + (h ? 'hero' : 'card') },
      cv
        ? el('img', { class: 'cv', src: cv, alt: '', loading: 'lazy', decoding: 'async' })
        : el('div', { class: 'art', style: '--h:' + hue(s.name) }),
      !s.n && !h && el('span', { class: 'tag', text: 'Nouveau' }),
      el(
        'div',
        { class: 't', role: 'button', tabindex: '0', data: { id: s.id } },
        el('b', { text: s.name }),
        h
          ? [
              el('small', { class: 'pv', text: s.pv || '' }),
              el('span', { class: 'go', text: 'Reprendre' })
            ]
          : el('small', {
              text: s.n ? s.n + ' message' + (s.n > 1 ? 's' : '') + ' · ' + ago(s.updated) : ''
            })
      ),
      el('button', { class: 'menu', data: { id: s.id }, 'aria-label': 'Options' }, ic('more', 18))
    );
  };
  const list = [hero && card(hero, 1), ...f.filter(s => s !== hero).map(s => card(s))].filter(Boolean);
  $('#items').replaceChildren(
    ...(list.length
      ? list
      : [
          el(
            'div',
            { class: 'empty' },
            ic('logo', 44),
            el('p', {
              text: a.length ? 'Aucun résultat.' : 'Aucun scénario. Créez-en un pour commencer.'
            })
          )
        ])
  );
  $('#bk').hidden = !(
    a.some(s => s.n > 0) &&
    Date.now() - (+LS.get('bk') || +LS.get('first') || Date.now()) > 2592e6 &&
    Date.now() - (+LS.get('bks') || 0) > 6048e5
  );
}
$('#items').onclick = e => {
  const m = e.target.closest('.menu');
  if (m) {
    app.menuId = m.dataset.id;
    $('#mnt').textContent = m.closest('.item').querySelector('b').textContent;
    $('#mn').showModal();
    return;
  }
  const it = e.target.closest('.t');
  if (it) go(it.dataset.id);
};
$('#items').onkeydown = e => {
  if ((e.key == 'Enter' || e.key == ' ') && e.target.classList.contains('t')) {
    e.preventDefault();
    go(e.target.dataset.id);
  }
};
let qt;
$('#q').oninput = () => {
  clearTimeout(qt);
  qt = setTimeout(draw, 150);
};
$('#tabs').onclick = e => {
  const b = e.target.closest('button');
  if (!b) return;
  app.FIL = b.dataset.f;
  $('#tabs')
    .querySelectorAll('button')
    .forEach(x => {
      x.classList.toggle('on', x == b);
      x.setAttribute('aria-pressed', x == b);
    });
  draw();
};
$('#mc').onclick = () => $('#mn').close();
$('#mt').onclick = async () => {
  const s = await getOne(app.menuId);
  $('#mn').close();
  const nm = s.pname?.trim() || 'Joueur';
  const t =
    '# ' +
    s.name +
    '\n\n' +
    s.messages
      .map(m => '**' + (m.role == 'user' ? nm : 'Narrateur') + '**\n\n' + plain(m.content, nm))
      .join('\n\n---\n\n') +
    '\n';
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([t], { type: 'text/markdown' }));
  a.download = (s.name.replace(/[\\/:*?"<>|]+/g, '_') || 'histoire') + '.md';
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1e4);
};
$('#mr').onclick = async () => {
  const s = await getOne(app.menuId);
  $('#mn').close();
  const n = await dlg('Renommer', { v: s.name });
  if (n && n.trim()) {
    s.name = n.trim();
    s.updated = Date.now();
    await put(s);
    showList();
  }
};
$('#md').onclick = async () => {
  const s = await getOne(app.menuId);
  const c = structuredClone(s);
  c.id = uid();
  c.name = s.name + ' (copie)';
  c.updated = Date.now();
  await put(c);
  $('#mn').close();
  showList();
};
$('#mx').onclick = async () => {
  $('#mn').close();
  if (
    await dlg('Supprimer ce scénario ?', { m: 'Tout son historique sera effacé.', ok: 'Supprimer' })
  ) {
    await del(app.menuId);
    (S.tomb ??= {})[app.menuId] = Date.now();
    await saveSet();
    showList();
    if (bkOn()) sync();
  }
};
$('#new').onclick = async () => {
  const n = await dlg('Nom du scénario', { v: '' });
  if (!n || !n.trim()) return;
  const s = {
    id: uid(),
    name: n.trim(),
    updated: Date.now(),
    system: '',
    avatar: '',
    messages: []
  };
  await put(s);
  await go(s.id);
  openSc();
};
$('#rf').onclick = async () => {
  await getTree(true);
  showList();
};
