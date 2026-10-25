import { jump, render, tk } from './chat.js';
import { showList } from './list.js';
import { statOn } from './prompt.js';
import { mergeRel } from './memory.js';
import { conflicts } from './protocol.js';
import { reset as rlReset } from './rate.js';
import { TERR, getTree, loadCtx } from './scenarios.js';
import { PROVIDERS, S, app, ctx } from './state.js';
import { clean, put, save, saveSet } from './store.js';
import { $, LS, dlg, el, ic, num, nz } from './util.js';

export function openSc() {
  const c = app.cur.remote ? ctx : app.cur;
  $('#ssys').value = c.system;
  $('#sav').value = c.avatar;
  $('#ssys').readOnly = $('#sav').readOnly = !!app.cur.remote;
  const cf = conflicts(c.system);
  $('#scw').hidden = !cf.length;
  $('#scw').textContent = cf.length
    ? 'Ce prompt redéfinit ' +
      cf.join(', ') +
      " : l'application s'en charge désormais. Retirez ces consignes pour éviter que l'IA reçoive deux versions du même format."
    : '';
  $('#spre').checked = !!app.cur.noPre;
  $('#snm').value = app.cur.pname || '';
  $('#scv').hidden = !!app.cur.remote;
  COVER = app.cur.cover || '';
  cvView();
  $('#smx').value = app.cur.maxTok || '';
  $('#stmp').value = app.cur.temp ?? '';
  $('#stk').value = app.cur.top ?? '';
  $('#smm').value = app.cur.memN ?? '';
  $('#sld').value = app.cur.loreDepth || '';
  $('#slm').value = app.cur.loreMax || '';
  $('#sch').checked = !app.cur.noChoices;
  $('#sgs').checked = !app.cur.noStyle;
  $('#scp').value = app.cur.choicePrompt || '';
  $('#sst').checked = statOn(app.cur);
  $('#sstf').value = app.cur.statFields || '';
  $('#sstf').placeholder = ctx.stat || 'Lieu, Objectif, Santé (0/100), Humeur';
  const im = ctx.images;
  $('#simw').hidden = !app.cur.remote;
  $('#simn').textContent =
    (im.length
      ? im.length + (im.length > 1 ? ' images détectées.' : ' image détectée.')
      : 'Aucune image détectée dans personnages/<Nom>/.') + (TERR ? ' Index : ' + TERR + '.' : '');
  $('#simg').replaceChildren(
    ...im.map(i =>
      el(
        'figure',
        null,
        el('img', { src: i.url, alt: '', loading: 'lazy', decoding: 'async' }),
        el('figcaption', { text: i.code })
      )
    )
  );
  if (!$('#ds').open) $('#ds').showModal();
}
$('#simr').onclick = async () => {
  await getTree(true);
  await loadCtx();
  openSc();
  render();
};
$('#mo').onclick = () => $('#dmn').showModal();
$('#dmnc').onclick = () => $('#dmn').close();
$('#sc').onclick = () => {
  $('#dmn').close();
  openSc();
};
let MM = [],
  MR = [];
const memView = () => {
  $('#mml').replaceChildren(
    ...(MM.length
      ? MM.map((t, i) =>
          el(
            'span',
            { class: 'chip2' },
            t,
            el(
              'button',
              {
                'aria-label': 'Retirer',
                onclick: () => {
                  MM.splice(i, 1);
                  memView();
                }
              },
              ic('x', 14)
            )
          )
        )
      : [el('p', { class: 'note', text: 'Aucun souvenir pour le moment.' })])
  );
  $('#mrl').replaceChildren(
    ...(MR.length
      ? MR.map((r, i) =>
          el(
            'div',
            { class: 'rel' },
            el('input', {
              class: 'who',
              value: r.k,
              'aria-label': 'Nom',
              oninput: e => (MR[i].k = e.target.value)
            }),
            el('input', {
              value: r.v,
              'aria-label': 'Relation',
              oninput: e => (MR[i].v = e.target.value)
            }),
            el(
              'button',
              {
                'aria-label': 'Retirer',
                onclick: () => {
                  MR.splice(i, 1);
                  memView();
                }
              },
              ic('trash', 16)
            )
          )
        )
      : [el('p', { class: 'note', text: 'Aucune relation suivie.' })])
  );
};
$('#mb').onclick = () => {
  $('#dmn').close();
  $('#msu').value = app.cur.mem.summary;
  MM = [...app.cur.mem.memories];
  MR = Object.entries(app.cur.mem.relations || {}).map(([k, v]) => ({ k, v }));
  $('#mmi').value = $('#mri').value = $('#mrv').value = '';
  memView();
  $('#dm').showModal();
};
$('#mma').onclick = () => {
  const v = $('#mmi').value.trim();
  if (!v) return;
  MM.push(v);
  $('#mmi').value = '';
  memView();
};
$('#mra').onclick = () => {
  const k = $('#mri').value.trim(),
    v = $('#mrv').value.trim();
  if (!k || !v) return;
  MR.push({ k, v });
  $('#mri').value = $('#mrv').value = '';
  memView();
};
$('#dmc').onclick = () => $('#dm').close();
$('#dms').onclick = async () => {
  app.cur.mem.summary = $('#msu').value;
  app.cur.mem.memories = MM;
  app.cur.mem.relations = mergeRel({}, Object.fromEntries(MR.filter(r => r.k.trim() && r.v.trim()).map(r => [r.k.trim(), r.v.trim()])), [], 99);
  await save();
  render();
  $('#dm').close();
};
$('#nt').onclick = () => {
  $('#dmn').close();
  $('#nti').value = app.cur.note || '';
  $('#dn').showModal();
};
$('#dnc').onclick = () => $('#dn').close();
$('#dns').onclick = async () => {
  app.cur.note = $('#nti').value;
  await save();
  $('#dn').close();
};
$('#dsc').onclick = () => $('#ds').close();
$('#dss').onclick = async () => {
  if (!app.cur.remote) {
    app.cur.system = $('#ssys').value;
    app.cur.avatar = $('#sav').value;
  }
  app.cur.pname = $('#snm').value.trim();
  app.cur.cover = COVER;
  app.cur.maxTok = +$('#smx').value || 0;
  app.cur.temp = num('#stmp');
  app.cur.top = num('#stk');
  app.cur.memN = num('#smm');
  app.cur.loreDepth = +$('#sld').value || 0;
  app.cur.loreMax = +$('#slm').value || 0;
  app.cur.noChoices = !$('#sch').checked;
  app.cur.noStyle = !$('#sgs').checked;
  app.cur.noPre = $('#spre').checked;
  app.cur.choicePrompt = $('#scp').value.trim();
  app.cur.stat = $('#sst').checked;
  app.cur.statFields = $('#sstf').value.trim();
  await save();
  render();
  $('#ds').close();
};
$('#cp').replaceChildren(
  ...Object.entries(PROVIDERS).map(([k, v]) => el('option', { value: k, text: v.n }))
);
function fillCfg() {
  const p = $('#cp').value;
  $('#ck').value = S.keys[p] || '';
  $('#cm').value = S.models[p] || '';
  $('#cm').placeholder = PROVIDERS[p].m;
  $('#cmm').value = S.memModels?.[p] || '';
  $('#cmm').placeholder = S.models[p] || PROVIDERS[p].m;
  $('#cn').checked = !!S.ns?.[p];
}
const streamInfo = () => {
  const x = app.stream;
  if (!x) return 'Aucune réponse reçue pour le moment dans cette session.';
  const sec = (x.ms / 1000).toFixed(1).replace('.', ',');
  if (x.mode == 'off') return 'Dernière réponse : le streaming est désactivé dans ces réglages.';
  if (x.mode == 'block')
    return (
      "Dernière réponse : reçue d'un seul bloc après " +
      sec +
      " s. Le service ou le modèle n'a pas diffusé le texte au fur et à mesure."
    );
  if (x.chunks < 4)
    return (
      'Dernière réponse : diffusée en ' +
      x.chunks +
      (x.chunks > 1 ? ' morceaux' : ' morceau') +
      ' seulement (' +
      sec +
      ' s). Le modèle envoie de gros morceaux ou a réfléchi avant de répondre.'
    );
  return 'Dernière réponse : diffusée en ' + x.chunks + ' morceaux (' + sec + ' s).';
};
function openCfg() {
  $('#cp').value = S.provider;
  fillCfg();
  $('#cst').textContent =
    streamInfo() +
    (S.cpt ? ' Estimation calibrée : ' + S.cpt.toFixed(2) + ' caractères par token.' : '') +
    (S.nj?.[S.provider]
      ? ' Mémoire : réponses en texte balisé (ce fournisseur refuse le mode JSON).'
      : ' Mémoire : réponses en JSON.');
  $('#ctp').value = S.temp ?? '';
  $('#ctk').value = S.top ?? '';
  $('#ccx').value = S.ctxLim || '';
  $('#crs').value = S.reserve || '';
  $('#ctpm').value = S.tpm || '';
  $('#crp').value = S.repo || '';
  $('#cpre').value = S.pre || '';
  $('#cpr').value = S.proto || '';
  $('#ctc').checked = !!S.counters;
  $('#sto').textContent = '';
  Promise.all([
    navigator.storage?.estimate?.() || null,
    navigator.storage?.persisted?.() ?? null
  ])
    .then(([e, p]) => {
      if (!e) return;
      const mo = x => (x / 1048576).toFixed(1).replace('.', ',') + ' Mo';
      $('#sto').textContent =
        'Sur cet appareil : ' +
        mo(e.usage || 0) +
        (e.quota ? ' utilisés sur ' + mo(e.quota) + ' disponibles' : ' utilisés') +
        ' · conservation accordée par le navigateur : ' +
        (p ? 'oui' : 'non, les données peuvent être effacées si l’espace manque') +
        '.';
    })
    .catch(() => {});
  $('#dc').showModal();
}
$('#cfg').onclick = openCfg;
$('#akb').onclick = openCfg;
$('#cfg2').onclick = () => {
  $('#dmn').close();
  openCfg();
};
$('#cp').onchange = fillCfg;
$('#cl').onclick = async () => {
  const p = $('#cp').value,
    k = $('#ck').value.trim();
  if (!k) {
    dlg('Clé API manquante', { m: 'Saisissez la clé avant de lister les modèles.' });
    return;
  }
  try {
    const r = await fetch(PROVIDERS[p].u + '/models', {
      headers: { Authorization: 'Bearer ' + k }
    });
    const j = await r.json();
    const a = (j.data || j.models || [])
      .map(x => String(x.id || x.name || '').replace(/^models\//, ''))
      .filter(Boolean)
      .sort();
    if (!a.length) throw new Error(j.error?.message || 'liste vide');
    $('#cml').replaceChildren(...a.map(x => el('option', { value: x })));
    dlg(a.length + ' modèles', {
      m: 'Effacez le champ Modèle puis touchez-le pour choisir dans la liste.'
    });
  } catch (e) {
    dlg('Liste indisponible', { m: e.message });
  }
};
$('#im').onclick = () => $('#imf').click();
$('#imf').onchange = async e => {
  const f = e.target.files[0];
  e.target.value = '';
  if (!f) return;
  try {
    const d = JSON.parse(await f.text());
    const a = (Array.isArray(d.scenarios) ? d.scenarios : []).map(clean).filter(Boolean);
    if (
      !a.length ||
      !(await dlg('Importer ' + a.length + ' scénario(s) ?', {
        m: 'Ceux qui ont le même identifiant seront remplacés.',
        ok: 'Importer'
      }))
    )
      return;
    for (const x of a) await put(x);
    $('#dc').close();
    showList();
  } catch (x) {
    dlg('Fichier invalide');
  }
};
$('#dcc').onclick = () => $('#dc').close();
$('#dcs').onclick = async () => {
  const p = $('#cp').value;
  if (p !== S.provider || $('#cm').value.trim() !== (S.models[S.provider] || '')) rlReset();
  S.provider = p;
  S.keys[p] = $('#ck').value.trim();
  S.models[p] = $('#cm').value.trim();
  (S.memModels ??= {})[p] = $('#cmm').value.trim();
  (S.ns ??= {})[p] = $('#cn').checked;
  const rp = $('#crp').value.trim();
  if (rp !== (S.repo || '')) LS.del('tree');
  S.repo = rp;
  S.temp = num('#ctp');
  S.top = num('#ctk');
  S.pre = $('#cpre').value.trim();
  S.proto = $('#cpr').value;
  S.ctxLim = +$('#ccx').value || 0;
  S.reserve = +$('#crs').value || 0;
  S.tpm = +$('#ctpm').value || 0;
  S.counters = $('#ctc').checked;
  await saveSet();
  $('#dc').close();
  if (app.cur) tk();
};

const SNIP = (t, q) => {
  const i = nz(t).indexOf(q);
  if (i < 0) return t.slice(0, 90);
  const a = Math.max(0, i - 30);
  return (a ? '…' : '') + t.slice(a, i + q.length + 60).trim() + '…';
};
const hit = (i, role, text, onGo) =>
  el(
    'button',
    { class: 'hit', onclick: onGo },
    el('span', { class: 'who', text: role == 'user' ? 'Joueur' : 'Récit' }),
    el('span', { text })
  );
function srRun() {
  const q = nz($('#sri').value.trim());
  if (q.length < 2) {
    $('#srn').textContent = 'Saisissez au moins deux caractères.';
    $('#srl').replaceChildren();
    return;
  }
  const r = app.cur.messages
    .map((m, i) => ({ m, i }))
    .filter(x => nz(x.m.content).includes(q))
    .slice(-60)
    .reverse();
  $('#srn').textContent = r.length
    ? r.length + (r.length > 1 ? ' messages trouvés.' : ' message trouvé.')
    : 'Aucun résultat.';
  $('#srl').replaceChildren(
    ...r.map(x =>
      hit(x.i, x.m.role, SNIP(x.m.content, q), () => {
        $('#dsr').close();
        jump(x.i);
      })
    )
  );
}
$('#mf').onclick = () => {
  $('#dmn').close();
  $('#sri').value = '';
  $('#srn').textContent = '';
  $('#srl').replaceChildren();
  $('#dsr').showModal();
  $('#sri').focus();
};
let srT;
$('#sri').oninput = () => {
  clearTimeout(srT);
  srT = setTimeout(srRun, 180);
};
$('#dsrc').onclick = () => $('#dsr').close();
$('#msm').onclick = () => {
  $('#dmn').close();
  const L = app.cur.mem.lines || [];
  $('#sml').replaceChildren(
    ...(L.length
      ? L.map(x =>
          hit(x.i, 'assistant', x.t, () => {
            $('#dsm').close();
            if (x.i >= 0) jump(x.i);
          })
        )
      : [el('p', { class: 'note', text: 'Le sommaire se remplit à mesure que la mémoire résume les messages.' })])
  );
  $('#dsm').showModal();
};
$('#dsmc').onclick = () => $('#dsm').close();

const shrink = f =>
  new Promise(res => {
    const r = new FileReader();
    r.onload = () => {
      const im = new Image();
      im.onload = () => {
        const w = Math.min(600, im.width),
          h = Math.round((im.height * w) / im.width),
          c = document.createElement('canvas');
        c.width = w;
        c.height = h;
        c.getContext('2d').drawImage(im, 0, 0, w, h);
        res(c.toDataURL('image/webp', 0.75));
      };
      im.onerror = () => res('');
      im.src = r.result;
    };
    r.onerror = () => res('');
    r.readAsDataURL(f);
  });
let COVER = '';
const cvView = () => {
  $('#scvi').hidden = !COVER;
  $('#scvi').src = COVER || '';
  $('#scvx').hidden = !COVER;
  $('#scva').textContent = COVER ? 'Changer' : 'Choisir une image';
};
$('#scva').onclick = () => $('#scvf').click();
$('#scvx').onclick = () => {
  COVER = '';
  cvView();
};
$('#scvf').onchange = async e => {
  const f = e.target.files[0];
  e.target.value = '';
  if (!f) return;
  const d = await shrink(f);
  if (!d) {
    dlg('Image illisible');
    return;
  }
  COVER = d;
  cvView();
};
