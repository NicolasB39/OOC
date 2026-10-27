import assert from 'node:assert/strict';
import test, { beforeEach } from 'node:test';

globalThis.document = { createElement: () => ({}), querySelector: () => null, querySelectorAll: () => [] };
globalThis.matchMedia = () => ({ matches: false });
globalThis.localStorage = { getItem: () => null, setItem() {}, removeItem() {} };

const { chat, toOai } = await import('../js/ai.js');
const { buildInfo } = await import('../js/prompt.js');
const { PROVIDERS, S, ctx } = await import('../js/state.js');
const { clean } = await import('../js/store.js');

// Messages tels que l'appli les construit : le système porte le repère interne cut.
const story = () =>
  buildInfo(
    clean({
      id: 's',
      name: 'S',
      system: 'Narrateur.',
      messages: [{ role: 'user', content: 'Bonjour' }],
      mem: { summary: 'Résumé.' }
    })
  ).msgs;

let bodies = [];
beforeEach(() => {
  Object.assign(ctx, { system: '', avatar: '', chars: [], lore: [], images: [], stat: '' });
  Object.assign(S, { keys: { groq: 'k', gemini: 'k', mistral: 'k', openrouter: 'k', claude: 'k' }, models: {}, tpm: 0, tpms: {}, ctxLim: 0 });
  bodies = [];
  globalThis.fetch = async (u, o) => {
    const b = JSON.parse(o.body);
    bodies.push(b);
    // Comme Groq : un champ inconnu dans un message fait refuser toute la requête.
    const bad = (b.messages || []).findIndex(m => typeof m.content == 'string' && Object.keys(m).some(k => k != 'role' && k != 'content'));
    if (!String(u).includes('anthropic') && bad >= 0)
      return new Response(JSON.stringify({ error: { message: "'messages." + bad + "' : property 'cut' is unsupported" } }), { status: 400 });
    return new Response(
      JSON.stringify(
        String(u).includes('anthropic')
          ? { content: [{ type: 'text', text: 'Ok.' }], stop_reason: 'end_turn' }
          : { choices: [{ message: { content: 'Ok.' }, finish_reason: 'stop' }] }
      ),
      { status: 200, headers: { 'content-type': 'application/json' } }
    );
  };
});

test('le message système construit par l’appli porte bien le repère cut', () => {
  const ms = story();
  assert.equal(ms[0].role, 'system');
  assert.ok('cut' in ms[0]);
});

test('toOai ne garde que role et content, sans toucher aux messages d’origine', () => {
  const ms = story();
  const out = toOai(ms);
  assert.ok(out.every(m => Object.keys(m).sort().join() == 'content,role'));
  assert.deepEqual(out.map(m => m.content), ms.map(m => m.content));
  assert.ok('cut' in ms[0], 'l’original garde cut pour le découpage du cache de Claude');
});

for (const p of Object.keys(PROVIDERS).filter(p => PROVIDERS[p].fmt != 'anthropic'))
  test(p + ' ne reçoit que role et content dans chaque message', async () => {
    S.provider = p;
    const r = await chat(story(), { primary: true });
    assert.equal(r.t, 'Ok.');
    for (const m of bodies[0].messages) assert.deepEqual(Object.keys(m).sort(), ['content', 'role']);
  });

test('Claude utilise toujours cut pour séparer la partie fixe de la mémoire en cache', async () => {
  S.provider = 'claude';
  await chat(story(), { primary: true });
  const sys = bodies[0].system;
  assert.equal(sys.length, 2);
  assert.match(sys[0].text, /Narrateur\./);
  assert.match(sys[1].text, /Résumé\./);
  assert.ok(!JSON.stringify(bodies[0]).includes('"cut"'));
});
