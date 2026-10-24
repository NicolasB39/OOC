import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { note, reset, resetDur, status, wait } from '../js/rate.js';
import { S } from '../js/state.js';

const hdr = o => ({ get: k => (k in o ? o[k] : null) });

const M = 'modele-test';
beforeEach(() => {
  S.tpm = 0;
  S.tpms = {};
  reset();
});

test('sans en-tête ni réglage, pas de jauge', () => {
  assert.equal(status(M), null);
});

test('les en-têtes du fournisseur font foi et mémorisent la limite', () => {
  note(
    hdr({
      'x-ratelimit-limit-tokens': '8000',
      'x-ratelimit-remaining-tokens': '2000',
      'x-ratelimit-reset-tokens': '19.5s',
      'x-ratelimit-remaining-requests': '14390'
    }),
    { prompt_tokens: 2100, completion_tokens: 500, prompt_tokens_details: { cached_tokens: 1700 } },
    M
  );
  const s = status(M);
  assert.equal(s.src, 'api');
  assert.equal(s.lim, 8000);
  assert.ok(s.rem >= 2000 && s.rem < 2100);
  assert.equal(S.tpms[M], 8000);
});

test('en-têtes absents : repli sur la fenêtre glissante locale', () => {
  S.tpm = 8000;
  note(hdr({}), { total_tokens: 2600 }, M);
  const s = status(M);
  assert.equal(s.src, 'local');
  assert.equal(s.rem, 8000 - 2600);
});

test('wait vaut zéro tant que le tour tient dans le reste', () => {
  S.tpm = 8000;
  note(hdr({}), { total_tokens: 2000 }, M);
  assert.equal(wait(3000, M), 0);
  assert.ok(wait(7000, M) > 0);
});

test('un tour plus gros que la limite entière ne fait pas attendre pour rien', () => {
  S.tpm = 8000;
  assert.equal(wait(9000, M), 0);
});

test('le total consommé agrège entrée et sortie', () => {
  S.tpm = 10000;
  note(hdr({}), { prompt_tokens: 1000, completion_tokens: 500 }, M);
  assert.equal(status(M).rem, 8500);
});

test('chaque modèle a son propre compteur', () => {
  S.tpm = 8000;
  note(hdr({}), { total_tokens: 5000 }, 'narration');
  note(hdr({}), { total_tokens: 500 }, 'memoire');
  assert.equal(status('narration').rem, 3000);
  assert.equal(status('memoire').rem, 7500);
});

test('resetDur lit les durées des en-têtes et des messages d’erreur', () => {
  assert.equal(resetDur('19.5s'), 19500);
  assert.equal(resetDur('2m59.56s'), 179560);
  assert.equal(resetDur('1m23.4s'), 83400);
  assert.equal(resetDur(''), 0);
});
