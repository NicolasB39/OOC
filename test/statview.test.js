import assert from 'node:assert/strict';
import test from 'node:test';

const node = tag => ({
  tagName: String(tag).toUpperCase(),
  kids: [],
  dataset: {},
  style: {},
  attrs: {},
  hidden: false,
  disabled: false,
  textContent: '',
  className: '',
  append(...x) {
    this.kids.push(...x);
  },
  replaceChildren(...x) {
    for (const k of x) assert.ok(k && typeof k == 'object' && k.tagName, 'enfant invalide : ' + String(k));
    this.kids = x;
  },
  setAttribute(k, v) {
    this.attrs[k] = v;
  },
  querySelectorAll: () => [],
  showModal() {},
  close() {}
});
const reg = {};
globalThis.document = {
  createElement: node,
  querySelector: s => (reg[s] ??= node('x')),
  querySelectorAll: () => []
};
globalThis.matchMedia = () => ({ matches: false });
globalThis.localStorage = { getItem: () => null, setItem() {}, removeItem() {} };

const { view } = await import('../js/statview.js');
const { record, clear } = await import('../js/stats.js');

const texts = n => [n.textContent, ...n.kids.flatMap(k => (typeof k == 'object' ? texts(k) : []))];

test('la feuille se construit sans enfant invalide, vide comme remplie', () => {
  clear();
  view();
  assert.ok(texts(reg['#usv']).some(t => /Rien depuis/.test(t)));

  record('groq/llama-3.3-70b', 1200, 300);
  record('openrouter/meta-llama/llama-4', 50, 20, true);
  view();
  const all = texts(reg['#usv']).join('|');
  assert.match(all, /llama-3\.3-70b/);
  assert.match(all, /llama-4/);
  assert.match(all, /estimée/);
  assert.doesNotMatch(all, /null|object/);
});

test('les boutons de période déclenchent chaque vue sans erreur', () => {
  record('groq/a', 10, 5);
  for (const m of ['day', 'month', 'session']) {
    reg['#ust'].onclick({ target: { closest: () => ({ dataset: { m } }) } });
    assert.ok(reg['#usv'].kids.length > 0);
  }
  reg['#ust'].onclick({ target: { closest: () => ({ dataset: { m: 'day' } }) } });
  reg['#usp'].onclick();
  assert.match(reg['#usl'].textContent, /^[A-ZÉÈÀ]/);
  assert.doesNotMatch(reg['#usl'].textContent, /\b[A-Z][a-zéû]+ [A-Z][a-zéû]+ \d/);
});
