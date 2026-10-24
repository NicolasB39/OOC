import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';

const js = readdirSync('js')
  .filter(f => f.endsWith('.js'))
  .sort();
const modules = js.filter(f => f !== 'boot.js' && f !== 'reparer.js');
const assets = [
  'index.html',
  'reparer.html',
  'manifest.json',
  'icon-180.png',
  'icon-192.png',
  'icon-512.png',
  'icon-192-mask.png',
  'icon-512-mask.png',
  'css/style.css',
  ...js.map(f => 'js/' + f)
];

let html = readFileSync('index.html', 'utf8');

const ids = [...html.matchAll(/\sid="([^"]+)"/g)].map(m => m[1]);
const dup = ids.filter((x, i) => ids.indexOf(x) !== i);
if (dup.length) throw new Error('id dupliqué dans index.html : ' + [...new Set(dup)].join(', '));
for (const [, f] of html.matchAll(/\sfor="([^"]+)"/g))
  if (!ids.includes(f)) throw new Error('label orphelin : for="' + f + '"');

const dlgIds = [...html.matchAll(/<dialog[^>]*\sid="([^"]+)"/g)].map(m => m[1]);
const css = readFileSync('css/style.css', 'utf8');
const hitsDialog = sel => {
  const last = sel.trim().split(/[\s>+~]+/).pop();
  if (/::?[a-z-]+$/.test(last) || last.includes('[open]')) return false;
  return /^dialog\b/.test(last) || dlgIds.some(i => last.startsWith('#' + i));
};
for (const [, sel, body] of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
  if (!/(^|[;{\s])display\s*:/.test(body)) continue;
  for (const one of sel.split(','))
    if (hitsDialog(one))
      throw new Error(
        'règle « ' + one.trim() + ' » fixe display sur une feuille fermée : visez le sélecteur [open]'
      );
}

const DYN = ['live'];
for (const f of modules) {
  const src = readFileSync('js/' + f, 'utf8');
  for (const [, id] of src.matchAll(/\$\('#([A-Za-z0-9_-]+)'\)/g))
    if (!ids.includes(id) && !DYN.includes(id))
      throw new Error(`js/${f} vise #${id}, absent de index.html`);
}

const RV = [/(<meta name="app-version" content=")[^"]*/, /(const VERSION = ')[^']*/];
const h = createHash('sha256');
for (const a of assets) {
  let b = readFileSync(a);
  if (/\.(html|js|css|json)$/.test(a)) {
    let t = b.toString('utf8');
    for (const r of RV) t = t.replace(r, '$1');
    b = Buffer.from(t);
  }
  h.update(b);
}
const V = h.digest('hex').slice(0, 10);

html = html.replace(
  /(<meta name="app-version" content=")[^"]*(">)/,
  (_, a, b) => a + V + b
);
html = html.replace(
  /<!--PRELOAD-->[\s\S]*?<!--\/PRELOAD-->/,
  '<!--PRELOAD-->\n' +
    modules.map(f => `<link rel="modulepreload" href="js/${f}">`).join('\n') +
    '\n<!--/PRELOAD-->'
);
writeFileSync('index.html', html);

const list = ["'./'", ...assets.map(a => `'${a}'`)].join(',\n    ');
writeFileSync(
  'sw.js',
  readFileSync('sw.js', 'utf8').replace(
    /const C = '[^']*',\n {2}A = \[[\s\S]*?\n {2}\],/,
    `const C = 'histoires-${V}',\n  A = [\n    ${list}\n  ],`
  )
);

writeFileSync(
  'js/main.js',
  readFileSync('js/main.js', 'utf8').replace(/const VERSION = '[^']*';/, `const VERSION = '${V}';`)
);

console.log('version', V, '·', assets.length, 'fichiers');
