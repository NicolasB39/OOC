// Annonces entre modules : celui qui sait qu'il s'est passé quelque chose l'annonce, celui qui
// affiche réagit. Évite les imports croisés (sauvegarde → conversation → sauvegarde…).
const H = {};
export const on = (n, fn) => {
  (H[n] ??= []).push(fn);
};
// Attend les réactions asynchrones : `await emit('open', id)` rend la main une fois l'histoire ouverte.
export const emit = (n, ...a) => Promise.all((H[n] || []).map(fn => fn(...a)));
