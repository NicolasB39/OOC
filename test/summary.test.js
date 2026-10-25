import assert from 'node:assert/strict';
import test from 'node:test';

globalThis.document = { createElement: () => ({}), querySelector: () => null, querySelectorAll: () => [] };
globalThis.matchMedia = () => ({ matches: false });
globalThis.localStorage = { getItem: () => null, setItem() {}, removeItem() {} };

const { splitSummary } = await import('../js/memory.js');
const { sect } = await import('../js/ai.js');

test('un résumé propre est rendu tel quel, avec Événements et Situation actuelle', () => {
  const t = 'Événements : ils ont trouvé le coffre.\nSituation actuelle : ils hésitent à le toucher.';
  const x = splitSummary(t);
  assert.equal(x.summary, t);
  assert.deepEqual(x.souvenirs, []);
  assert.deepEqual(x.relations, {});
});

test('les sections Souvenirs et Relations sont coupées du résumé et récupérées', () => {
  const x = splitSummary(
    'Événements : le coffre est trouvé.\nSituation actuelle : on hésite.\n\nSouvenirs :\n- Le sort rend les objets temporaires.\n\nRelations :\n- Maëlys: complice, elle vous fait confiance.'
  );
  assert.equal(x.summary, 'Événements : le coffre est trouvé.\nSituation actuelle : on hésite.');
  assert.deepEqual(x.souvenirs, ['Le sort rend les objets temporaires.']);
  assert.deepEqual(x.relations, { Maëlys: 'complice, elle vous fait confiance.' });
});

test('les intitulés décorés sont reconnus', () => {
  for (const h of ['**Souvenirs**', '## Souvenirs', '[SOUVENIRS]', '**[SOUVENIRS]**', '- Souvenirs :', 'SOUVENIRS:']) {
    const x = splitSummary('Récit.\n' + h + '\n- un fait durable');
    assert.equal(x.summary, 'Récit.', h);
    assert.deepEqual(x.souvenirs, ['un fait durable'], h);
  }
});

test('un contenu sur la même ligne que l’intitulé est récupéré', () => {
  const x = splitSummary('Récit.\nRelations : Maëlys: amie\nGrumble: curieux');
  assert.deepEqual(x.relations, { Maëlys: 'amie', Grumble: 'curieux' });
});

test('« aucun » est ignoré, Objectif et Lignes sont écartés sans rien récupérer', () => {
  const x = splitSummary('Récit.\nSouvenirs :\n- aucun\nObjectif : trouver la serrure\nLignes :\n- le joueur parle');
  assert.equal(x.summary, 'Récit.');
  assert.deepEqual(x.souvenirs, []);
  assert.deepEqual(x.relations, {});
});

test('une phrase qui commence par « Relations » sans être un intitulé est conservée', () => {
  const t = 'Relations tendues entre les deux clans.\nSouvenirs de guerre dans la région.';
  assert.equal(splitSummary(t).summary, t);
});

test('un texte qui n’est que sections rend un résumé vide, à charge de l’appelant', () => {
  assert.equal(splitSummary('Souvenirs :\n- a').summary, '');
});

test('sect s’arrête avant les intitulés décorés', () => {
  const sortie = h =>
    `${h('RÉSUMÉ')}\nÉvénements : le coffre.\n${h('SOUVENIRS')}\n- un fait\n${h('RELATIONS')}\n- Maëlys: amie\n${h('LIGNES')}\n- une ligne`;
  for (const f of [h => `[${h}]`, h => `**[${h}]**`, h => `## [${h}]`]) {
    const t = sortie(f);
    assert.equal(sect(t, 'R[ÉE]SUM[ÉE]'), 'Événements : le coffre.');
    assert.equal(sect(t, 'SOUVENIRS'), '- un fait');
    assert.equal(sect(t, 'RELATIONS'), '- Maëlys: amie');
  }
});
