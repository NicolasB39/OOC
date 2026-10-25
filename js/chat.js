import { chat, summarize } from './ai.js';
import { body, line, raw, split } from './format.js';
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
  ttsOk,
  visibleStart
} from './read.js';
import { TERR, coverOf, loadCtx } from './scenarios.js';
import { S, app, ctx } from './state.js';
import { getOne, save, saveSet } from './store.js';
import { $, LS, el, err, fit, ic, plain, strip, toast, vt } from './util.js';

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
export function tk(info) {
  const e = $('#tk');
  if (!app.cur || !app.cur.mem) {
    e.textContent = '';
    e.hidden = true;
    $('#rl').hidden = true;
    return;
  }
  const r = info || buildInfo(app.cur),
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
      (rlLast.cached ? ' · ' + f(rlLast.cached) + ' en cache' : '') +
      (n ? ' · ' + sentN + (sentN > 1 ? ' messages envoyés' : ' message envoyé') + ' sur ' + n : '');
  e.hidden = !S.counters && !r.over;
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
  g.hidden = !S.counters && !w;
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
  if (last) {
    r.append(b('r', 'Régénérer', 'refresh'));
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
const msgNode = (i, m, last) => {
  const n = el(
    'div',
    { class: 'm ' + m.role, data: { i } },
    el('span', { class: 'sr', text: (m.role == 'user' ? 'Joueur' : 'Récit') + ' :' }),
    el('div', { class: 'b' }, body(m.content)),
    stCard(i, m),
    act(i, m, last)
  );
  n._k = { c: m.content, a: m.ai, l: last, n: m.alts?.length || 0, s: sig(m.state) };
  return n;
};
const same = (a, b) =>
  a && a.c === b.c && a.a === b.a && a.l === b.l && a.n === b.n && a.s === b.s;
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
      k = {
        c: ms[i].content,
        a: ms[i].ai,
        l: i == n - 1,
        n: ms[i].alts?.length || 0,
        s: sig(ms[i].state)
      };
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
              el(
                'button',
                { class: 'che', 'aria-label': 'Modifier avant d’envoyer : ' + c.replace(/\*/g, '') },
                ic('edit', 17)
              ),
              el(
                'div',
                { class: 'chb' },
                el('button', { class: 'cht', data: { t: c } }, line(c)),
                el(
                  'button',
                  { class: 'chs', 'aria-label': 'Envoyer : ' + c.replace(/\*/g, '') },
                  ic('send', 17)
                )
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
  $('#gst').textContent = 'Réponse en cours.';
  const t0 = Date.now();
  let msg = '',
    cut = false,
    part = false,
    raf = 0,
    pend = ['', false],
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
    const v = strip(t),
      sec = Math.round((Date.now() - t0) / 1000);
    e.firstChild.replaceChildren(
      ...(v
        ? body(v)
        : sec > 2 || th
          ? [el('span', { class: 'act', text: 'Réflexion… ' + sec + ' s' })]
          : [])
    );
    if (anchor && v) {
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
  paint();
  const tick = setInterval(() => {
    if (!pend[0] && !raf) paint();
  }, 1000);
  try {
    const info = buildInfo(s, cont);
    const r = await chat(info.msgs, {
      max: +s.maxTok || 0,
      ac: (app.ctl = new AbortController()),
      od: S.ns?.[p] ? null : live,
      temp: s.temp ?? S.temp,
      top: s.top ?? S.top,
      primary: true,
      onWait: (w, why) => {
        if (app.cur !== s) return;
        if (w)
          err(
            why == 'retry'
              ? 'Le fournisseur a refusé l’envoi (limite de débit) : nouvelle tentative dans ' + w + ' s…'
              : 'Pause pour respecter la limite de débit du fournisseur : envoi dans ' + w + ' s…'
          );
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
    $('#gst').textContent = msg ? 'Échec : ' + msg : 'Réponse reçue.';
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
    app.actI = i;
    $('#dma').showModal();
    return;
  }
  if (app.busy) return;
  if (a == 'r') regen();
  else if (a == 'k') ask(null, true);
  else swipe(a == 'p' ? -1 : 1);
};
const goTurn = d => {
  const w = $('#msgs'),
    e = document.querySelector('#msgs .m[data-i="' + (visibleStart() + d) + '"]');
  if (e) e.scrollIntoView({ block: 'start', behavior: 'smooth' });
  else w.scrollTo({ top: d < 0 ? 0 : w.scrollHeight, behavior: 'smooth' });
};
const navView = () => {
  const m = $('#msgs');
  $('#nav').hidden = m.scrollHeight - m.scrollTop - m.clientHeight < 80;
};
$('#msgs').onscroll = navView;
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
$('#damc').onclick = () => $('#dma').close();
$('#mac').onclick = () => {
  $('#dma').close();
  navigator.clipboard
    ?.writeText(plain(app.cur.messages[app.actI].content, app.cur.pname))
    .then(() => toast('Message copié'))
    .catch(() => toast('Copie impossible'));
};
$('#mae').onclick = () => {
  $('#dma').close();
  if (app.busy) return;
  app.editI = app.actI;
  $('#et').value = raw(app.cur.messages[app.editI]);
  $('#de').showModal();
};
$('#mad').onclick = () => {
  $('#dma').close();
  if (!app.busy) delFrom(app.actI);
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
