import { CHX } from './format.js';
import { ctx } from './state.js';
import { nz } from './util.js';

const loreFor = (ms, max) => {
  const t = nz(ms.map(m => m.content).join('\n'));
  let a = (ctx.lore || [])
    .filter(e => e.always || e.keys.some(r => r.test(t)))
    .sort((x, y) => y.pr - x.pr);
  if (max) a = a.slice(0, max);
  return a.length ? '\n\n<lorebook>\n' + a.map(e => e.text).join('\n\n') + '\n</lorebook>' : '';
};
export function build(s, cont) {
  const c = s.remote ? ctx : { system: s.system, avatar: s.avatar };
  const nm = s.pname?.trim() || '';
  const U = t => t.replace(/\{\{user\}\}/gi, nm || 'Joueur');
  const av = (nm ? 'Nom : ' + nm + '\n' : '') + (c.avatar || '');
  const sys = U(
    (c.system || '') + (c.extra || '') + (av.trim() ? '\n\n# Avatar du joueur\n' + av : '')
  );
  const ms = s.messages
    .slice(Math.min(s.mem.upto, s.messages.length))
    .map(m => ({ role: m.role, content: m.content }));
  if (cont)
    ms.push({
      role: 'user',
      content:
        "Continue ta réponse exactement là où elle s'est arrêtée, sans répéter ce qui précède."
    });
  const l = ms.at(-1);
  const ai = ms.map(m => m.role).lastIndexOf('assistant');
  ms.forEach((m, i) => {
    if (m.role == 'assistant' && (cont || i != ai)) m.content = m.content.replace(CHX, '').trim();
  });
  let add = '';
  if (s.mem.summary.trim())
    add += '\n\n<previous_history>\n' + s.mem.summary.trim() + '\n</previous_history>';
  const lm = pick(s.mem.memories, s.messages.slice(-2), s.memN ?? 3);
  if (lm.length)
    add += '\n\n<long_term_memory>\n' + lm.map(x => '- ' + x).join('\n') + '\n</long_term_memory>';
  if (s.note?.trim()) add += '\n\n<system_note>\n' + s.note.trim() + '\n</system_note>';
  add += loreFor(s.messages.slice(-(s.loreDepth || 2)), s.loreMax);
  if (!s.noChoices)
    add +=
      '\n\n<consigne_choix>\nÀ la fin de ta réponse, propose trois actions possibles pour le personnage du joueur. ' +
      (s.choicePrompt?.trim() ||
        'Trois propositions courtes et variées, écrites à la première personne.') +
      '\nUtilise exactement ce format, sans rien écrire après :\n<choix>\n1. …\n2. …\n3. …\n</choix>\n</consigne_choix>';
  if (add && l?.role == 'user') l.content += U(add);
  return [...(sys.trim() ? [{ role: 'system', content: sys }] : []), ...ms];
}
const wd = s =>
  new Set(
    nz(s)
      .split(/[^a-z0-9]+/)
      .filter(w => w.length >= 4)
  );
const pick = (mem, ms, n = 3) => {
  const q = wd(ms.map(m => m.content).join(' '));
  return mem
    .map((t, i) => ({ t, i, s: [...wd(t)].filter(w => q.has(w)).length }))
    .sort((a, b) => b.s - a.s || b.i - a.i)
    .slice(0, n)
    .map(x => x.t);
};
