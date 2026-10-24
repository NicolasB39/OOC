import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { protocol, family, conflicts } from '../js/protocol.js';
import { buildInfo } from '../js/prompt.js';
import { clean } from '../js/store.js';
import { S, ctx } from '../js/state.js';

beforeEach(() => {
  S.proto = '';
  S.pre = '';
  S.ctxLim = 0;
  Object.assign(ctx, { system: '', avatar: '', chars: [], lore: [], images: [], stat: '' });
});

test('les gros modèles passent en consignes concises', () => {
  assert.equal(family('llama-3.3-70b-versatile'), 'full');
  assert.equal(family('mistral-small-latest'), 'full');
  assert.equal(family('claude-sonnet-4-6'), 'lean');
  assert.equal(family('gpt-5'), 'lean');
  assert.equal(family(''), 'full');
});

test('le réglage manuel l’emporte sur la détection', () => {
  S.proto = 'lean';
  assert.equal(family('llama-3.3-70b-versatile'), 'lean');
  S.proto = 'full';
  assert.equal(family('gpt-5'), 'full');
});

test('le mode concis est plus court et supprime le rappel', () => {
  const o = { stat: true, fields: 'Lieu', choices: true, images: true };
  const a = protocol({ ...o, model: 'llama-3.3-70b-versatile' });
  const b = protocol({ ...o, model: 'gpt-5' });
  assert.ok(b.sys.length < a.sys.length);
  assert.match(a.tail, /<rappel>/);
  assert.equal(b.tail, '');
});

test('le rappel ne liste que les blocs activés', () => {
  assert.match(protocol({ stat: true, choices: false }).tail, /le bloc <etat>\.$/m);
  assert.match(protocol({ stat: true, choices: true }).tail, /<etat> puis le bloc <choix>/);
  assert.equal(protocol({ stat: false, choices: false }).tail, '');
});

test('aucun format n’est émis pour ce qui est désactivé', () => {
  const p = protocol({ stat: false, choices: false, images: false });
  assert.equal(p.sys, '');
});

test('conflicts repère les formats redéfinis par un scénario', () => {
  assert.deepEqual(conflicts('Réponds avec <choix> à la fin.'), ['le format des choix']);
  assert.equal(conflicts('Tu es un narrateur.').length, 0);
  assert.equal(conflicts('<etat> et {{img::x}}').length, 2);
});

test('le préambule commun est injecté dans le système', () => {
  S.pre = 'Quatre paragraphes maximum.';
  const s = clean({ id: 'a', system: 'SYS', noChoices: true, messages: [{ role: 'user', content: 'x' }] });
  assert.match(buildInfo(s).msgs[0].content, /Quatre paragraphes maximum\./);
});

test('un scénario peut ignorer le préambule commun', () => {
  S.pre = 'Quatre paragraphes maximum.';
  const s = clean({
    id: 'a',
    system: 'SYS',
    noPre: true,
    noChoices: true,
    messages: [{ role: 'user', content: 'x' }]
  });
  assert.doesNotMatch(buildInfo(s).msgs[0].content, /Quatre paragraphes/);
});
