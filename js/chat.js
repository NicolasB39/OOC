import { WARM_AT, chat, keepWarm, lastWarmable, summarize, waitMsg } from './ai.js';
import { sync } from './backup.js';
import { on } from './bus.js';
import { body, keepImgs, line, paintLive, raw, split } from './format.js';
import { showList } from './list.js';
import { cutLines } from './memory.js';
import { buildInfo, statOn } from './prompt.js';
import { decorNow, decorsOf, zoomScene } from './scene.js';
import { conflicts, modelOf } from './protocol.js';
import { last as rlLast, status, wait } from './rate.js';
import {
  autoRead,
  readPos,
  refreshSpeech,
  speakFrom,
  speakMsg,
  stopSpeech,
  setReading,
  ttsOk,
  visibleStart
} from './read.js';
import { TERR, coverOf, loadCtx } from './scenarios.js';
import { S, app, ctx } from './state.js';
import { forkOf, getOne, save, saveSet } from './store.js';
import { $, LS, dlg, el, err, fit, ic, plain, strip, toast, uid, vt } from './util.js';

export async function openScenario(id) {
  stopSpeech();
  setReading(false);
  app.cur = await getOne(id);
  if (!app.cur) {
    showList();
    return;
  }
  app.LIM = 50;
  const n0 = app.cur.messages.length,
    back = Math.min(+LS.get('pos:' + id) || 0, n0 - 2);
  while (back > 0 && n0 - app.LIM > back) app.LIM += 50;
  app.cur.mem ??= { summary: '', memories: [], upto: 0 };
  await loadCtx();
  const cf = conflicts(app.cur.remote ? ctx.system : app.cur.system);
  const warn = cf.length
    ? 'Le prompt système redéfinit ' + cf.join(', ') + " : l'application s'en charge, retirez ces consignes."
    : '';
  const bad =
    app.cur.remote && !ctx.system
      ? 'Prompt introuvable : vérifiez scenarios/' + app.cur.folder + '/systeme.md'
      : app.cur.remote && TERR
        ? 'GitHub indisponible (' + TERR + ') : fiches, images et lorebooks peuvent manquer.'
        : '';
  await vt(() => {
    $('#list').hidden = true;
    $('#chat').hidden = false;
    err(bad || warn, !!bad);
    $('#inp').value = LS.get('draft:' + id) || '';
    fit();
    render(true);
  });
  if (back > 0) {
    const e = document.querySelector('#msgs .m[data-i="' + back + '"]');
    if (e) {
      e.scrollIntoView({ block: 'start' });
      toast('Reprise là où vous en étiez', {
        label: 'Aller en bas',
        fn: () => {
          const m = $('#msgs');
          m.scrollTo({ top: m.scrollHeight, behavior: 'smooth' });
        }
      });
    }
  }
}
on('cur:remote', async k => {
  const id = app.cur?.id;
  if (!id) return;
  if (k == 'deleted') {
    toast('Cette histoire a été supprimée sur un autre appareil');
    $('#back').click();
    return;
  }
  app.cur = await getOne(id);
  render();
  toast('Histoire mise à jour depuis un autre appareil');
});
let IO = null,
  IK = '',
  IV = null;
export const infoOf = () => {
  const s = app.cur,
    m = s.mem,
    l = s.messages.at(-1),
    k = [
      s.updated,
      s.messages.length,
      l?.role,
      l?.content.length,
      m.upto,
      m.win,
      m.summary.length,
      m.memories.length,
      m.lines?.length,
      Object.keys(m.relations || {}).length,
      S.ctxLim,
      S.reserve,
      S.cpt,
      S.pre?.length,
      S.proto,
      S.provider,
      modelOf(),
      (ctx.chars || []).length,
      (ctx.lore || []).length
    ].join('|');
  if (IO !== s || IK !== k) {
    IO = s;
    IK = k;
    IV = buildInfo(s);
  }
  return IV;
};
export function tk(info) {
  const e = $('#tk');
  if (!app.cur || !app.cur.mem) {
    e.textContent = '';
    e.hidden = true;
    $('#rl').hidden = true;
    return;
  }
  const r = info || infoOf(),
    n = app.cur.messages.length,
    sentN = Math.max(0, n - r.win),
    f = x => x.toLocaleString('fr-FR');
  e.className = r.over ? 'w' : '';
  e.textContent = r.over
    ? 'Prompt de base trop long pour la limite (≈ ' +
      f(r.used) +
      ' / ' +
      f(r.budget) +
      ' tokens) : réduisez le prompt système, le lorebook ou la mémoire.'
    : '≈ ' +
      f(r.used) +
      (r.budget ? ' / ' + f(r.budget) : '') +
      ' tokens envoyés' +
      (app.pt ? ' (réel : ' + f(app.pt) + ')' : '') +
      (rlLast.cached ? ' · ' + f(rlLast.cached) + ' lus en cache' : '') +
      (rlLast.wrote ? ' · ' + f(rlLast.wrote) + ' mis en cache' : '') +
      (n ? ' · ' + sentN + (sentN > 1 ? ' messages envoyés' : ' message envoyé') + ' sur ' + n : '');
  e.hidden = !S.counters && !r.over;
  rlView(r.used);
}
let rlEst = 0,
  rlT = 0;
const rlStop = () => {
  clearInterval(rlT);
  rlT = 0;
};
function rlView(est) {
  if (est != null) rlEst = est;
  const g = $('#rl'),
    s = status(modelOf());
  if (!s) {
    g.hidden = true;
    rlStop();
    return;
  }
  const f = x => x.toLocaleString('fr-FR'),
    pc = Math.max(0, Math.min(100, (s.rem / s.lim) * 100)),
    w = wait(rlEst + (+app.cur?.maxTok || 500), modelOf());
  g.className = w ? 'w' : '';
  g.firstChild.firstChild.style.width = pc + '%';
  g.lastChild.textContent =
    f(s.rem) +
    ' / ' +
    f(s.lim) +
    ' tokens par minute' +
    (s.src == 'local' ? ' (estimation locale)' : '') +
    (w ? ' · prochain tour dans ~' + w + ' s' : '');
  g.hidden = !S.counters && !w;
  // La jauge se remplit avec le temps : on ne la redessine chaque seconde que tant qu'elle est à l'écran.
  if (g.hidden || $('#chat').hidden) rlStop();
  else
    rlT ||= setInterval(() => {
      if (app.cur && !$('#chat').hidden && !document.hidden) rlView();
      else if (!app.cur || $('#chat').hidden) rlStop();
    }, 1000);
}
const act = (i, m, last) => {
  const r = el('div', { class: 'a' });
  if (last && m.alts?.length > 1)
    r.append(
      el('button', { data: { a: 'p' }, 'aria-label': 'Variante précédente' }, ic('chevl', 18)),
      el('span', { class: 'n', text: m.ai + 1 + '/' + m.alts.length }),
      el('button', { data: { a: 'n' }, 'aria-label': 'Variante suivante' }, ic('chevr', 18))
    );
  const b = (a, lbl, icon) =>
    el('button', { data: { a, i }, 'aria-label': lbl }, ic(icon, 17));
  if (ttsOk) r.append(b('v', 'Lire à voix haute', 'vol'));
  if (last) {
    const rg = b('r', 'Régénérer', 'refresh');
    rg.title = 'Régénérer · appui long ou clic droit : avec une indication';
    r.append(rg);
    if (m.role == 'assistant') r.append(b('k', 'Continuer', 'chevsr'));
  }
  r.append(b('m', 'Autres actions', 'more'));
  return r;
};
const numOf = v => {
  const m = String(v).match(/^(-?\d+(?:[.,]\d+)?)/);
  return m ? +m[1].replace(',', '.') : null;
};
const sig = st => (st || []).map(x => x[0] + '=' + x[1]).join('|');
const prevState = i => {
  const ms = app.cur.messages;
  for (let j = i - 1; j >= 0; j--)
    if (ms[j].role == 'assistant' && ms[j].state?.length) return ms[j].state;
  return [];
};
const stCard = (i, m) => {
  if (!m.state?.length || !statOn(app.cur)) return null;
  const pm = new Map(prevState(i));
  return el(
    'div',
    { class: 'st' },
    el('span', { class: 'stl', text: 'État' }),
    el(
      'div',
      { class: 'stg' },
      m.state.map(([k, v]) => {
        const r = v.match(/^(\d+(?:[.,]\d+)?)\s*\/\s*(\d+(?:[.,]\d+)?)$/),
          p = r
            ? Math.max(0, Math.min(100, (+r[1].replace(',', '.') / +r[2].replace(',', '.')) * 100))
            : null,
          a = numOf(v),
          b = pm.has(k) ? numOf(pm.get(k)) : null,
          d = a != null && b != null && a !== b ? a - b : null;
        return el(
          'div',
          { class: 'kv' },
          el('span', { text: k }),
          el(
            'b',
            null,
            v,
            d != null &&
              el('em', {
                class: 'dl ' + (d > 0 ? 'up' : 'dn'),
                text: (d > 0 ? '▲ +' : '▼ ') + Math.round(d * 100) / 100
              })
          ),
          p != null && el('i', { class: 'bar' }, el('u', { style: 'width:' + p + '%' }))
        );
      })
    )
  );
};
const msgNode = (i, m, last, d = '') => {
  const n = el(
    'div',
    { class: 'm ' + m.role + (last ? ' last' : ''), data: { i } },
    el('span', { class: 'sr', text: (m.role == 'user' ? 'Joueur' : 'Récit') + ' :' }),
    el('div', { class: 'b' }, body(m.content, d)),
    stCard(i, m),
    act(i, m, last)
  );
  n._k = { c: m.content, a: m.ai, l: last, n: m.alts?.length || 0, s: sig(m.state), d };
  return n;
};
const same = (a, b) =>
  a && a.c === b.c && a.a === b.a && a.l === b.l && a.n === b.n && a.s === b.s && a.d === b.d;
const dayOf = t => new Date(t).toDateString();
const cut6h = (t, p) => dayOf(t) !== dayOf(p) || t - p > 216e5;
const dayLab = (t, p) => {
  const d = new Date(t);
  if (dayOf(t) === dayOf(p))
    return d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
  if (dayOf(t) === dayOf(Date.now())) return "aujourd'hui";
  if (dayOf(t) === dayOf(Date.now() - 864e5)) return 'hier';
  return d.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' });
};
export function jump(i) {
  if (!app.cur) return;
  while (app.cur.messages.length - app.LIM > i) app.LIM += 50;
  render();
  const e = document.querySelector('#msgs .m[data-i="' + i + '"]');
  if (!e) return;
  e.scrollIntoView({ block: 'center', behavior: 'smooth' });
  e.classList.add('flash');
  setTimeout(() => e.classList.remove('flash'), 1600);
}
export function render(sc) {
  $('#ct').textContent = app.cur.name;
  const w = $('#msgs'),
    head = $('#mhead'),
    foot = $('#mfoot'),
    ms = app.cur.messages,
    n = ms.length,
    st = Math.max(0, n - app.LIM);
  const info = app.cur.mem ? infoOf() : null,
    D = decorsOf(ms);
  const cv = !st && coverOf(app.cur);
  head.replaceChildren(
    ...[
      cv && el('img', { class: 'cover', src: cv, alt: '', decoding: 'async' }),
      st && el('button', { class: 'more', text: 'Afficher les messages précédents' })
    ].filter(Boolean)
  );
  const wi = info && info.win > st && info.win < n ? info.win : -1;
  let cur = [...w.querySelectorAll(':scope > .m[data-i]')];
  for (const e of cur) {
    const i = +e.dataset.i;
    if (i < st || i >= n) e.remove();
  }
  cur = [...w.querySelectorAll(':scope > .m[data-i]')];
  if (cur.length && +cur[0].dataset.i > st) {
    const f = document.createDocumentFragment();
    for (let i = st; i < +cur[0].dataset.i; i++) f.append(msgNode(i, ms[i], false, D[i]));
    cur[0].before(f);
  }
  cur = [...w.querySelectorAll(':scope > .m[data-i]')];
  const fresh = [];
  for (const e of cur) {
    const i = +e.dataset.i,
      k = {
        c: ms[i].content,
        a: ms[i].ai,
        l: i == n - 1,
        n: ms[i].alts?.length || 0,
        s: sig(ms[i].state),
        d: D[i]
      };
    if (!same(e._k, k)) {
      const x = msgNode(i, ms[i], k.l, D[i]);
      e.replaceWith(x);
      fresh.push(x);
    }
  }
  const from = cur.length ? +cur.at(-1).dataset.i + 1 : st;
  const f = document.createDocumentFragment();
  for (let i = from; i < n; i++) {
    const x = msgNode(i, ms[i], i == n - 1, D[i]);
    fresh.push(x);
    f.append(x);
  }
  foot.before(f);
  w.querySelector(':scope > .lim')?.remove();
  if (wi > 0)
    w.querySelector(':scope > .m[data-i="' + wi + '"]')?.before(
      el('div', { class: 'lim', text: 'l’IA lit à partir d’ici' })
    );
  for (const e of w.querySelectorAll(':scope > .day')) e.remove();
  let pt = 0;
  for (let i = st; i < n; i++) {
    const t = ms[i].t;
    if (!t) continue;
    if (pt && cut6h(t, pt))
      w.querySelector(':scope > .m[data-i="' + i + '"]')?.before(
        el('div', { class: 'day', text: dayLab(t, pt) })
      );
    pt = t;
  }
  const lm = ms.at(-1),
    cs = lm?.role == 'assistant' && !app.cur.noChoices ? lm.choices || [] : [];
  // En-tête teinté par le décor du moment, flouté et assombri en CSS.
  const dn = decorNow(ms),
    hd = $('#chat header');
  hd.classList.toggle('dk', !!dn);
  hd.style.setProperty('--hdi', dn ? 'url(' + JSON.stringify(dn) + ')' : 'none');
  foot.replaceChildren(
    ...[
      cs.length &&
        el(
          'div',
          { class: 'ch' },
          cs.map((c, k) =>
            el(
              'div',
              { class: 'chr' },
              el(
                'button',
                { class: 'cht', data: { t: c }, 'aria-label': 'Envoyer : ' + c.replace(/\*/g, '') },
                el('span', { class: 'chn', 'aria-hidden': 'true', text: k + 1 }),
                el('span', { class: 'chx' }, line(c))
              ),
              el(
                'button',
                { class: 'che', 'aria-label': 'Modifier avant d’envoyer : ' + c.replace(/\*/g, '') },
                ic('edit', 17)
              )
            )
          )
        ),
      !n && el('p', { class: 'hint', text: "Écrivez votre premier tour pour lancer l'histoire." })
    ].filter(Boolean)
  );
  if (sc) {
    w.scrollTop = w.scrollHeight;
    for (const x of fresh)
      for (const img of x.querySelectorAll('img'))
        if (!img.complete)
          img.addEventListener(
            'load',
            () => {
              if (w.scrollHeight - w.scrollTop - w.clientHeight < 600) w.scrollTop = w.scrollHeight;
            },
            { once: true }
          );
  }
  tk(info);
  navView();
  refreshSpeech();
}
async function delFrom(i) {
  stopSpeech();
  const c = app.cur,
    upto = c.mem.upto,
    lines = c.mem.lines || [],
    removed = c.messages.splice(i);
  c.mem.upto = Math.min(upto, i);
  c.mem.lines = cutLines(lines, i);
  await save();
  render(true);
  toast(
    (removed.length > 1 ? removed.length + ' messages supprimés' : 'Message supprimé') +
      (i < upto ? ' · le résumé de la mémoire en garde la trace' : ''),
    {
      label: 'Annuler',
      fn: async () => {
        if (app.cur !== c || c.messages.length !== i) {
          toast('Annulation impossible : la conversation a changé');
          return;
        }
        c.messages.push(...removed);
        c.mem.upto = upto;
        c.mem.lines = lines;
        await save();
        render(true);
      }
    }
  );
}
// Modifier un tour du joueur et relancer : la suite est remplacée par une nouvelle réponse.
async function resendFrom(i, t) {
  const c = app.cur;
  if (!t || app.busy || c.messages[i]?.role != 'user') return;
  stopSpeech();
  const upto = c.mem.upto,
    n = c.messages.splice(i + 1).length,
    pv = c.messages[i - 1];
  // Le tour modifié doit repartir tel quel : il sort du résumé s'il y était déjà.
  c.mem.upto = Math.min(upto, i);
  c.mem.lines = cutLines(c.mem.lines || [], i);
  if (pv?.alts) {
    delete pv.alts;
    delete pv.ai;
  }
  Object.assign(c.messages[i], { content: t, t: Date.now() });
  await save();
  render(true);
  if (n || i < upto)
    toast(
      (n > 1 ? n + ' messages remplacés' : n ? 'Réponse remplacée' : 'Tour renvoyé') +
        (i < upto ? ' · le résumé de la mémoire garde la trace de l’ancienne version' : '')
    );
  ask();
}
const after = i => app.cur.messages.length - 1 - i;
async function regenHint() {
  if (app.busy || $('#dq').open) return;
  const h = await dlg('Régénérer avec une indication', {
    m: 'Pour cette réponse seulement : l’indication n’est pas gardée dans l’histoire.',
    v: '',
    ph: 'Plus court, plus sombre, fais parler Elias…',
    ok: 'Régénérer'
  });
  if (h !== null && !app.busy) regen(h);
}
async function forkFrom(i) {
  const s = app.cur,
    name = await dlg('Bifurquer d’ici', {
      m: 'Une nouvelle histoire reprend jusqu’à ce message. Celle-ci reste intacte.',
      v: s.name + ' (bifurcation)',
      ok: 'Créer'
    });
  if (!name?.trim() || app.cur !== s) return;
  stopSpeech();
  readPos(s.id);
  const c = forkOf(s, i, name.trim(), uid());
  await save(c);
  await openScenario(c.id);
  toast(
    'Bifurcation créée' +
      (s.mem.upto > i + 1 ? ' · le résumé de la mémoire raconte aussi la suite : relisez-le (… › Mémoire)' : '')
  );
}
const useAlt = (m, k) => {
  const v = m.alts[k];
  m.ai = k;
  m.content = v.content;
  delete m.choices;
  delete m.state;
  if (v.choices) m.choices = v.choices;
  if (v.state) m.state = v.state;
};
async function swipe(d) {
  stopSpeech();
  const m = app.cur.messages.at(-1);
  useAlt(m, (m.ai + d + m.alts.length) % m.alts.length);
  await save();
  render(true);
}
function setBusy(b) {
  app.busy = b;
  $('#send').hidden = b;
  $('#stop').hidden = !b;
  err('');
}
async function ask(old, cont, hint) {
  const s = app.cur,
    p = S.provider,
    k = S.keys[p],
    again = cont ? () => ask(null, true) : old ? () => regen(hint) : () => ask(null, false, hint);
  if (!k) {
    if (old) s.messages.push(old);
    render();
    err("Ajoutez une clé API dans les réglages IA (menu « … » en haut).", 1);
    return;
  }
  setBusy(true);
  warmStop();
  $('#gst').textContent = 'Réponse en cours.';
  const t0 = Date.now();
  let msg = '',
    cut = false,
    part = false,
    raf = 0,
    pend = ['', false];
  const z = { fl: 0, fn: 0, ft: '' },
    dl = decorNow(s.messages);
  const paint = () => {
    raf = 0;
    if (app.cur !== s || !pend) return;
    const [t, th] = pend;
    const m = $('#msgs');
    let e = document.querySelector('#live');
    if (!e) {
      const end = m.scrollHeight - m.scrollTop - m.clientHeight < 80;
      e = el('div', { class: 'm assistant', id: 'live' }, el('div', { class: 'b' }));
      $('#mfoot').before(e);
      if (end) m.scrollTop = m.scrollHeight;
    }
    const v = strip(t),
      sec = Math.round((Date.now() - t0) / 1000);
    paintLive(
      e.firstChild,
      v,
      z,
      v || !(sec > 2 || th) ? null : el('span', { class: 'act', text: 'Réflexion… ' + sec + ' s' }),
      dl
    );
    if (S.follow && m.scrollHeight - m.scrollTop - m.clientHeight < 200)
      m.scrollTop = m.scrollHeight;
    m.dispatchEvent(new Event('scroll'));
    if (unseen(e)) newShow('Réponse en cours');
  };
  const live = (t, th) => {
    pend = [t, th];
    if (!raf) raf = requestAnimationFrame(paint);
  };
  paint();
  const tick = setInterval(() => {
    if (!pend[0] && !raf) paint();
  }, 1000);
  try {
    const info = buildInfo(s, cont, hint);
    const r = await chat(info.msgs, {
      max: +s.maxTok || 0,
      ac: (app.ctl = new AbortController()),
      od: S.ns?.[p] ? null : live,
      temp: s.temp ?? S.temp,
      top: s.top ?? S.top,
      model: modelOf(s),
      effort: s.effort || 'low',
      primary: true,
      onWait: (w, why) => {
        if (app.cur !== s) return;
        if (w) {
          const t = waitMsg(w, why);
          err(t.charAt(0).toUpperCase() + t.slice(1));
        } else {
          err('');
          live('');
        }
      }
    });
    app.stream = { mode: S.ns?.[p] ? 'off' : r.mode, chunks: r.chunks, ms: r.ms };
    const out = r.t;
    cut = r.cut;
    part = !!r.partial;
    const p2 = split(out);
    if (cont) {
      const m = s.messages.at(-1);
      m.content = m.content.trimEnd() + (/^[\s.,;:!?…»)]/.test(p2.content) ? '' : ' ') + p2.content;
      delete m.choices;
      delete m.state;
      if (p2.choices) m.choices = p2.choices;
      if (p2.state) m.state = p2.state;
      if (m.alts) m.alts[m.ai] = { content: m.content, choices: m.choices, state: m.state };
    } else {
      const base = old?.role == 'assistant' ? old.alts || [{ content: old.content, choices: old.choices, state: old.state }] : null,
        al = base ? [...base, p2].slice(-10) : null;
      s.messages.push(
        al
          ? { role: 'assistant', ...p2, alts: al, ai: al.length - 1, t: Date.now() }
          : { role: 'assistant', ...p2, t: Date.now() }
      );
    }
    old = null;
    s.mem.win = info.win;
    await save(s);
    saveSet();
  } catch (e) {
    msg = e.message;
    if (old) s.messages.push(old);
  }
  clearInterval(tick);
  cancelAnimationFrame(raf);
  pend = null;
  const lv = document.querySelector('#live');
  setBusy(false);
  if (app.cur === s) {
    err(
      msg ||
        (part
          ? 'Réponse interrompue : le texte reçu est conservé. Continuez (double chevron) ou régénérez.'
          : cut
            ? 'Réponse coupée par la longueur maximale. Augmentez-la dans les réglages du scénario, continuez ou régénérez.'
            : ''),
      !!msg,
      msg && {
        label: 'Réessayer',
        fn: () => {
          if (!app.busy && app.cur === s) again();
        }
      }
    );
    $('#gst').textContent = msg ? 'Échec : ' + msg : 'Réponse reçue.';
    const m = $('#msgs'),
      y = m.scrollTop;
    render(S.follow);
    const fin = lv && !msg && m.querySelector(':scope > .m[data-i="' + (s.messages.length - 1) + '"]');
    if (fin) keepImgs(lv, fin);
    lv?.remove();
    if (!S.follow) m.scrollTop = y;
    if (!msg && unseen(tail())) newShow('Nouveau message');
    else $('#newm').hidden = true;
    if (!msg && !cont) autoRead(s.messages.length - 1);
  } else lv?.remove();
  if (!msg) {
    warmN = 0;
    warmArm(s);
    summarize(s);
  }
  if (app.cur !== s && LS.get('bkd')) sync();
}
// Maintien du cache Claude pendant les pauses (keepWarm, ai.js) : une relance peu avant l'échéance des
// 5 minutes, au plus WARM_N d'affilée sans nouvel envoi (une vingtaine de minutes), seulement tant que la
// conversation est ouverte et la page visible. Inutile avec le cache d'une heure.
const WARM_N = 3;
let warmT = 0,
  warmN = 0,
  warmS = null;
function warmStop() {
  clearTimeout(warmT);
  warmT = 0;
}
function warmArm(s) {
  warmStop();
  warmS = s;
  const L = lastWarmable();
  if (!L || S.warm === false || S.c1h || L.p !== S.provider || warmN >= WARM_N) return;
  const age = Date.now() - L.at;
  if (age >= 295000) return;
  warmT = setTimeout(async () => {
    warmT = 0;
    if (app.busy || app.cur !== s || $('#chat').hidden || document.hidden) return;
    warmN++;
    if (await keepWarm()) warmArm(s);
  }, Math.max(0, WARM_AT - age));
}
document.addEventListener('visibilitychange', () => {
  if (!document.hidden && warmS && app.cur === warmS && !warmT && !app.busy) warmArm(warmS);
});
async function regen(hint) {
  if (app.busy) return;
  stopSpeech();
  const old = app.cur.messages.at(-1)?.role == 'assistant' ? app.cur.messages.pop() : null;
  render(true);
  ask(old, false, hint);
}
$('#send').onclick = async () => {
  const t = $('#inp').value.trim();
  if (!t || app.busy) return;
  stopSpeech();
  $('#inp').value = '';
  fit();
  LS.del('draft:' + app.cur.id);
  const pv = app.cur.messages.at(-1);
  if (pv?.alts) {
    delete pv.alts;
    delete pv.ai;
  }
  app.cur.messages.push({ role: 'user', content: t, t: Date.now() });
  await save();
  render(true);
  ask();
};
$('#stop').onclick = () => app.ctl?.abort('stop');
$('#inp').oninput = () => {
  LS.set('draft:' + app.cur.id, $('#inp').value);
  fit();
};
$('#inp').onkeydown = e => {
  if (e.key == 'Enter' && !e.shiftKey && matchMedia('(pointer:fine)').matches) {
    e.preventDefault();
    $('#send').click();
  }
};
$('#msgs').onclick = e => {
  const sc = e.target.closest('.scn');
  if (sc) {
    zoomScene(sc);
    return;
  }
  const b = e.target.closest('button');
  if (!b) {
    const m = e.target.closest('.m[data-i]');
    if (app.reading && m) speakFrom(+m.dataset.i);
    // Au toucher, faute de survol : toucher un ancien message affiche ses actions.
    else if (m && !m.classList.contains('last') && !getSelection()?.toString()) {
      const on = !m.classList.contains('sel');
      for (const x of $('#msgs').querySelectorAll(':scope > .m.sel')) x.classList.remove('sel');
      m.classList.toggle('sel', on);
    }
    return;
  }
  if (b.classList.contains('more')) {
    const m = $('#msgs'),
      h = m.scrollHeight,
      y = m.scrollTop;
    app.LIM += 50;
    render();
    m.scrollTop = y + m.scrollHeight - h;
    return;
  }
  const row = b.closest('.chr');
  if (row) {
    const t = row.querySelector('.cht').dataset.t;
    if (b.classList.contains('che')) {
      $('#inp').value = t;
      fit();
      $('#inp').focus();
    } else if (!app.busy) {
      $('#inp').value = t;
      $('#send').click();
    }
    return;
  }
  const a = b.dataset.a,
    i = +b.dataset.i;
  if (a == 'v') {
    speakMsg(i);
    return;
  }
  if (a == 'm') {
    const last = i == app.cur.messages.length - 1;
    app.actI = i;
    $('#maw').hidden = app.cur.messages[i].role != 'user';
    $('#mar').hidden = !last;
    $('#dma').showModal();
    return;
  }
  if (app.busy) return;
  if (a == 'r') {
    if (lpFired) lpFired = false;
    else regen();
  } else if (a == 'k') ask(null, true);
  else swipe(a == 'p' ? -1 : 1);
};
// Appui long (ou clic droit) sur Régénérer : régénérer avec une indication.
let lpT = 0,
  lpFired = false;
$('#msgs').addEventListener('pointerdown', e => {
  lpFired = false;
  if (e.button || !e.target.closest('button[data-a="r"]')) return;
  lpT = setTimeout(() => {
    lpFired = true;
    regenHint();
  }, 500);
});
for (const t of ['pointerup', 'pointerleave', 'pointercancel'])
  $('#msgs').addEventListener(t, () => clearTimeout(lpT));
$('#msgs').addEventListener('contextmenu', e => {
  if (!e.target.closest('button[data-a="r"]')) return;
  e.preventDefault();
  clearTimeout(lpT);
  lpFired = e.pointerType == 'touch' || lpFired;
  regenHint();
});
const goTurn = d => {
  const w = $('#msgs'),
    e = document.querySelector('#msgs .m[data-i="' + (visibleStart() + d) + '"]');
  if (e) e.scrollIntoView({ block: 'start', behavior: 'smooth' });
  else w.scrollTo({ top: d < 0 ? 0 : w.scrollHeight, behavior: 'smooth' });
};
const far = () => {
  const m = $('#msgs');
  return m.scrollHeight - m.scrollTop - m.clientHeight >= 80;
};
// Pastille « Nouveau message » : signale une réponse qui arrive ou est arrivée sous l'écran, jusqu'à ce que
// son début soit visible.
const tail = () => document.querySelector('#live') || [...document.querySelectorAll('#msgs > .m[data-i]')].at(-1);
const unseen = e => !!e && e.getBoundingClientRect().top > $('#msgs').getBoundingClientRect().bottom - 24;
function newShow(t) {
  const b = $('#newm');
  if (b.hidden || b.firstChild?.textContent != t) b.replaceChildren(el('span', { text: t }), ic('down', 16));
  b.hidden = false;
}
const navView = () => {
  const f = far();
  $('#nav').hidden = !f;
  if (!f || !unseen(tail())) $('#newm').hidden = true;
};
$('#msgs').onscroll = navView;
$('#newm').onclick = () => {
  const m = $('#msgs');
  $('#newm').hidden = true;
  m.scrollTo({ top: m.scrollHeight, behavior: 'smooth' });
};
$('#nvp').onclick = () => goTurn(-1);
$('#nvn').onclick = () => goTurn(1);
$('#ast').onclick = () => {
  const t = $('#inp'),
    a = t.selectionStart,
    b = t.selectionEnd,
    v = t.value;
  t.value = v.slice(0, a) + '*' + v.slice(a, b) + '*' + v.slice(b);
  t.focus();
  t.setSelectionRange(a + 1, b + 1);
  t.dispatchEvent(new Event('input'));
};
$('#dec').onclick = () => $('#de').close();
$('#des').onclick = async () => {
  if (app.editRe) {
    $('#de').close();
    resendFrom(app.editI, $('#et').value.trim());
    return;
  }
  const m = app.cur.messages[app.editI],
    p = split($('#et').value);
  m.content = p.content;
  delete m.choices;
  delete m.state;
  if (p.choices) m.choices = p.choices;
  if (p.state) m.state = p.state;
  if (m.alts) m.alts[m.ai] = p;
  await save();
  render();
  $('#de').close();
};
$('#dpic').onclick = () => $('#dpic').close();
$('#dpic').addEventListener('close', () => {
  $('#dpic').querySelector('.scn')?.remove();
  $('#dpici').hidden = false;
});
$('#damc').onclick = () => $('#dma').close();
$('#mac').onclick = () => {
  $('#dma').close();
  navigator.clipboard
    ?.writeText(plain(app.cur.messages[app.actI].content, app.cur.pname))
    .then(() => toast('Message copié'))
    .catch(() => toast('Copie impossible'));
};
const editOpen = re => {
  $('#dma').close();
  if (app.busy) return;
  const i = (app.editI = app.actI),
    n = after(i);
  app.editRe = re;
  $('#hde').textContent = re ? 'Modifier et renvoyer' : 'Modifier le message';
  $('#des').textContent = re ? 'Renvoyer' : 'Enregistrer';
  $('#den').textContent = !re
    ? ''
    : n
      ? (n > 1 ? 'Les ' + n + ' messages suivants seront remplacés' : 'La réponse suivante sera remplacée') +
        ' par une nouvelle réponse. Pour garder l’ancienne suite, bifurquez d’abord depuis ce message.'
      : 'L’IA répondra à la nouvelle version.';
  $('#den').hidden = !re;
  $('#et').value = raw(app.cur.messages[i]);
  $('#de').showModal();
};
$('#mae').onclick = () => editOpen(false);
$('#maw').onclick = () => editOpen(true);
$('#mar').onclick = () => {
  $('#dma').close();
  regenHint();
};
$('#mad').onclick = () => {
  $('#dma').close();
  if (!app.busy) delFrom(app.actI);
};
$('#mab').onclick = () => {
  $('#dma').close();
  if (!app.busy) forkFrom(app.actI);
};
let px, py, pel;
$('#msgs').addEventListener('pointerdown', e => {
  const m = e.target.closest('.m[data-i]');
  if (m && !e.target.closest('button') && app.cur?.messages.at(-1)?.alts?.length > 1) {
    pel = +m.dataset.i == app.cur.messages.length - 1 ? m : null;
    px = e.clientX;
    py = e.clientY;
  }
});
$('#msgs').addEventListener('pointerup', e => {
  if (!pel || app.busy) {
    pel = null;
    return;
  }
  const dx = e.clientX - px,
    dy = e.clientY - py;
  pel = null;
  if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 1.6) swipe(dx < 0 ? 1 : -1);
});
$('#msgs').addEventListener('pointercancel', () => {
  pel = null;
});
