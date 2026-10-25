import { PROVIDERS } from './state.js';
import {
  SESSION,
  clear,
  dayKey,
  dayMap,
  monthDays,
  monthKey,
  monthMap,
  splitKey,
  total
} from './stats.js';
import { $, dlg, el } from './util.js';

const fmt = n => Math.round(n).toLocaleString('fr-FR');
let mode = 'session',
  cur = new Date();

const step = d => {
  const x = new Date(cur);
  if (mode == 'day') x.setDate(x.getDate() + d);
  else {
    x.setDate(1);
    x.setMonth(x.getMonth() + d);
  }
  cur = x;
};
const atNow = () =>
  mode == 'day' ? dayKey(cur) >= dayKey() : monthKey(dayKey(cur)) >= monthKey(dayKey());

const rows = map => {
  const ks = Object.keys(map).sort((a, b) => map[b][0] + map[b][1] - (map[a][0] + map[a][1])),
    top = ks.length ? map[ks[0]][0] + map[ks[0]][1] : 1;
  return ks.map(k => {
    const [p, m] = splitKey(k),
      e = map[k],
      t = e[0] + e[1];
    return el(
      'div',
      { class: 'ur' },
      el(
        'div',
        { class: 'uh' },
        el('b', { text: m }),
        el('small', { text: PROVIDERS[p]?.n || p }),
        el('span', { text: fmt(t) })
      ),
      el('i', { class: 'bar' }, el('u', { style: 'width:' + Math.max(2, (t / top) * 100) + '%' })),
      el('small', {
        text:
          fmt(e[0]) + ' en entrée · ' + fmt(e[1]) + ' en sortie · ' + fmt(e[2]) + (e[2] > 1 ? ' requêtes' : ' requête')
      })
    );
  });
};

const bars = ym => {
  const ds = monthDays(ym),
    mx = Math.max(1, ...ds.map(([, t]) => t[0] + t[1])),
    best = ds.reduce((a, b) => (b[1][0] + b[1][1] > a[1][0] + a[1][1] ? b : a), ds[0]);
  const lab = k => new Date(k + 'T12:00').toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' });
  return el(
    'div',
    {
      class: 'ud',
      role: 'img',
      'aria-label':
        best[1][0] + best[1][1]
          ? 'Jour le plus chargé : ' + lab(best[0]) + ', ' + fmt(best[1][0] + best[1][1]) + ' tokens'
          : 'Aucune utilisation ce mois-ci'
    },
    ds.map(([k, t]) => {
      const v = t[0] + t[1];
      return el('i', {
        title: lab(k) + ' : ' + fmt(v) + ' tokens',
        style: 'height:' + (v ? Math.max(4, (v / mx) * 100) : 2) + '%',
        class: v ? 'on' : ''
      });
    })
  );
};

export function view() {
  for (const b of $('#ust').querySelectorAll('button'))
    b.setAttribute('aria-checked', b.dataset.m == mode);
  const nav = mode != 'session';
  $('#usn').hidden = !nav;
  $('#usx').disabled = nav && atNow();
  let map, ym;
  if (mode == 'session') {
    map = SESSION;
    $('#usl').textContent = '';
  } else if (mode == 'day') {
    map = dayMap(dayKey(cur));
    $('#usl').textContent = cur.toLocaleDateString('fr-FR', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      year: 'numeric'
    });
  } else {
    ym = monthKey(dayKey(cur));
    map = monthMap(ym);
    $('#usl').textContent = cur.toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' });
  }
  const t = total(map),
    est = t[3];
  $('#usv').replaceChildren(
    el(
      'div',
      { class: 'ut' },
      el('b', { text: fmt(t[0] + t[1]) }),
      el('small', {
        text:
          'tokens · ' +
          fmt(t[0]) +
          ' en entrée · ' +
          fmt(t[1]) +
          ' en sortie · ' +
          fmt(t[2]) +
          (t[2] > 1 ? ' requêtes' : ' requête')
      })
    ),
    ym && t[2] ? bars(ym) : null,
    t[2]
      ? rows(map)
      : el('p', {
          class: 'hint',
          text:
            mode == 'session'
              ? 'Rien depuis l’ouverture de l’application.'
              : 'Aucune utilisation sur cette période.'
        }),
    est
      ? el('p', {
          class: 'note',
          text:
            fmt(est) +
            (est > 1 ? ' requêtes sont estimées' : ' requête est estimée') +
            ' : le fournisseur n’a pas renvoyé son propre décompte.'
        })
      : null,
    mode == 'session'
      ? el('p', {
          class: 'note',
          text: 'Une session court depuis l’ouverture de l’application, jusqu’à sa fermeture complète.'
        })
      : null
  );
}

$('#usb').onclick = () => {
  cur = new Date();
  view();
  $('#dus').showModal();
};
$('#ust').onclick = e => {
  const b = e.target.closest('button');
  if (!b) return;
  if (b.dataset.m != mode) cur = new Date();
  mode = b.dataset.m;
  view();
};
$('#usp').onclick = () => {
  step(-1);
  view();
};
$('#usx').onclick = () => {
  step(1);
  view();
};
$('#usc').onclick = () => $('#dus').close();
$('#usr').onclick = async () => {
  if (
    await dlg('Effacer les statistiques ?', {
      m: 'Les compteurs de tous les jours et de la session repartent de zéro. Les histoires ne sont pas touchées.',
      ok: 'Effacer'
    })
  ) {
    clear();
    view();
  }
};
