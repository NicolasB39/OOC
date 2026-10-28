import assert from 'node:assert/strict';
import test from 'node:test';

const node = t => ({
  tagName: t.toUpperCase(),
  className: '',
  textContent: '',
  dataset: {},
  kids: [],
  append(...x) {
    this.kids.push(...x);
  },
  setAttribute(k, v) {
    this[k] = v;
  }
});
globalThis.document = { createElement: node };
const { body, fr, line, parseIntro } = await import('../js/format.js');

test('parseIntro sépare l’accroche des débuts proposés, trois au plus', () => {
  assert.deepEqual(parseIntro('Une nuit de tempête.\n\nUn gardien ment.\n- Je frappe.\n2. J’attends.\n- Je fuis.\n- Je crie.'), {
    pitch: 'Une nuit de tempête.\n\nUn gardien ment.',
    starts: ['Je frappe.', 'J’attends.', 'Je fuis.']
  });
  assert.deepEqual(parseIntro(''), { pitch: '', starts: [] });
});

const NB = ' ',
  FN = ' ';

test('guillemets, apostrophes et espaces insécables', () => {
  assert.equal(
    fr('"Qui va là?" demande-t-il. C\'est l\'heure: partons!'),
    '«' + NB + 'Qui va là' + FN + '?' + NB + '» demande-t-il. C’est l’heure' + NB + ': partons' + FN + '!'
  );
  assert.equal(fr('« Bonjour »'), '«' + NB + 'Bonjour' + NB + '»');
  assert.equal(fr('Quoi ?!'), 'Quoi' + FN + '?!');
});

test('tirets de dialogue et points de suspension', () => {
  assert.equal(fr('- Pas encore...\n-- Si.'), '— Pas encore…\n— Si.');
  assert.equal(fr('Il hésite -- puis entre.'), 'Il hésite — puis entre.');
});

test('heures, adresses et texte déjà composé restent intacts', () => {
  for (const t of ['Rendez-vous à 12:30.', 'Voir http://exemple.fr/a?b=1', 'Un mot-clé'])
    assert.equal(fr(t), t);
  const once = fr('"Qui va là?" C\'est l\'heure: partons!');
  assert.equal(fr(once), once, 'appliquer deux fois ne change rien');
});

test('les gestes et le gras survivent à la typographie, dans le récit comme dans les choix', () => {
  const k = body('*Il sourit.* "Entrez!" dit-il. **Vite**: la nuit tombe.')[0].kids,
    t = k.map(x => (typeof x == 'string' ? x : x.textContent)).join('');
  assert.equal(k[0].className, 'act');
  assert.equal(k[0].textContent, 'Il sourit.');
  assert.ok(k.some(x => x.tagName == 'B' && x.textContent == 'Vite'));
  assert.equal(t, 'Il sourit. «' + NB + 'Entrez' + FN + '!' + NB + '» dit-il. Vite' + NB + ': la nuit tombe.');
  assert.equal(line('*Je recule.* Non!').map(x => (typeof x == 'string' ? x : x.textContent)).join(''), 'Je recule. Non' + FN + '!');
});
