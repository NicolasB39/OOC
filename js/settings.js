import { tk } from './chat.js';
import { showList } from './list.js';
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
  $('#ds').showModal();
}
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
  await save();
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
function openCfg() {
  $('#cp').value = S.provider;
  fillCfg();
  $('#ctp').value = S.temp ?? '';
  $('#ctk').value = S.top ?? '';
  $('#ccx').value = S.ctxLim || '';
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
  await saveSet();
  $('#dc').close();
  if (app.cur) tk();
};
