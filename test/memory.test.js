import { test } from 'node:test';
import assert from 'node:assert/strict';
import { asJson, toRel, strs } from '../js/ai.js';

test('asJson accepte un objet entouré de texte ou de balises', () => {
  assert.equal(asJson('```json\n{"resume":"ok"}\n```').resume, 'ok');
  assert.equal(asJson('Voici :\n{"resume":"ok"}\nVoilà.').resume, 'ok');
});

test('asJson rejette ce qui n’est pas exploitable', () => {
  assert.equal(asJson('[RÉSUMÉ]\ndu texte'), null);
  assert.equal(asJson('{"resume":""}'), null);
  assert.equal(asJson('{"souvenirs":[]}'), null);
  assert.equal(asJson('{cassé'), null);
});

test('toRel accepte les trois formes que renvoient les modèles', () => {
  assert.deepEqual(toRel({ Alice: 'méfiante' }), { Alice: 'méfiante' });
  assert.deepEqual(toRel(['Alice: méfiante']), { Alice: 'méfiante' });
  assert.deepEqual(toRel([{ nom: 'Alice', relation: 'méfiante' }]), { Alice: 'méfiante' });
  assert.deepEqual(toRel(null), {});
});

test('strs nettoie les puces et écarte les « aucun »', () => {
  assert.deepEqual(strs(['- un', '  * deux', 'aucun', '']), ['un', 'deux']);
  assert.deepEqual(strs('un\n- deux'), ['un', 'deux']);
  assert.deepEqual(strs(undefined), []);
});
