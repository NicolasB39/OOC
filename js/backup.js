import { render } from './chat.js';
import { draw } from './list.js';
import { merge } from './merge.js';
import { S, app } from './state.js';
import { clean, del, getAll, getFull, getOne, put, saveSet } from './store.js';
import { $, LS, ago, dlg, toast, uid } from './util.js';

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
  read: (B, tok, n) => GH.get(B, GH.dir(B) + '/' + n),
  write: (B, tok, n, text, ref) =>
    GH.send(B, GH.dir(B) + '/' + n, 'PUT', { content: b64e(text), ...(ref ? { sha: ref } : {}) }),
  remove: (B, tok, n, ref) => GH.send(B, GH.dir(B) + '/' + n, 'DELETE', { sha: ref }),
  legacy: B => GH.get(B, GH.file(B)),
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
export const gis = () =>
  new Promise((res, rej) => {
    if (window.google?.accounts?.oauth2) return res();
    const s = document.createElement('script');
    s.src = 'https://accounts.google.com/gsi/client';
    s.onload = res;
    s.onerror = () => rej(new Error('Google indisponible (hors ligne ?)'));
    document.head.append(s);
  });
const DR = {
  async auth(B, manual) {
    const c = JSON.parse(LS.get('bk:tok') || 'null');
    if (c && c.exp > Date.now() + 6e4) return c.t;
    if (!manual) {
      const e = new Error('Connexion Google requise.');
      e.quiet = true;
      throw e;
    }
    await gis();
    return new Promise((res, rej) => {
      const tc = google.accounts.oauth2.initTokenClient({
        client_id: B.cid.trim(),
        scope: 'https://www.googleapis.com/auth/drive.appdata',
        callback: r => {
          if (r.error) return rej(new Error(r.error_description || r.error));
          LS.set(
            'bk:tok',
            JSON.stringify({ t: r.access_token, exp: Date.now() + (r.expires_in - 60) * 1000 })
          );
          res(r.access_token);
        },
        error_callback: e =>
          rej(
            new Error(
              e.type == 'popup_closed' ? 'Connexion annulée.' : 'Connexion Google impossible.'
            )
          )
      });
      tc.requestAccessToken({ prompt: '' });
    });
  },
  async api(tok, url, o = {}) {
    const r = await fetch(url, { ...o, headers: { Authorization: 'Bearer ' + tok, ...o.headers } });
    if (r.status == 401) {
      LS.del('bk:tok');
      throw new Error('Session Google expirée : touchez le nuage pour vous reconnecter.');
    }
    if (!r.ok) {
      const j = await r.json().catch(() => ({}));
      throw new Error(j.error?.message || 'Erreur Google ' + r.status);
    }
    return r;
  },
  q: n => 'https://www.googleapis.com/drive/v3/files?spaces=appDataFolder&pageSize=1000&fields=files(id,name)&q=' + encodeURIComponent(n),
  async read(B, tok, n, ref) {
    return {
      data: parseBk(await (await DR.api(tok, 'https://www.googleapis.com/drive/v3/files/' + ref + '?alt=media')).text()),
      ref
    };
  },
  async list(B, tok) {
    const l = await (await DR.api(tok, DR.q("name contains 'sync-'"))).json();
    return new Map((l.files || []).filter(f => f.name.startsWith('sync-')).map(f => [f.name.slice(5), f.id]));
  },
  async legacy(B, tok) {
    const l = await (await DR.api(tok, DR.q("name='" + FN + "'"))).json();
    const id = l.files?.[0]?.id;
    return id ? DR.read(B, tok, FN, id) : null;
  },
  async write(B, tok, n, text, ref) {
    if (ref)
      return DR.api(tok, 'https://www.googleapis.com/upload/drive/v3/files/' + ref + '?uploadType=media', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: text
      });
    const bd = 'b' + uid();
    return DR.api(tok, 'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart', {
      method: 'POST',
      headers: { 'Content-Type': 'multipart/related; boundary=' + bd },
      body: `--${bd}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify({ name: 'sync-' + n, parents: ['appDataFolder'] })}\r\n--${bd}\r\nContent-Type: application/json\r\n\r\n${text}\r\n--${bd}--`
    });
  },
  remove: (B, tok, n, ref) => DR.api(tok, 'https://www.googleapis.com/drive/v3/files/' + ref, { method: 'DELETE' })
};
export const bkOn = () => {
  const B = S.bk;
  return B && ((B.p == 'gh' && B.repo && B.tok) || (B.p == 'drive' && B.cid)) ? B : null;
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
async function syncOnce(B, manual) {
  const P = B.p == 'gh' ? GH : DR;
  const tok = P.auth ? await P.auth(B, manual) : null;
  const L = await P.list(B, tok);
  let idx = L.has(IDX) ? (await P.read(B, tok, IDX, L.get(IDX))).data : null,
    old = null;
  if (!idx) {
    const o = await P.legacy(B, tok);
    old = new Map(
      (Array.isArray(o?.data?.scenarios) ? o.data.scenarios : [])
        .map(clean)
        .filter(Boolean)
        .map(x => [x.id, x])
    );
    idx = { tomb: o?.data?.tomb || {}, items: [...old.values()].map(stub) };
  }
  const all = await getAll(),
    ls = all.map(stub),
    LC = new Map(all.map((x, i) => [x.id, [x.cover || '', ls[i].cv]])),
    items = Array.isArray(idx.items) ? idx.items.filter(x => x && typeof x.id == 'string') : [],
    R = new Map(items.map(x => [x.id, x])),
    m = merge(ls, items, S.tomb || {}, idx.tomb || {}, { seen: S.bkSeen || {} });
  const remote = async id => {
    if (old?.has(id)) return old.get(id);
    const f = fname(id);
    if (!L.has(f)) throw new Error('Sauvegarde incomplète : fichier ' + f + ' manquant.');
    const d = (await P.read(B, tok, f, L.get(f))).data || {};
    let cover = typeof d.cover == 'string' ? d.cover : '';
    if (!cover && d.cv) {
      const [lc, lh] = LC.get(id) || [];
      if (lh === d.cv) cover = lc;
      else {
        const g = cname(id);
        if (!L.has(g)) throw new Error('Sauvegarde incomplète : fichier ' + g + ' manquant.');
        cover = (await P.read(B, tok, g, L.get(g))).data?.d || '';
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
      await P.write(B, tok, g, JSON.stringify({ d: cover }), L.get(g));
      n++;
    } else if (!h && L.has(g)) {
      await P.remove(B, tok, g, L.get(g));
      n++;
    }
    await P.write(B, tok, f, JSON.stringify({ ...rest, cv: h }), L.get(f));
    n++;
  }
  const live = new Set(m.keep.map(x => x.id));
  for (const id in m.tomb)
    if (!live.has(id))
      for (const f of [fname(id), cname(id)])
        if (L.has(f)) {
          await P.remove(B, tok, f, L.get(f));
          n++;
        }
  if (n || m.up || !L.has(IDX)) {
    await P.write(
      B,
      tok,
      IDX,
      JSON.stringify({ v: 2, saved: Date.now(), items: m.keep.map(stub), tomb: m.tomb }),
      L.get(IDX)
    );
    n++;
  }
  if (B.p == 'gh' && n) {
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
  if (m.delLocal.includes(id)) {
    toast('Cette histoire a été supprimée sur un autre appareil');
    $('#back').click();
  } else if (m.toLocal.some(s => s.id == id)) {
    app.cur = await getOne(id);
    render();
    toast('Histoire mise à jour depuis un autre appareil');
  }
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
        await syncOnce(B, manual);
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
    if (!e.quiet && !(n && !manual)) B.err = n ? 'Réseau indisponible.' : e.message;
  }
  await saveSet();
  bkBusy = false;
  $('#sy').classList.remove('spin');
  bkMsg();
  if (!$('#list').hidden) draw();
}
const bkShow = () => {
  const p = $('#bp').value;
  $('#bgh').hidden = p != 'gh';
  $('#bdr').hidden = p != 'drive';
  $('#bkn').hidden = !p;
  if (p == 'drive') gis().catch(() => {});
};
function openBk() {
  const B = S.bk || {};
  $('#bp').value = B.p || '';
  $('#bgr').value = B.repo || '';
  $('#bgt').value = B.tok || '';
  $('#bgf').value = B.path || '';
  $('#bci').value = B.cid || '';
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
      path: $('#bgf').value.trim(),
      cid: $('#bci').value.trim()
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
    m: "Le service, le jeton ou l'ID client et la connexion Google seront oubliés sur cet appareil. Vos histoires et la sauvegarde en ligne ne sont pas touchées.",
    ok: 'Effacer'
  });
  if (!r) return;
  S.bk = {};
  LS.del('bk:tok');
  LS.del('bks');
  await saveSet();
  openBk();
};
document.addEventListener('visibilitychange', () => {
  if (document.hidden && LS.get('bkd')) sync();
});
