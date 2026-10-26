import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { SA, decorFor, decorNow, decorsOf, lieuOf, place } from '../js/scene.js';
import { ctx } from '../js/state.js';

const re = k => new RegExp('(^|[^a-z0-9])' + k + '(?![a-z0-9])');
beforeEach(() => {
  ctx.decors = [
    { name: 'foret', url: 'd/foret.webp', keys: [re('foret'), re('clairiere')] },
    { name: 'foret_nuit', url: 'd/foret_nuit.webp', keys: [re('foret de nuit')] },
    { name: 'taverne', url: 'd/taverne.webp', keys: [re('taverne'), re('auberge')] }
  ];
  ctx.decorDef = 'd/defaut.webp';
});

test('lieuOf lit le champ Lieu ou ses synonymes', () => {
  assert.equal(lieuOf([['Humeur', 'calme'], ['Lieu', 'Forêt']]), 'Forêt');
  assert.equal(lieuOf([['Endroit', 'Auberge']]), 'Auberge');
  assert.equal(lieuOf([['Humeur', 'calme']]), '');
  assert.equal(lieuOf(undefined), '');
});

test('decorFor : accents ignorés, mot-clé le plus précis, puis fond par défaut', () => {
  assert.equal(decorFor('Clairière au nord'), 'd/foret.webp');
  assert.equal(decorFor('Forêt de nuit'), 'd/foret_nuit.webp');
  assert.equal(decorFor('Un lieu inventé'), 'd/defaut.webp');
  ctx.decorDef = '';
  assert.equal(decorFor('Un lieu inventé'), '');
});

test('chaque message garde le décor de son moment', () => {
  const ms = [
    { role: 'assistant', content: 'A {{img::x}}', state: [['Lieu', 'Taverne']] },
    { role: 'user', content: 'Je sors.' },
    { role: 'assistant', content: 'B {{img::x}}' },
    { role: 'assistant', content: 'C {{img::x}}', state: [['Lieu', 'Forêt']] },
    { role: 'assistant', content: 'D sans image' }
  ];
  assert.deepEqual(decorsOf(ms), ['d/taverne.webp', '', 'd/taverne.webp', 'd/foret.webp', '']);
  assert.equal(decorNow(ms), 'd/foret.webp');
});

test('sans panneau d’état, le décor vient du texte des messages', () => {
  const ms = [
    { role: 'user', content: 'J’entre dans l’auberge.' },
    { role: 'assistant', content: 'Le feu crépite. {{img::x}}' }
  ];
  assert.deepEqual(decorsOf(ms), ['', 'd/taverne.webp']);
  assert.equal(decorNow(ms), 'd/taverne.webp');
});

test('place : silhouette centrée aux 2/3, pieds en bas', () => {
  const a = { r: 0.5, b: [0.4, 0.6, 0.1, 0.95] },
    p = place(a),
    cx = p.left + ((0.4 + 0.6) / 2) * p.width;
  assert.ok(Math.abs(cx - 200 / 3) < 1e-9);
  const hp = 0.9 / 0.85;
  assert.ok(Math.abs(p.bottom + 0.05 * hp * 100) < 1e-9);
});

test('place : un personnage large est décalé pour rester entier', () => {
  const a = { r: 2, b: [0.2, 0.9, 0, 1] },
    p = place(a),
    right = p.left + 0.9 * p.width;
  assert.ok(right <= 98 + 1e-9, 'bord droit ' + right);
  assert.ok(Math.abs(right - 98) < 1e-6, 'collé au bord de sécurité : ' + right);
  assert.ok(p.left + 0.2 * p.width >= 2 - 1e-9);
  const c = place({ r: 1, b: [0.2, 0.9, 0, 1] }, { x: 0.5, top: 0.06, fill: 1.9, sa: 1 });
  assert.ok('top' in c && !('bottom' in c));
});

test('la scène est un plan 16/9, le personnage y fait 90 % de la hauteur', () => {
  assert.ok(Math.abs(SA - 16 / 9) < 1e-12);
  const p = place({ r: 0.5, b: [0, 1, 0, 1] });
  assert.ok(Math.abs(p.width - (0.9 * 0.5 * 100) / SA) < 1e-9, 'largeur du personnage : ' + p.width + ' %');
});
