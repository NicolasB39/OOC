import assert from 'node:assert/strict';
import test from 'node:test';

globalThis.document = { createElement: () => ({}), querySelector: () => null, querySelectorAll: () => [] };
globalThis.matchMedia = () => ({ matches: false });
globalThis.localStorage = { getItem: () => null, setItem() {}, removeItem() {} };

const { ANT_VERSION, authH, chat } = await import('../js/ai.js');
const { S } = await import('../js/state.js');

const ms = [
  { role: 'system', content: 'SYS' },
  { role: 'user', content: 'Bonjour' }
];

test('Claude est appelé avec la version d’API 2026-10-21', () => {
  assert.equal(ANT_VERSION, '2026-10-21');
  assert.equal(authH('claude', 'k')['anthropic-version'], '2026-10-21');
  assert.ok(!('anthropic-version' in authH('groq', 'k')));
});

test('température et Top P ne partent jamais vers Claude, quel que soit le modèle', async () => {
  const bodies = [],
    heads = [];
  globalThis.fetch = async (u, o) => {
    bodies.push(JSON.parse(o.body));
    heads.push(o.headers);
    return new Response(
      JSON.stringify(
        String(u).includes('anthropic')
          ? { content: [{ type: 'text', text: 'Ok.' }], stop_reason: 'end_turn' }
          : { choices: [{ message: { content: 'Ok.' }, finish_reason: 'stop' }] }
      ),
      { status: 200, headers: { 'content-type': 'application/json' } }
    );
  };
  Object.assign(S, { provider: 'claude', keys: { claude: 'k', groq: 'k' }, models: {}, tpm: 0, tpms: {} });
  for (const m of ['', 'claude-sonnet-4-6', 'claude-haiku-4-5', 'claude-opus-5-5']) {
    S.models.claude = m;
    await chat(ms, { temp: 0.7, top: 0.9 });
    const b = bodies.at(-1);
    for (const k of ['temperature', 'top_p', 'top_k']) assert.ok(!(k in b), (m || 'défaut') + ' : ' + k);
    assert.equal(heads.at(-1)['anthropic-version'], '2026-10-21');
  }
  S.provider = 'groq';
  await chat(ms, { temp: 0.7, top: 0.9 });
  assert.equal(bodies.at(-1).temperature, 0.7, 'les autres fournisseurs gardent le réglage');
  assert.equal(bodies.at(-1).top_p, 0.9);
});
