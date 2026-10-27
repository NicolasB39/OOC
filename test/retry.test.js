import assert from 'node:assert/strict';
import test, { beforeEach } from 'node:test';

globalThis.document = { createElement: () => ({}), querySelector: () => null, querySelectorAll: () => [] };
globalThis.matchMedia = () => ({ matches: false });
globalThis.localStorage = { getItem: () => null, setItem() {}, removeItem() {} };

const { BUSY, backoff, chat, waitMsg } = await import('../js/ai.js');
const { S } = await import('../js/state.js');
const { reset } = await import('../js/rate.js');

const ok = t =>
  new Response(JSON.stringify({ choices: [{ message: { content: t }, finish_reason: 'stop' }] }), {
    status: 200,
    headers: { 'content-type': 'application/json' }
  });
const fail = s => new Response(JSON.stringify({ error: { message: 'erreur ' + s } }), { status: s });
const queue = rs => {
  const calls = [];
  globalThis.fetch = async () => {
    calls.push(1);
    const r = rs.shift();
    if (r instanceof Error) throw r;
    return r;
  };
  return calls;
};
const ms = [{ role: 'user', content: 'Bonjour' }];

beforeEach(() => {
  Object.assign(S, { provider: 'groq', keys: { groq: 'k' }, models: {}, tpm: 0, tpms: {} });
  reset();
});

test('backoff double à chaque essai, borné, et suit retry-after', () => {
  assert.deepEqual([0, 1, 2].map(a => backoff(a)), [2, 4, 8]);
  assert.equal(backoff(9), 60);
  assert.equal(backoff(0, '7'), 7);
  assert.equal(backoff(0, 'n’importe quoi'), 2);
  assert.equal(backoff(0, '0'), 2);
});

test('les erreurs passagères sont retentées, pas les erreurs de requête', () => {
  for (const s of [500, 502, 503, 504, 529]) assert.ok(BUSY.has(s), s);
  for (const s of [400, 401, 403, 404, 429]) assert.ok(!BUSY.has(s), s);
});

test('une 503 est retentée puis la réponse arrive', async () => {
  const why = [];
  const calls = queue([fail(503), ok('Le récit continue.')]);
  const r = await chat(ms, { onWait: (w, y) => w && why.push(y) });
  assert.equal(r.t, 'Le récit continue.');
  assert.equal(calls.length, 2);
  assert.ok(why.length && why.every(y => y == 'busy'));
});

test('une coupure réseau avant réponse est retentée', async () => {
  const why = [];
  const calls = queue([new TypeError('Failed to fetch'), ok('Me revoilà.')]);
  const r = await chat(ms, { onWait: (w, y) => w && why.push(y) });
  assert.equal(r.t, 'Me revoilà.');
  assert.equal(calls.length, 2);
  assert.ok(why.every(y => y == 'net'));
});

test('une erreur 400 part tout de suite, sans nouvel essai', async () => {
  const calls = queue([fail(400), ok('jamais')]);
  await assert.rejects(chat(ms), /erreur 400/);
  assert.equal(calls.length, 1);
});

test('annuler pendant l’attente arrête les essais', async () => {
  const ac = new AbortController();
  const calls = queue([fail(503), ok('jamais')]);
  setTimeout(() => ac.abort('stop'), 300);
  await assert.rejects(chat(ms, { ac }), /Annulé/);
  assert.equal(calls.length, 1);
});

test('les messages d’attente nomment la cause', () => {
  assert.match(waitMsg(4, 'busy'), /surchargé ou en panne : nouvelle tentative dans 4 s/);
  assert.match(waitMsg(3, 'net'), /connexion perdue/);
  assert.match(waitMsg(9, 'pace'), /envoi dans 9 s/);
});
