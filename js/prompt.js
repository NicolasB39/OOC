import { clip, sameName } from './memory.js';
import { DEFAULT_FIELDS, protocol } from './protocol.js';
import { S, ctx } from './state.js';
import { nz } from './util.js';

export const estTok = t => Math.ceil(t.length / (S.cpt || 3.4)) + 4;
export const budgetOf = s => {
  const L = S.ctxLim || 0;
  if (!L) return 0;
  return L - Math.min(s.maxTok || S.reserve || 1000, Math.floor(L / 2));
};
export const statOn = s => s.stat ?? !!(s.remote && ctx.stat);
export const statFields = s =>
  (s.statFields || '').trim() || (s.remote ? ctx.stat : '') || DEFAULT_FIELDS;

const CAST_FREE = 900;
const MEM_N = 20;
const WIN_STEP = 8;
const SUM_MAX = 1400;

const textOf = ms =>
  nz(
    ms
      .map(m => m.content + ' ' + (m.state || []).map(e => e.join(' ')).join(' '))
      .join('\n')
  );
const loreFor = (ms, max) => {
  const t = textOf(ms);
  let a = (ctx.lore || []).filter(e => e.always || e.keys.some(r => r.test(t))).sort((x, y) => y.pr - x.pr);
  if (max) a = a.slice(0, max);
  return a.length ? '\n\n<lorebook>\n' + a.map(e => e.text).join('\n\n') + '\n</lorebook>' : '';
};
export const inScene = ms => {
  const t = textOf(ms);
  return (ctx.chars || []).filter(c => (c.keys || []).some(r => r.test(t)));
};
const charsFor = ms => {
  const C = ctx.chars || [];
  if (!C.length) return [];
  if (C.reduce((a, c) => a + estTok(c.text), 0) <= CAST_FREE) return C;
  const t = textOf(ms);
  return C.filter(c => c.always || c.keys.some(r => r.test(t)));
};
const castBlock = () => {
  const C = ctx.chars || [];
  return C.length
    ? '\n\n# Personnages du monde\n' +
        C.map(c => '- ' + c.name + (c.sum ? ' : ' + c.sum : '')).join('\n') +
        "\nTu peux faire intervenir n'importe lequel d'entre eux. Leur fiche détaillée t'est fournie quand ils sont en scène."
    : '';
};
const memBlock = s => {
  let t = '';
  if (s.mem.summary.trim())
    t += '\n\n<previous_history>\n' + clip(s.mem.summary, SUM_MAX) + '\n</previous_history>';
  if (s.mem.lines?.length)
    t += '\n\n<recent_history>\n' + s.mem.lines.map(x => '- ' + x.t).join('\n') + '\n</recent_history>';
  const k = s.memN ?? MEM_N,
    mm = k > 0 ? (s.mem.memories || []).slice(-k) : [];
  if (mm.length)
    t += '\n\n<long_term_memory>\n' + mm.map(x => '- ' + x).join('\n') + '\n</long_term_memory>';
  if (s.note?.trim()) t += '\n\n<system_note>\n' + s.note.trim() + '\n</system_note>';
  return t;
};
const relOf = (mem, name) => {
  for (const r in mem.relations || {})
    if (sameName(r, name))
      return '\nRelation (état enregistré, peut dater ; les événements récents priment) : ' + mem.relations[r];
  return '';
};
const looseRel = (mem, used) => {
  const a = Object.entries(mem.relations || {}).filter(
    ([k]) => !used.some(c => sameName(c.name, k))
  );
  return a.length
    ? '\n\n<relations>\n(États enregistrés, ils peuvent dater : les événements récents priment.)\n' +
        a.map(([k, v]) => '- ' + k + ' : ' + v).join('\n') +
        '\n</relations>'
    : '';
};
export function buildInfo(s, cont) {
  const nm = s.pname?.trim() || '';
  const U = t => t.replace(/\{\{user\}\}/gi, nm || 'Joueur');
  const c = s.remote ? ctx : { system: s.system, avatar: s.avatar };
  const av = (nm ? 'Nom : ' + nm + '\n' : '') + (c.avatar || '');
  let sys = c.system || '';
  if (!s.noPre && S.pre?.trim()) sys += '\n\n' + S.pre.trim();
  sys += castBlock();
  const P = protocol({
    stat: statOn(s),
    fields: statFields(s).replace(/\s*\n+\s*/g, ', '),
    choices: !s.noChoices,
    prompt: s.choicePrompt?.trim(),
    style: !s.noStyle,
    images: (ctx.images || []).length > 0
  });
  sys += P.sys;
  if (av.trim()) sys += '\n\n# Avatar du joueur\n' + av;
  sys += memBlock(s);
  sys = U(sys);

  const start = Math.min(s.mem.upto, s.messages.length);
  const ms = s.messages.slice(start).map(m => ({ role: m.role, content: m.content }));
  if (cont)
    ms.push({
      role: 'user',
      content: "Continue ta réponse exactement là où elle s'est arrêtée, sans répéter ce qui précède."
    });
  const l = ms.at(-1);

  let add = loreFor(s.messages.slice(-(s.loreDepth || 2)), s.loreMax);
  const act = charsFor(s.messages.slice(-6));
  if (act.length) {
    add +=
      '\n\n<personnages>' +
      act.map(x => '\n\n## ' + x.name + '\n' + x.text + relOf(s.mem, x.name)).join('') +
      '\n</personnages>';
    const codes = act.flatMap(x => x.images);
    if (codes.length)
      add +=
        '\n\n<images_disponibles>\n' +
        codes.join(', ') +
        "\nÀ insérer au fil du récit, là où elles illustrent le texte, pas forcément en début de réponse.\n</images_disponibles>";
  }
  add += looseRel(s.mem, act);
  if (statOn(s)) {
    const prev = [...s.messages].reverse().find(m => m.role == 'assistant' && m.state?.length)?.state;
    add +=
      '\n\n<etat_precedent>\n' +
      (prev
        ? prev.map(([k, v]) => k + ': ' + v).join('\n') +
          '\nNe modifie que ce que les événements de la scène changent.'
        : 'Aucun. Invente des valeurs de départ cohérentes avec le scénario.') +
      '\n</etat_precedent>';
  }
  add += P.tail;
  if (add && l?.role == 'user') l.content += U(add);

  const sysMsg = sys.trim() ? [{ role: 'system', content: sys }] : [],
    B = budgetOf(s),
    n = ms.length,
    cost = ms.map(m => estTok(m.content)),
    base = sysMsg.length ? estTok(sys) : 0;
  const fits = f => base + cost.slice(f).reduce((a, b) => a + b, 0);
  const align = f => {
    while (f < n - 1 && ms[f].role == 'assistant') f++;
    return f;
  };
  let from = 0;
  if (B && n > 1) {
    let g = n - 1,
      acc = base + cost[n - 1];
    for (let i = n - 2; i >= 0 && acc + cost[i] <= B; i--) {
      acc += cost[i];
      g = i;
    }
    g = align(g);
    from = Math.max(0, Math.min((s.mem.win || 0) - start, n - 1));
    if (from < g) {
      while (from < g) from += WIN_STEP;
      from = align(Math.min(from, (g + n) >> 1));
      if (ms[from].role == 'assistant') from = g;
    } else if (from > g + 2 * WIN_STEP) from = g;
  }
  return {
    msgs: [...sysMsg, ...ms.slice(from)],
    used: fits(from),
    budget: B,
    omitted: from,
    win: start + from,
    over: B > 0 && fits(from) > B
  };
}
export const build = (s, cont) => buildInfo(s, cont).msgs;
export const omittedCount = s => buildInfo(s).omitted;
