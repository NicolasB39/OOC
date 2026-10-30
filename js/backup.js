import { emit } from './bus.js';
import { merge } from './merge.js';
import { S, app } from './state.js';
import { clean, del, getAll, getFull, getOne, put, saveSet } from './store.js';
import { $, LS, ago, dlg, toast } from './util.js';

async function doExport() {
  const f = new File(
    [JSON.stringify({ v: 1, scenarios: await getFull() })],
    'nocturne-' + new Date().toISOString().slice(0, 10) + '.json',
    { type: 'application/json' }
  );
  const dl = () => {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(f);
    a.download = f.name;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1e4);
  };
  try {
    if (navigator.canShare?.({ files: [f] })) await navigator.share({ files: [f] });
    else dl();
  } catch (e) {
    if (e.name == 'AbortError') return;
    dl();
  }
  LS.set('bk', Date.now());
  $('#bk').hidden = true;
}
$('#ex').onclick = doExport;
$('#bke').onclick = doExport;
$('#bkl').onclick = () => {
  LS.set('bks', Date.now());
  $('#bk').hidden = true;
};
// Nom historique : le renommer ferait chercher un fichier inexistant chez le fournisseur.
const FN = 'histoires-backup.json';
const b64e = s => {
  const b = new TextEncoder().encode(s);
  let x = '';
  for (let i = 0; i < b.length; i += 8192) x += String.fromCharCode(...b.subarray(i, i + 8192));
  return btoa(x);
};
const b64d = s =>
  new TextDecoder().decode(Uint8Array.from(atob(s.replace(/\s/g, '')), c => c.charCodeAt(0)));
const bkErr = (r, j) =>
  new Error(
    r.status == 401
      ? 'Jeton refusé ou expiré.'
      : r.status == 403
        ? 'Accès refusé (droits du jeton ou limite atteinte).'
        : r.status == 404
          ? 'Dépôt introuvable ou jeton sans accès à ce dépôt.'
          : j?.message || 'Erreur ' + r.status
  );
const parseBk = t => {
  try {
    return JSON.parse(t);
  } catch (e) {
    throw new Error("Fichier de sauvegarde illisible : rien n'a été modifié.");
  }
};
const IDX = 'index.json';
const fname = id => id.replace(/[^\w-]/g, c => '~' + c.charCodeAt(0).toString(16).padStart(4, '0')) + '.json';
const cname = id => fname(id).replace(/\.json$/, '.cover.json');
const SQ = 100;
export const cvh = s => {
  if (!s) return '';
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 0x01000193);
  return (h >>> 0).toString(36) + '.' + s.length.toString(36);
};
const stub = x => ({
  id: x.id,
  name: x.name,
  updated: x.updated,
  remote: !!x.remote,
  n: x.n ?? x.messages?.length ?? 0,
  cv: x.cv ?? cvh(x.cover)
});
const GH = {
  file: B => (B.path || FN).trim(),
  dir: B => GH.file(B).replace(/\.json$/i, ''),
  u: (B, p) => `https://api.github.com/repos/${B.repo.trim()}/contents/${encodeURI(p)}`,
  h: (B, a) => ({
    Authorization: 'Bearer ' + B.tok.trim(),
    Accept: a || 'application/vnd.github+json'
  }),
  async get(B, p) {
    const r = await fetch(GH.u(B, p), { headers: GH.h(B), cache: 'no-store' });
    if (r.status == 404) return null;
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw bkErr(r, j);
    if (Array.isArray(j)) throw new Error('Le chemin désigne un dossier.');
    let t;
    if (j.encoding == 'base64' && j.content) t = b64d(j.content);
    else {
      const q = await fetch(GH.u(B, p), {
        headers: GH.h(B, 'application/vnd.github.raw+json'),
        cache: 'no-store'
      });
      if (!q.ok) throw bkErr(q, {});
      t = await q.text();
    }
    return { data: parseBk(t), ref: j.sha };
  },
  async send(B, p, method, body) {
    const r = await fetch(GH.u(B, p), {
      method,
      headers: { ...GH.h(B), 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: 'Sauvegarde ' + new Date().toISOString().slice(0, 16).replace('T', ' '),
        ...body
      })
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) {
      const e = bkErr(r, j);
      e.conflict = r.status == 409 || r.status == 422;
      throw e;
    }
    return j;
  },
  async list(B) {
    const r = await fetch(GH.u(B, GH.dir(B)), { headers: GH.h(B), cache: 'no-store' });
    if (r.status == 404) return new Map();
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw bkErr(r, j);
    if (!Array.isArray(j)) throw new Error('Le dossier de sauvegarde porte le nom d’un fichier existant.');
    return new Map(j.filter(x => x.type == 'file').map(x => [x.name, x.sha]));
  },
  read: (B, n) => GH.get(B, GH.dir(B) + '/' + n),
  write: (B, n, text, ref) =>
    GH.send(B, GH.dir(B) + '/' + n, 'PUT', { content: b64e(text), ...(ref ? { sha: ref } : {}) }),
  remove: (B, n, ref) => GH.send(B, GH.dir(B) + '/' + n, 'DELETE', { sha: ref }),
  async squash(B) {
    const j = async (p, body, method = 'POST') => {
      const r = await fetch(`https://api.github.com/repos/${B.repo.trim()}${p}`, {
        cache: 'no-store',
        headers: { ...GH.h(B), ...(body ? { 'Content-Type': 'application/json' } : {}) },
        ...(body ? { method, body: JSON.stringify(body) } : {})
      });
      const x = await r.json().catch(() => ({}));
      if (!r.ok) throw bkErr(r, x);
      return x;
    };
    const br = encodeURI((await j('')).default_branch),
      head = (await j('/git/ref/heads/' + br)).object.sha,
      c = await j('/git/commits/' + head);
    if (!c.parents?.length) return true;
    const ok = [GH.dir(B), GH.file(B)].map(p => p.split('/')[0]);
    if ((await j('/git/trees/' + c.tree.sha)).tree.some(e => !ok.includes(e.path) && !/^(readme|license|\.git)/i.test(e.path)))
      return 'non';
    const n = await j('/git/commits', { message: 'Sauvegarde (historique compacté)', tree: c.tree.sha, parents: [] });
    if ((await j('/git/ref/heads/' + br)).object.sha !== head) return false;
    await j('/git/refs/heads/' + br, { sha: n.sha, force: true }, 'PATCH');
    return true;
  }
};
export const bkOn = () => {
  const B = S.bk;
  return B && B.p == 'gh' && B.repo && B.tok ? B : null;
};
const bkMsg = t => {
  const B = S.bk || {};
  $('#sy').classList.toggle('err', !!B.err);
  $('#bks').textContent =
    t ||
    (B.err
      ? 'Erreur : ' + B.err
      : B.last
        ? 'Dernière synchronisation : ' + ago(B.last) + '.'
        : bkOn()
          ? 'Pas encore synchronisé.'
          : '');
};
let bkBusy = false;
async function syncOnce(B) {
  const L = await GH.list(B),
    idx = (L.has(IDX) && (await GH.read(B, IDX)).data) || {};
  const all = await getAll(),
    ls = all.map(stub),
    LC = new Map(all.map((x, i) => [x.id, [x.cover || '', ls[i].cv]])),
    items = Array.isArray(idx.items) ? idx.items.filter(x => x && typeof x.id == 'string') : [],
    R = new Map(items.map(x => [x.id, x])),
    m = merge(ls, items, S.tomb || {}, idx.tomb || {}, { seen: S.bkSeen || {} });
  const remote = async id => {
    const f = fname(id);
    if (!L.has(f)) throw new Error('Sauvegarde incomplète : fichier ' + f + ' manquant.');
    const d = (await GH.read(B, f)).data || {};
    let cover = typeof d.cover == 'string' ? d.cover : '';
    if (!cover && d.cv) {
      const [lc, lh] = LC.get(id) || [];
      if (lh === d.cv) cover = lc;
      else {
        const g = cname(id);
        if (!L.has(g)) throw new Error('Sauvegarde incomplète : fichier ' + g + ' manquant.');
        cover = (await GH.read(B, g)).data?.d || '';
      }
    }
    const x = clean({ ...d, cover });
    if (!x) throw new Error('Sauvegarde illisible : ' + f + '.');
    return x;
  };
  const made = new Map();
  for (const [c, src, fromR] of m.copies) {
    const x = fromR ? await remote(src) : await getOne(src);
    made.set(c.id, { ...x, id: c.id, name: c.name, updated: c.updated });
  }
  for (const x of m.toLocal) await put(made.get(x.id) || (await remote(x.id)));
  for (const id of m.delLocal) await del(id);
  let n = 0;
  for (const x of m.keep) {
    const f = fname(x.id),
      g = cname(x.id);
    if (L.has(f) && R.get(x.id)?.updated === x.updated) continue;
    const { cover = '', ...rest } = made.get(x.id) || (await getOne(x.id)),
      h = cvh(cover);
    x.cv = h;
    if (h && !(L.has(g) && R.get(x.id)?.cv === h)) {
      await GH.write(B, g, JSON.stringify({ d: cover }), L.get(g));
      n++;
    } else if (!h && L.has(g)) {
      await GH.remove(B, g, L.get(g));
      n++;
    }
    await GH.write(B, f, JSON.stringify({ ...rest, cv: h }), L.get(f));
    n++;
  }
  const live = new Set(m.keep.map(x => x.id));
  for (const id in m.tomb)
    if (!live.has(id))
      for (const f of [fname(id), cname(id)])
        if (L.has(f)) {
          await GH.remove(B, f, L.get(f));
          n++;
        }
  if (n || m.up || !L.has(IDX)) {
    await GH.write(B, IDX, JSON.stringify({ v: 2, saved: Date.now(), items: m.keep.map(stub), tomb: m.tomb }), L.get(IDX));
    n++;
  }
  // Historique compacté tous les SQ fichiers écrits, pour que le dépôt ne grossisse pas indéfiniment.
  if (n) {
    B.cc = (B.cc || 0) + n;
    if (B.cc >= SQ && B.nosq !== B.repo.trim())
      try {
        const r = await GH.squash(B);
        if (r) B.cc = 0;
        if (r == 'non') B.nosq = B.repo.trim();
      } catch (e) {
        B.cc = 0;
      }
  }
  S.tomb = m.tomb;
  S.bkSeen = m.seen;
  const id = app.cur?.id;
  if (!id) return;
  if (m.delLocal.includes(id)) await emit('cur:remote', 'deleted');
  else if (m.toLocal.some(s => s.id == id)) await emit('cur:remote', 'updated');
}
export async function sync(manual) {
  const B = bkOn();
  if (!B || bkBusy || app.busy) return;
  bkBusy = true;
  $('#sy').classList.add('spin');
  bkMsg('Synchronisation…');
  try {
    for (let a = 0; ; a++) {
      try {
        await syncOnce(B);
        break;
      } catch (e) {
        if (e.conflict && a < 2) continue;
        throw e;
      }
    }
    B.last = Date.now();
    B.err = '';
    LS.set('bk', Date.now());
    LS.del('bkd');
  } catch (e) {
    const n = e instanceof TypeError;
    if (!(n && !manual)) B.err = n ? 'Réseau indisponible.' : e.message;
  }
  await saveSet();
  bkBusy = false;
  $('#sy').classList.remove('spin');
  bkMsg();
  emit('list:stale');
}
const bkShow = () => {
  const p = $('#bp').value;
  $('#bgh').hidden = $('#bkn').hidden = !p;
};
function openBk() {
  const B = S.bk || {};
  $('#bp').value = B.p || '';
  $('#bgr').value = B.repo || '';
  $('#bgt').value = B.tok || '';
  $('#bgf').value = B.path || '';
  bkShow();
  bkMsg();
  if (!$('#dbk').open) $('#dbk').showModal();
}
async function bkSave() {
  const o = S.bk || {},
    n = {
      p: $('#bp').value,
      repo: $('#bgr').value.trim(),
      tok: $('#bgt').value.trim(),
      path: $('#bgf').value.trim()
    };
  S.bk = { ...o, ...n, ...(Object.keys(n).some(k => (o[k] || '') !== n[k]) ? { err: '' } : {}) };
  await saveSet();
  bkMsg();
}
$('#bp').onchange = bkShow;
$('#bko').onclick = () => {
  $('#dc').close();
  openBk();
};
$('#bkc').onclick = () => $('#dbk').close();
async function syncNow() {
  await sync(true);
  const e = S.bk?.err;
  if (!e) {
    toast('Sauvegarde à jour');
    return;
  }
  const r = await dlg('Synchronisation impossible', {
    m: e,
    ok: 'Modifier la configuration',
    no: 'Fermer'
  });
  if (r) openBk();
}
$('#bkv').onclick = async () => {
  await bkSave();
  $('#dbk').close();
  if (bkOn()) syncNow();
};
$('#bkn').onclick = async () => {
  await bkSave();
  await sync(true);
  bkMsg();
};
$('#sy').onclick = () => (bkOn() ? syncNow() : openBk());
$('#bkx').onclick = async () => {
  const r = await dlg('Effacer la configuration ?', {
    m: "Le dépôt et le jeton seront oubliés sur cet appareil. Vos histoires et la sauvegarde en ligne ne sont pas touchées.",
    ok: 'Effacer'
  });
  if (!r) return;
  S.bk = {};
  LS.del('bks');
  await saveSet();
  openBk();
};
document.addEventListener('visibilitychange', () => {
  if (document.hidden && LS.get('bkd')) sync();
});
