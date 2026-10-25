import assert from 'node:assert/strict';
import test from 'node:test';

globalThis.document = { createElement: () => ({}), querySelector: () => null, querySelectorAll: () => [] };
globalThis.matchMedia = () => ({ matches: false });
globalThis.localStorage = { getItem: () => null, setItem() {}, removeItem() {} };

const { strip } = await import('../js/util.js');
const { asJson } = await import('../js/ai.js');

const J = '{"resume":"Ok","souvenirs":["a"],"relations":{},"lignes":["x"]}';
const lu = t => asJson(strip(t));

test('raisonnement entre balises complètes', () => {
  assert.equal(lu('<think>Je réponds en {"resume": "..."} puis…</think>\n' + J).resume, 'Ok');
});

test('raisonnement sans balise ouvrante : seul </think> apparaît', () => {
  const t = 'Le format est {"resume": "...", "souvenirs": []}. Voyons.\n</think>\n' + J;
  assert.equal(strip(t), J);
  assert.equal(lu(t).resume, 'Ok');
});

test('raisonnement en prose qui cite le schéma avant le JSON', () => {
  assert.equal(lu('Le schéma est {"resume": ..., "lignes": [...]}.\n' + J).resume, 'Ok');
});

test('JSON entouré de clôtures Markdown', () => {
  assert.equal(lu('```json\n' + J + '\n```').resume, 'Ok');
});

test('un <think> tronqué ne laisse rien et ne produit pas de JSON', () => {
  assert.equal(strip('<think>Je réfléchis et je cite {"resume"'), '');
  assert.equal(lu('<think>Je réfléchis et je cite {"resume"'), null);
});

test('un texte sans résumé exploitable reste refusé', () => {
  assert.equal(asJson('{"autre": 1}'), null);
  assert.equal(asJson('pas de json'), null);
  assert.equal(asJson('{"resume": "  "}'), null);
});
