import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { note, reset, status, wait } from '../js/rate.js';
import { S } from '../js/state.js';

const hdr = o => ({ get: k => (k in o ? o[k] : null) });

beforeEach(() => {
  S.tpm = 0;
  reset();
});

test('sans en-tête ni réglage, pas de jauge', () => {
  assert.equal(status(), null);
});

test('les en-têtes du fournisseur font foi et mémorisent la limite', () => {
  note(
    hdr({
      'x-ratelimit-limit-tokens': '8000',
      'x-ratelimit-remaining-tokens': '2000',
      'x-ratelimit-reset-tokens': '19.5s',
      'x-ratelimit-remaining-requests': '14390'
    }),
    { prompt_tokens: 2100, completion_tokens: 500, prompt_tokens_details: { cached_tokens: 1700 } }
  );
  const s = status();
  assert.equal(s.src, 'api');
  assert.equal(s.lim, 8000);
  assert.ok(s.rem >= 2000 && s.rem < 2100);
  assert.equal(S.tpm, 8000);
});

test('en-têtes absents : repli sur la fenêtre glissante locale', () => {
  S.tpm = 8000;
  note(hdr({}), { total_tokens: 2600 });
  const s = status();
  assert.equal(s.src, 'local');
  assert.equal(s.rem, 8000 - 2600);
});

test('wait vaut zéro tant que le tour tient dans le reste', () => {
  S.tpm = 8000;
  note(hdr({}), { total_tokens: 2000 });
  assert.equal(wait(3000), 0);
  assert.ok(wait(7000) > 0);
});

test('un tour plus gros que la limite entière ne fait pas attendre pour rien', () => {
  S.tpm = 8000;
  assert.equal(wait(9000), 0);
});

test('le total consommé agrège entrée et sortie', () => {
  S.tpm = 10000;
  note(hdr({}), { prompt_tokens: 1000, completion_tokens: 500 });
  assert.equal(status().rem, 8500);
});
