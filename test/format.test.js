import assert from 'node:assert/strict';
import test from 'node:test';

const node = t => ({
  tagName: t.toUpperCase(),
  className: '',
  textContent: '',
  dataset: {},
  style: {},
  kids: [],
  append(...x) {
    this.kids.push(...x);
  },
  setAttribute(k, v) {
    this[k] = v;
  }
});
globalThis.document = { createElement: node };

const { body } = await import('../js/format.js');

const shape = t =>
  body(t).map(x => (typeof x == 'string' ? 'txt' : x.tagName + (x.className ? '.' + x.className : '')));
const texts = t =>
  body(t)
    .filter(x => x.tagName == 'P')
    .map(x => x.kids.map(k => (typeof k == 'string' ? k : k.textContent)).join(''));

test('une ligne vide sépare deux paragraphes', () => {
  assert.deepEqual(shape('Un.\n\nDeux.'), ['P', 'P']);
  assert.deepEqual(texts('Un.\n\nDeux.'), ['Un.', 'Deux.']);
});

test('un simple retour à la ligne reste dans le paragraphe', () => {
  assert.deepEqual(texts('Un.\nEncore.'), ['Un.\nEncore.']);
});

test('les lignes vides en trop ne créent pas de paragraphe vide', () => {
  assert.deepEqual(shape('Un.\n\n\n\nDeux.\n\n'), ['P', 'P']);
});

test('une image ne laisse aucun paragraphe vide autour d’elle', () => {
  assert.deepEqual(shape('Un.\n\n{{img::x}}\n\nDeux.'), ['P', 'SPAN.miss', 'P']);
  assert.deepEqual(shape('{{img::x}}'), ['SPAN.miss']);
  assert.deepEqual(shape('Un.\n\n{{img::x}}'), ['P', 'SPAN.miss']);
});

test('les lignes de citation consécutives forment un seul bloc', () => {
  assert.deepEqual(shape('> a\n> b\n\nSuite.'), ['P.q', 'P']);
  assert.deepEqual(texts('> a\n> b\n\nSuite.'), ['a\nb', 'Suite.']);
});

test('les séparateurs restent des hr', () => {
  assert.deepEqual(shape('Un.\n---\nDeux.'), ['P', 'HR', 'P']);
});

test('les blocs du protocole sont retirés avant le découpage', () => {
  assert.deepEqual(shape('Un.\n\n<etat>\nLieu: ici\n</etat>\n\n<choix>\n1. a\n</choix>'), ['P']);
});
