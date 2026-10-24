import { PROVIDERS, S } from './state.js';

const LEAN = /(gpt-[45]|^o[1-4]\b|(sonnet|opus)|llama[^a-z]*405|mistral-large|gemini[^a-z]*\d*[^a-z]*pro|deepseek-(v3|r1)|grok)/i;

export const modelOf = () => S.models[S.provider] || PROVIDERS[S.provider]?.m || '';
export const family = m => (S.proto == 'full' || S.proto == 'lean' ? S.proto : LEAN.test(m || '') ? 'lean' : 'full');

const stateBlock = (fields, lean, choices) =>
  lean
    ? "\n\n# État\nTermine par un bloc <etat> listant « Champ: valeur », un par ligne. Champs : " +
      fields +
      '. Une valeur bornée s\'écrit 80/100.'
    : "\n\n# Format de l'état\nAprès ta narration" +
      (choices ? ' et avant le bloc de choix' : '') +
      ", écris l'état courant, une ligne « Champ: valeur » par champ :\n<etat>\nChamp: valeur\n</etat>\nChamps à suivre : " +
      fields +
      ".\nUne valeur numérique avec un maximum s'écrit 80/100.";

const choiceBlock = (prompt, lean) =>
  lean
    ? '\n\n# Choix\nTermine par un bloc <choix> de trois actions numérotées pour le personnage du joueur. ' + prompt
    : '\n\n# Format des choix\nTermine chaque réponse par trois actions possibles pour le personnage du joueur. ' +
      prompt +
      '\nUtilise exactement ce format, sans rien écrire après :\n<choix>\n1. …\n2. …\n3. …\n</choix>';

const imageBlock = lean =>
  lean
    ? '\n\n# Images\nAffiche une image avec {{img::code}} seul sur sa ligne, codes fournis au tour courant.'
    : "\n\n# Images\nPour afficher une image, écris {{img::code}} seul sur sa propre ligne, avec un code de la liste fournie dans le tour courant.";

export const DEFAULT_CHOICE = 'Trois propositions courtes et variées, écrites à la première personne.';
export const DEFAULT_FIELDS = 'Lieu, Objectif, Humeur';

export function protocol({ model = modelOf(), stat = false, fields = '', choices = false, prompt = '', images = false } = {}) {
  const lean = family(model) == 'lean',
    tail = [];
  let sys = '';
  if (images) sys += imageBlock(lean);
  if (stat) {
    sys += stateBlock(fields || DEFAULT_FIELDS, lean, choices);
    tail.push('<etat>');
  }
  if (choices) {
    sys += choiceBlock(prompt || DEFAULT_CHOICE, lean);
    tail.push('<choix>');
  }
  return {
    sys,
    tail: lean || !tail.length ? '' : '\n\n<rappel>\nTermine par le bloc ' + tail.join(' puis le bloc ') + '.\n</rappel>'
  };
}

const MARKS = [
  ['<choix>', 'le format des choix'],
  ['<etat>', "le format de l'état"],
  ['{{img::', 'la syntaxe des images']
];
export const conflicts = t => MARKS.filter(([k]) => (t || '').includes(k)).map(x => x[1]);
