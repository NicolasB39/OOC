import { IMG, S, app, ctx } from './state.js';
import { LS, nz } from './util.js';

let TREE = null;
export let TERR = '';
export const coverOf = s => {
  if (!s.remote || !s.folder) return '';
  let T = TREE;
  if (!T) {
    try {
      T = JSON.parse(LS.get('tree') || 'null')?.p;
    } catch (e) {}
  }
  const b = 'scenarios/' + s.folder + '/',
    f = (T || []).find(
      p => p.startsWith(b) && /^cover\.(webp|png|jpe?g|gif)$/i.test(p.slice(b.length))
    );
  return f ? encodeURI(f) : '';
};
const txt = p =>
  fetch(encodeURI(p), { cache: 'no-cache' })
    .then(r => (r.ok ? r.text() : ''))
    .catch(() => '');
const kre = k => {
  const p = k.endsWith('*'),
    e = (p ? k.slice(0, -1) : k).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return e ? new RegExp('(^|[^a-z0-9])' + e + (p ? '' : '(?![a-z0-9])')) : null;
};
const repo = () => {
  if (/^[\w.-]+\/[\w.-]+$/.test(S.repo || '')) return S.repo.split('/');
  const seg = location.pathname.split('/')[1];
  return [location.hostname.split('.')[0], seg && !seg.includes('.') ? seg : location.hostname];
};
export async function getTree(force) {
  let c = null;
  try {
    c = JSON.parse(LS.get('tree') || 'null');
  } catch (e) {}
  if (!force && c && Date.now() - c.t < 600000) {
    TREE = c.p;
    TERR = '';
    return TREE;
  }
  TERR = '';
  try {
    const r = await fetch('index.json', { cache: 'no-cache' });
    const j = r.ok ? await r.json().catch(() => null) : null;
    if (Array.isArray(j) && j.every(x => typeof x == 'string')) {
      TREE = j;
      LS.set('tree', JSON.stringify({ t: Date.now(), p: TREE }));
      return TREE;
    }
  } catch (e) {}
  try {
    const [o, r] = repo();
    const j = await (
      await fetch(`https://api.github.com/repos/${o}/${r}/git/trees/HEAD?recursive=1`)
    ).json();
    if (j.tree) {
      TREE = j.tree.filter(x => x.type == 'blob').map(x => x.path);
      if (j.truncated) TERR = 'arbre GitHub tronqué, ajoutez index.json (voir README)';
      LS.set('tree', JSON.stringify({ t: Date.now(), p: TREE }));
    } else TERR = j.message || 'réponse inattendue';
  } catch (e) {
    TERR = 'réseau indisponible';
  }
  if (TERR && !TREE && c) TREE = c.p;
  return TREE || [];
}
export async function loadCtx() {
  for (const k in IMG) delete IMG[k];
  Object.assign(ctx, { system: '', avatar: '', extra: '', lore: [] });
  if (!app.cur.remote) return;
  const base = 'scenarios/' + app.cur.folder + '/',
    pb = base + 'personnages/';
  const [T, system, avatar] = await Promise.all([
    getTree(),
    txt(base + 'systeme.md'),
    txt(base + 'avatar.md')
  ]);
  const ch = {};
  for (const p of T) {
    if (!p.startsWith(pb)) continue;
    const [n, file, ...rest] = p.slice(pb.length).split('/');
    if (!file || rest.length) continue;
    (ch[n] ??= []).push(file);
  }
  let extra = '',
    codes = [];
  const fp = [];
  for (const [n, files] of Object.entries(ch)) {
    for (const f of files) {
      const m = f.match(/^(.+)\.(webp|png|jpe?g|gif)$/i);
      if (m) {
        const c = (n + '_' + m[1]).toLowerCase();
        IMG[c] = encodeURI(pb + n + '/' + f);
        codes.push(c);
      }
    }
    if (files.includes('fiche.md'))
      fp.push(txt(pb + n + '/fiche.md').then(t => '\n\n# Personnage : ' + n + '\n' + t));
  }
  extra = (await Promise.all(fp)).join('');
  if (codes.length)
    extra +=
      '\n\n# Images\nCodes disponibles : ' +
      codes.join(', ') +
      '\nPour afficher une image, écris {{img::code}} seul sur sa propre ligne, avec un code de cette liste.';
  const lb = base + 'lorebook/';
  const lore = (
    await Promise.all(
      T.filter(p => p.startsWith(lb) && p.endsWith('.md') && !p.slice(lb.length).includes('/')).map(
        p => txt(p)
      )
    )
  )
    .map(t => {
      const ls = t.split(/\r?\n/);
      let keys = [],
        always = false,
        pr = 0,
        i = 0;
      for (; i < ls.length; i++) {
        const m = ls[i].match(/^\s*(mots[-\s]?cl[ée]s|toujours|priorit[ée])\s*(?::\s*(.*))?$/i);
        if (!m) break;
        const n = nz(m[1]),
          v = (m[2] || '').trim();
        if (n.startsWith('mots'))
          keys = v
            .split(',')
            .map(k => kre(nz(k.trim())))
            .filter(Boolean);
        else if (n == 'toujours') always = !/^(non|false|0)$/i.test(v);
        else pr = +v || 0;
      }
      const text = ls.slice(i).join('\n').trim();
      return text && (always || keys.length) ? { keys, always, pr, text } : null;
    })
    .filter(Boolean);
  Object.assign(ctx, { system, avatar, extra, lore });
}
