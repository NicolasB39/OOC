import assert from 'node:assert/strict';
import test from 'node:test';
import { accentVars, pickAccent } from '../js/util.js';
import { clean } from '../js/store.js';

const px = (...cols) => Uint8ClampedArray.from(cols.flatMap(([r, g, b, a = 255]) => [r, g, b, a]));
const lum = h => {
  const [r, g, b] = [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16) / 255);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};

test('accentVars : les variables de l’accent, et le texte posé dessus lisible', () => {
  const v = accentVars('#e05a4f');
  assert.equal(v['--ac'], '#e05a4f');
  assert.equal(v['--acb'], 'rgba(224, 90, 79, 0.45)');
  assert.equal(v['--on'], '#ffffff');
  assert.equal(accentVars('#f5e9a0')['--on'], '#0a0a0b');
  assert.equal(accentVars(''), null);
  assert.equal(accentVars('rouge'), null);
});

test('pickAccent prend la teinte la plus vive et la rend lisible sur fond sombre', () => {
  const grey = Array(60).fill([90, 90, 90]),
    h = pickAccent(px(...grey, [150, 20, 20], [140, 25, 18], [10, 10, 10]));
  const [r, g, b] = [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16));
  assert.ok(r > g * 1.5 && r > b * 1.5, 'rouge : ' + h);
  assert.ok(lum(h) > 0.3, 'assez clair : ' + h);
  assert.equal(pickAccent(px([5, 5, 5], [0, 0, 0, 0])), '', 'image noire ou transparente : rien');
});

test('clean garde un accent valide, en minuscules, et oublie le reste', () => {
  assert.equal(clean({ id: 'a', messages: [], accent: '#E05A4F' }).accent, '#e05a4f');
  assert.equal(clean({ id: 'a', messages: [], accent: 'red' }).accent, '');
});
