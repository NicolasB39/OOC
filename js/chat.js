import { chat, summarize } from './ai.js';
import { body, lastEtat, raw, split } from './format.js';
import { showList } from './list.js';
import { buildInfo, statOn } from './prompt.js';
import { conflicts, modelOf } from './protocol.js';
import { last as rlLast, status, wait } from './rate.js';
import {
  autoRead,
  refreshSpeech,
  speakFrom,
  speakMsg,
  stopSpeech,
  setReading,
  ttsOk
} from './read.js';
import { TERR, coverOf, loadCtx } from './scenarios.js';
import { S, app, ctx } from './state.js';
import { getOne, save, saveSet } from './store.js';
import { $, LS, el, err, fit, ic, plain, strip, toast } from './util.js';

export async function openScenario(id) {
  stopSpeech();
  setReading(false);
  app.cur = await getOne(id);
  if (!app.cur) {
    showList();
    return;
  }
  app.LIM = 50;
  app.cur.mem ??= { summary: '', memories: [], upto: 0 };
  await loadCtx();
  $('#list').hidden = true;
  $('#chat').hidden = false;
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
  err(bad || warn, !!bad);
  $('#inp').value = LS.get('draft:' + id) || '';
  fit();
  render(true);
}
export function tk(info) {
  const e = $('#tk');
  if (!app.cur || !app.cur.mem) {
    e.textContent = '';
    $('#rl').hidden = true;
    return;
  }
  const r = info || buildInfo(app.cur),
    n = app.cur.messages.length,
    sentN = n - r.omitted,
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
      (rlLast.cached ? ' · ' + f(rlLast.cached) + ' en cache' : '') +
      (n ? ' · ' + sentN + (sentN > 1 ? ' messages envoyés' : ' message envoyé') + ' sur ' + n : '');
  rlView(r.used);
}
let rlEst = 0;
function rlView(est) {
  if (est != null) rlEst = est;
  const g = $('#rl'),
    s = status(modelOf());
  if (!s) {
    g.hidden = true;
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
  g.hidden = false;
}
setInterval(() => {
  if (!$('#chat').hidden && app.cur) rlView();
}, 1000);
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
  r.append(b('c', 'Copier', 'copy'), b('e', 'Modifier', 'edit'), b('d', "Supprimer à partir d'ici", 'trash'));
  if (last) {
    r.append(b('r', 'Régénérer', 'refresh'));
    if (m.role == 'assistant') r.append(b('k', 'Continuer', 'chevsr'));
  }
  return r;
};
const msgNode = (i, m, last) => {
  const n = el(
    'div',
    { class: 'm ' + m.role, data: { i } },
    el('div', { class: 'b' }, body(m.content)),
    act(i, m, last)
  );
  n._k = { c: m.content, a: m.ai, l: last, n: m.alts?.length || 0 };
  return n;
};
const same = (a, b) => a && a.c === b.c && a.a === b.a && a.l === b.l && a.n === b.n;
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
  const info = app.cur.mem ? buildInfo(app.cur) : null;
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
    for (let i = st; i < +cur[0].dataset.i; i++) f.append(msgNode(i, ms[i], false));
    cur[0].before(f);
  }
  cur = [...w.querySelectorAll(':scope > .m[data-i]')];
  const fresh = [];
  for (const e of cur) {
    const i = +e.dataset.i,
      k = { c: ms[i].content, a: ms[i].ai, l: i == n - 1, n: ms[i].alts?.length || 0 };
    if (!same(e._k, k)) {
      const x = msgNode(i, ms[i], k.l);
      e.replaceWith(x);
      fresh.push(x);
    }
  }
  const from = cur.length ? +cur.at(-1).dataset.i + 1 : st;
  const f = document.createDocumentFragment();
  for (let i = from; i < n; i++) {
    const x = msgNode(i, ms[i], i == n - 1);
    fresh.push(x);
    f.append(x);
  }
  foot.before(f);
  w.querySelector(':scope > .lim')?.remove();
  if (wi > 0)
    w.querySelector(':scope > .m[data-i="' + wi + '"]')?.before(
      el('div', { class: 'lim', text: 'l’IA lit à partir d’ici' })
    );
  const lm = ms.at(-1),
    cs = lm?.role == 'assistant' && !app.cur.noChoices ? lm.choices || [] : [];
  foot.replaceChildren(
    ...[
      cs.length &&
        el(
          'div',
          { class: 'ch' },
          cs.map(c =>
            el(
              'div',
              { class: 'chr' },
              el('button', { class: 'cht', text: c }),
              el(
                'button',
                { class: 'che', 'aria-label': 'Modifier avant d’envoyer : ' + c },
                ic('edit', 16)
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
  stateView();
  refreshSpeech();
}
const numOf = v => {
  const m = String(v).match(/^(-?\d+(?:[.,]\d+)?)/);
  return m ? +m[1].replace(',', '.') : null;
};
function stateView() {
  const e = $('#stp');
  const ms = app.cur.messages,
    st = statOn(app.cur) ? lastEtat(ms) : null;
  if (!st) {
    e.hidden = true;
    return;
  }
  const li = ms.findLastIndex(m => m.role == 'assistant' && m.state?.length),
    prev = lastEtat(ms.slice(0, li)) || [],
    pm = new Map(prev);
  $('#sts').replaceChildren(
    ...st.slice(0, 2).map(([k, v]) => el('span', { class: 'chip' }, el('b', { text: k }), v))
  );
  $('#stg').replaceChildren(
    ...st.map(([k, v]) => {
      const m = v.match(/^(\d+(?:[.,]\d+)?)\s*\/\s*(\d+(?:[.,]\d+)?)$/),
        p = m
          ? Math.max(0, Math.min(100, (+m[1].replace(',', '.') / +m[2].replace(',', '.')) * 100))
          : null;
      const a = numOf(v),
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
  );
  e.hidden = false;
}
async function delFrom(i) {
  stopSpeech();
  const c = app.cur,
    upto = c.mem.upto,
    removed = c.messages.splice(i);
  c.mem.upto = Math.min(upto, i);
  await save();
  render(true);
  toast(removed.length > 1 ? removed.length + ' messages supprimés' : 'Message supprimé', {
    label: 'Annuler',
    fn: async () => {
      if (app.cur !== c || c.messages.length !== i) {
        toast('Annulation impossible : la conversation a changé');
        return;
      }
      c.messages.push(...removed);
      c.mem.upto = upto;
      await save();
      render(true);
    }
  });
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
async function ask(old, cont) {
  const s = app.cur,
    p = S.provider,
    k = S.keys[p];
  if (!k) {
    if (old) s.messages.push(old);
    render();
    err("Ajoutez une clé API dans les réglages IA (menu « … » en haut).", 1);
    return;
  }
  setBusy(true);
  let msg = '',
    cut = false,
    part = false,
    raf = 0,
    pend = null,
    anchor = !S.follow,
    lastTop = null;
  const paint = () => {
    raf = 0;
    if (app.cur !== s || !pend) return;
    const [t, th] = pend;
    const m = $('#msgs');
    let e = document.querySelector('#live');
    if (!e) {
      e = el('div', { class: 'm assistant', id: 'live' }, el('div', { class: 'b' }));
      $('#mfoot').before(e);
    }
    const v = strip(t);
    e.firstChild.replaceChildren(
      ...(v ? body(v) : t || th ? [el('span', { class: 'act', text: 'Réflexion…' })] : [])
    );
    if (anchor) {
      if (lastTop !== null && Math.abs(m.scrollTop - lastTop) > 2) anchor = false;
      else {
        const off = e.getBoundingClientRect().top - m.getBoundingClientRect().top - 12;
        if (off > 1) m.scrollTop += off;
        lastTop = m.scrollTop;
      }
    }
    if (S.follow && m.scrollHeight - m.scrollTop - m.clientHeight < 200)
      m.scrollTop = m.scrollHeight;
    m.dispatchEvent(new Event('scroll'));
  };
  const live = (t, th) => {
    pend = [t, th];
    if (!raf) raf = requestAnimationFrame(paint);
  };
  try {
    const info = buildInfo(s, cont);
    const r = await chat(info.msgs, {
      max: +s.maxTok || 0,
      ac: (app.ctl = new AbortController()),
      od: S.ns?.[p] ? null : live,
      temp: s.temp ?? S.temp,
      top: s.top ?? S.top,
      onWait: w => {
        if (app.cur !== s) return;
        if (w) err('Limite de débit du fournisseur atteinte : envoi dans ' + w + ' s…');
        else {
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
        al ? { role: 'assistant', ...p2, alts: al, ai: al.length - 1 } : { role: 'assistant', ...p2 }
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
  cancelAnimationFrame(raf);
  pend = null;
  document.querySelector('#live')?.remove();
  setBusy(false);
  if (app.cur === s) {
    err(
      msg ||
        (part
          ? 'Réponse interrompue : le texte reçu est conservé. Continuez (double chevron) ou régénérez.'
          : cut
            ? 'Réponse coupée par la longueur maximale. Augmentez-la dans les réglages du scénario, continuez ou régénérez.'
            : ''),
      !!msg
    );
    if (S.follow) render(true);
    else {
      const m = $('#msgs'),
        y = m.scrollTop;
      render();
      m.scrollTop = y;
    }
    if (!msg && !cont) autoRead(s.messages.length - 1);
  }
  if (!msg) summarize(s);
}
async function regen() {
  if (app.busy) return;
  stopSpeech();
  const old = app.cur.messages.at(-1)?.role == 'assistant' ? app.cur.messages.pop() : null;
  render(true);
  ask(old);
}
$('#send').onclick = async () => {
  const t = $('#inp').value.trim();
  if (!t || app.busy) return;
  stopSpeech();
  $('#inp').value = '';
  fit();
  LS.del('draft:' + app.cur.id);
  app.cur.messages.push({ role: 'user', content: t });
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
  if (e.target.classList.contains('pic')) {
    $('#dpici').src = e.target.src;
    $('#dpic').showModal();
    return;
  }
  const b = e.target.closest('button');
  if (!b) {
    const m = e.target.closest('.m');
    if (app.reading && m) speakFrom(+m.dataset.i);
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
    const t = row.querySelector('.cht').textContent;
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
  if (a == 'c') {
    navigator.clipboard
      ?.writeText(plain(app.cur.messages[i].content, app.cur.pname))
      .then(() => {
        const o = b.firstChild;
        b.replaceChildren(ic('check', 17));
        setTimeout(() => b.replaceChildren(o), 1200);
      })
      .catch(() => {});
    return;
  }
  if (a == 'v') {
    speakMsg(i);
    return;
  }
  if (app.busy) return;
  if (a == 'e') {
    app.editI = i;
    $('#et').value = raw(app.cur.messages[i]);
    $('#de').showModal();
  } else if (a == 'd') delFrom(i);
  else if (a == 'r') regen();
  else if (a == 'k') ask(null, true);
  else swipe(a == 'p' ? -1 : 1);
};
$('#msgs').onscroll = () => {
  const m = $('#msgs');
  $('#bt').hidden = m.scrollHeight - m.scrollTop - m.clientHeight < 200;
};
$('#bt').onclick = () => {
  const m = $('#msgs');
  m.scrollTo({ top: m.scrollHeight, behavior: 'smooth' });
};
$('#dec').onclick = () => $('#de').close();
$('#des').onclick = async () => {
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
