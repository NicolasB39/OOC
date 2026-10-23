import { draw } from './list.js';
import { S } from './state.js';
import { clean, del, getFull, put, saveSet } from './store.js';
import { $, LS, ago, dlg, toast, uid } from './util.js';

async function doExport() {
  const f = new File(
    [JSON.stringify({ v: 1, scenarios: await getFull() })],
    'histoires-' + new Date().toISOString().slice(0, 10) + '.json',
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
const GH = {
  u: B =>
    `https://api.github.com/repos/${B.repo.trim()}/contents/${encodeURI((B.path || FN).trim())}`,
  h: (B, a) => ({
    Authorization: 'Bearer ' + B.tok.trim(),
    Accept: a || 'application/vnd.github+json'
  }),
  async get(B) {
    const r = await fetch(GH.u(B), { headers: GH.h(B), cache: 'no-store' });
    if (r.status == 404) return null;
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw bkErr(r, j);
    if (Array.isArray(j)) throw new Error('Le chemin désigne un dossier.');
    let t;
    if (j.encoding == 'base64' && j.content) t = b64d(j.content);
    else {
      const q = await fetch(GH.u(B), {
        headers: GH.h(B, 'application/vnd.github.raw+json'),
        cache: 'no-store'
      });
      if (!q.ok) throw bkErr(q, {});
      t = await q.text();
    }
    return { data: parseBk(t), ref: j.sha };
  },
  async put(B, text, ref) {
    const r = await fetch(GH.u(B), {
      method: 'PUT',
      headers: { ...GH.h(B), 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: 'Sauvegarde ' + new Date().toISOString().slice(0, 16).replace('T', ' '),
        content: b64e(text),
        ...(ref ? { sha: ref } : {})
      })
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) {
      const e = bkErr(r, j);
      e.conflict = r.status == 409 || r.status == 422;
      throw e;
    }
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
  async get(B, tok) {
    const l = await (
      await DR.api(
        tok,
        'https://www.googleapis.com/drive/v3/files?spaces=appDataFolder&fields=files(id)&q=' +
          encodeURIComponent("name='" + FN + "'")
      )
    ).json();
    const id = l.files?.[0]?.id;
    if (!id) return null;
    return {
      data: parseBk(
        await (
          await DR.api(tok, 'https://www.googleapis.com/drive/v3/files/' + id + '?alt=media')
        ).text()
      ),
      ref: id
    };
  },
  async put(B, text, ref, tok) {
    if (ref) {
      await DR.api(
        tok,
        'https://www.googleapis.com/upload/drive/v3/files/' + ref + '?uploadType=media',
        { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: text }
      );
      return;
    }
    const bd = 'b' + uid();
    await DR.api(tok, 'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart', {
      method: 'POST',
      headers: { 'Content-Type': 'multipart/related; boundary=' + bd },
      body: `--${bd}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify({ name: FN, parents: ['appDataFolder'] })}\r\n--${bd}\r\nContent-Type: application/json\r\n\r\n${text}\r\n--${bd}--`
    });
  }
};
const syncable = s => !(s.remote && !s.messages.length);
export function merge(loc, rem, t1, t2) {
  const tomb = { ...t1 };
  let up = false;
  for (const k in t2) if ((t2[k] || 0) > (tomb[k] || 0)) tomb[k] = t2[k];
  for (const k in tomb) if ((t2[k] || 0) < tomb[k]) up = true;
  const L = new Map(loc.map(s => [s.id, s])),
    R = new Map(rem.filter(syncable).map(s => [s.id, s]));
  const keep = [],
    toLocal = [],
    delLocal = [];
  for (const id of new Set([...L.keys(), ...R.keys()])) {
    const l = L.get(id),
      r = R.get(id),
      p = !r || (l && l.updated >= r.updated) ? l : r;
    if ((tomb[id] || 0) >= p.updated) {
      if (l) delLocal.push(id);
      if (r) up = true;
      continue;
    }
    keep.push(p);
    if (p === r && (!l || r.updated > l.updated)) toLocal.push(r);
    if (p === l && (!r || l.updated > r.updated)) up = true;
  }
  return { keep, toLocal, delLocal, tomb, up };
}
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
  const rm = await P.get(B, tok);
  const rd = rm?.data;
  const rem = Array.isArray(rd?.scenarios) ? rd.scenarios.map(clean).filter(Boolean) : [];
  const m = merge((await getFull()).filter(syncable), rem, S.tomb || {}, rd?.tomb || {});
  for (const s of m.toLocal) await put(s);
  for (const id of m.delLocal) await del(id);
  S.tomb = m.tomb;
  if (!rm || m.up)
    await P.put(
      B,
      JSON.stringify({ v: 1, saved: Date.now(), scenarios: m.keep, tomb: m.tomb }),
      rm?.ref,
      tok
    );
}
export async function sync(manual) {
  const B = bkOn();
  if (!B || bkBusy) return;
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
