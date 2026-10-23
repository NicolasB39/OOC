import { render, tk } from './chat.js';
import { showList } from './list.js';
import { statOn } from './prompt.js';
import { TERR, getTree, loadCtx } from './scenarios.js';
import { PROVIDERS, S, app, ctx } from './state.js';
import { clean, put, save, saveSet } from './store.js';
import { $, LS, dlg, esc, num } from './util.js';

export function openSc() {
  const c = app.cur.remote ? ctx : app.cur;
  $('#ssys').value = c.system;
  $('#sav').value = c.avatar;
  $('#ssys').readOnly = $('#sav').readOnly = !!app.cur.remote;
  $('#snm').value = app.cur.pname || '';
  $('#smx').value = app.cur.maxTok || '';
  $('#stp').value = app.cur.temp ?? '';
  $('#stk').value = app.cur.top ?? '';
  $('#smm').value = app.cur.memN ?? '';
  $('#sld').value = app.cur.loreDepth || '';
  $('#slm').value = app.cur.loreMax || '';
  $('#sch').checked = !app.cur.noChoices;
  $('#scp').value = app.cur.choicePrompt || '';
  $('#sst').checked = statOn(app.cur);
  $('#sstf').value = app.cur.statFields || '';
  $('#sstf').placeholder = ctx.stat || 'Lieu, Santé (0/100), Argent, Humeur';
  const im = ctx.images;
  $('#simw').hidden = !app.cur.remote;
  $('#simn').textContent =
    (im.length
      ? im.length + (im.length > 1 ? ' images détectées.' : ' image détectée.')
      : 'Aucune image détectée dans personnages/<Nom>/.') + (TERR ? ' Index : ' + TERR + '.' : '');
  $('#simg').innerHTML = im
    .map(
      i =>
        `<figure><img src="${esc(i.url)}" alt="" loading="lazy" decoding="async"><figcaption>${esc(i.code)}</figcaption></figure>`
    )
    .join('');
  if (!$('#ds').open) $('#ds').showModal();
}
$('#simr').onclick = async () => {
  await getTree(true);
  await loadCtx();
  openSc();
  render();
};
$('#sc').onclick = openSc;
$('#mb').onclick = () => {
  $('#msu').value = app.cur.mem.summary;
  $('#mme').value = app.cur.mem.memories.join('\n');
  $('#dm').showModal();
};
$('#dmc').onclick = () => $('#dm').close();
$('#dms').onclick = async () => {
  app.cur.mem.summary = $('#msu').value;
  app.cur.mem.memories = $('#mme')
    .value.split('\n')
    .map(x => x.trim())
    .filter(Boolean);
  await save();
  $('#dm').close();
};
$('#nt').onclick = () => {
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
  app.cur.maxTok = +$('#smx').value || 0;
  app.cur.temp = num('#stp');
  app.cur.top = num('#stk');
  app.cur.memN = num('#smm');
  app.cur.loreDepth = +$('#sld').value || 0;
  app.cur.loreMax = +$('#slm').value || 0;
  app.cur.noChoices = !$('#sch').checked;
  app.cur.choicePrompt = $('#scp').value.trim();
  app.cur.stat = $('#sst').checked;
  app.cur.statFields = $('#sstf').value.trim();
  await save();
  render();
  $('#ds').close();
};
$('#cp').innerHTML = Object.entries(PROVIDERS)
  .map(([k, v]) => `<option value="${k}">${v.n}</option>`)
  .join('');
function fillCfg() {
  const p = $('#cp').value;
  $('#ck').value = S.keys[p] || '';
  $('#cm').value = S.models[p] || '';
  $('#cm').placeholder = PROVIDERS[p].m;
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
  $('#cst').textContent = streamInfo();
  $('#ctp').value = S.temp ?? '';
  $('#ctk').value = S.top ?? '';
  $('#ccx').value = S.ctxLim || '';
  $('#crs').value = S.reserve || '';
  $('#crp').value = S.repo || '';
  $('#dc').showModal();
}
$('#cfg').onclick = openCfg;
$('#cfg2').onclick = openCfg;
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
    $('#cml').innerHTML = a.map(x => `<option value="${esc(x)}">`).join('');
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
  S.provider = p;
  S.keys[p] = $('#ck').value.trim();
  S.models[p] = $('#cm').value.trim();
  (S.ns ??= {})[p] = $('#cn').checked;
  const rp = $('#crp').value.trim();
  if (rp !== (S.repo || '')) LS.del('tree');
  S.repo = rp;
  S.temp = num('#ctp');
  S.top = num('#ctk');
  S.ctxLim = +$('#ccx').value || 0;
  S.reserve = +$('#crs').value || 0;
  await saveSet();
  $('#dc').close();
  if (app.cur) tk();
};
