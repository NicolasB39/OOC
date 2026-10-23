import { chat, summarize } from './ai.js';
import { CHX, ETX, body, choicesOf, lastEtat } from './format.js';
import { showList } from './list.js';
import { build, statOn } from './prompt.js';
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
import { getOne, save } from './store.js';
import { $, LS, esc, fit, ic, plain, strip, toast } from './util.js';

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
  $('#err').textContent = !app.cur.remote
    ? ''
    : !ctx.system
      ? 'Prompt introuvable : vérifiez scenarios/' + app.cur.folder + '/systeme.md'
      : TERR
        ? 'GitHub indisponible (' + TERR + ') : fiches, images et lorebooks peuvent manquer.'
        : '';
  $('#inp').value = LS.get('draft:' + id) || '';
  fit();
  render(true);
}
export function tk() {
  const e = $('#tk');
  if (!app.cur || !app.cur.mem) {
    e.textContent = '';
    return;
  }
  const n = Math.ceil(build(app.cur).reduce((a, m) => a + m.content.length, 0) / 3.5),
    l = S.ctxLim || 0,
    w = l && n > l * 0.9,
    f = x => x.toLocaleString('fr-FR');
  e.className = w ? 'w' : '';
  e.textContent = w
    ? 'Contexte presque plein (≈ ' +
      f(n) +
      ' / ' +
      f(l) +
      ' tokens) : supprimez des messages ou ajustez la mémoire.'
    : '≈ ' + f(n) + ' tokens envoyés';
}
export function render(sc) {
  $('#ct').textContent = app.cur.name;
  const n = app.cur.messages.length,
    st = Math.max(0, n - app.LIM);
  const lm = app.cur.messages.at(-1);
  const cs = lm?.role == 'assistant' && !app.cur.noChoices ? choicesOf(lm.content) : [];
  const cv = !st && coverOf(app.cur);
  $('#msgs').innerHTML =
    (cv ? `<img class="cover" src="${esc(cv)}" alt="" decoding="async">` : '') +
    (st ? '<button class="more">Afficher les messages précédents</button>' : '') +
    app.cur.messages
      .slice(st)
      .map((m, j) => {
        const i = st + j,
          last = i == n - 1,
          al = last && m.alts?.length > 1;
        return (
          `<div class="m ${m.role}" data-i="${i}"><div class="b">${body(m.content)}</div><div class="a">` +
          (al
            ? `<button data-a="p" aria-label="Variante précédente">${ic('chevl', 18)}</button><span class="n">${m.ai + 1}/${m.alts.length}</span><button data-a="n" aria-label="Variante suivante">${ic('chevr', 18)}</button>`
            : '') +
          (ttsOk
            ? `<button data-a="v" data-i="${i}" aria-label="Lire à voix haute">${ic('vol', 17)}</button>`
            : '') +
          `<button data-a="c" data-i="${i}" aria-label="Copier">${ic('copy', 17)}</button><button data-a="e" data-i="${i}" aria-label="Modifier">${ic('edit', 17)}</button><button data-a="d" data-i="${i}" aria-label="Supprimer à partir d'ici">${ic('trash', 17)}</button>` +
          (last
            ? `<button data-a="r" data-i="${i}" aria-label="Régénérer">${ic('refresh', 17)}</button>` +
              (m.role == 'assistant'
                ? `<button data-a="k" data-i="${i}" aria-label="Continuer">${ic('chevsr', 17)}</button>`
                : '')
            : '') +
          `</div></div>`
        );
      })
      .join('') +
    (cs.length
      ? `<div class="ch">${cs.map(c => `<button>${esc(c)}</button>`).join('')}</div>`
      : '') +
    (n ? '' : '<p class="hint">Écrivez votre premier tour pour lancer l\'histoire.</p>');
  if (sc) {
    const m = $('#msgs');
    m.scrollTop = m.scrollHeight;
    m.querySelectorAll('img').forEach(i => {
      if (!i.complete)
        i.addEventListener(
          'load',
          () => {
            if (m.scrollHeight - m.scrollTop - m.clientHeight < 600) m.scrollTop = m.scrollHeight;
          },
          { once: true }
        );
    });
  }
  tk();
  stateView();
  refreshSpeech();
}
function stateView() {
  const e = $('#stp');
  const st = statOn(app.cur) ? lastEtat(app.cur.messages) : null;
  if (!st) {
    e.hidden = true;
    return;
  }
  $('#sts').innerHTML = st
    .slice(0, 2)
    .map(([k, v]) => `<span class="chip"><b>${esc(k)}</b>${esc(v)}</span>`)
    .join('');
  $('#stg').innerHTML = st
    .map(([k, v]) => {
      const m = v.match(/^(\d+(?:[.,]\d+)?)\s*\/\s*(\d+(?:[.,]\d+)?)$/),
        p = m
          ? Math.max(0, Math.min(100, (+m[1].replace(',', '.') / +m[2].replace(',', '.')) * 100))
          : null;
      return `<div class="kv"><span>${esc(k)}</span><b>${esc(v)}</b>${p != null ? `<i class="bar"><u style="width:${p}%"></u></i>` : ''}</div>`;
    })
    .join('');
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
async function swipe(d) {
  stopSpeech();
  const m = app.cur.messages.at(-1),
    k = (m.ai + d + m.alts.length) % m.alts.length;
  m.ai = k;
  m.content = m.alts[k];
  await save();
  render(true);
}
function setBusy(b) {
  app.busy = b;
  $('#send').hidden = b;
  $('#stop').hidden = !b;
  $('#err').textContent = '';
}
async function ask(old, cont) {
  const s = app.cur,
    p = S.provider,
    k = S.keys[p];
  if (!k) {
    if (old) s.messages.push(old);
    render();
    $('#err').textContent = 'Ajoutez une clé API dans les réglages IA (roue dentée en haut).';
    return;
  }
  setBusy(true);
  let msg = '',
    cut = false,
    part = false,
    raf = 0,
    pend = null;
  const paint = () => {
    raf = 0;
    if (app.cur !== s || !pend) return;
    const [t, th] = pend;
    const m = $('#msgs');
    let e = document.querySelector('#live');
    if (!e) {
      m.insertAdjacentHTML(
        'beforeend',
        '<div class="m assistant" id="live"><div class="b"></div></div>'
      );
      e = $('#live');
    }
    const v = strip(t);
    e.firstChild.innerHTML = v ? body(v) : t || th ? '<span class="act">Réflexion…</span>' : '';
    if (m.scrollHeight - m.scrollTop - m.clientHeight < 200) m.scrollTop = m.scrollHeight;
  };
  const live = (t, th) => {
    pend = [t, th];
    if (!raf) raf = requestAnimationFrame(paint);
  };
  try {
    live('');
    const r = await chat(build(s, cont), {
      max: +s.maxTok || 0,
      ac: (app.ctl = new AbortController()),
      od: S.ns?.[p] ? null : live,
      temp: s.temp ?? S.temp,
      top: s.top ?? S.top
    });
    app.stream = { mode: S.ns?.[p] ? 'off' : r.mode, chunks: r.chunks, ms: r.ms };
    const out = r.t;
    cut = r.cut;
    part = !!r.partial;
    if (cont) {
      const m = s.messages.at(-1);
      m.content =
        m.content.replace(CHX, '').replace(ETX, '').trimEnd() +
        (/^[\s.,;:!?…»)]/.test(out) ? '' : ' ') +
        out;
      if (m.alts) m.alts[m.ai] = m.content;
    } else {
      const al = old?.role == 'assistant' ? [...(old.alts || [old.content]), out].slice(-10) : null;
      s.messages.push(
        al
          ? { role: 'assistant', content: out, alts: al, ai: al.length - 1 }
          : { role: 'assistant', content: out }
      );
    }
    old = null;
    await save(s);
  } catch (e) {
    msg = e.message;
    if (old) s.messages.push(old);
  }
  cancelAnimationFrame(raf);
  pend = null;
  setBusy(false);
  if (app.cur === s) {
    $('#err').textContent =
      msg ||
      (part
        ? 'Réponse interrompue : le texte reçu est conservé. Continuez (double chevron) ou régénérez.'
        : cut
          ? 'Réponse coupée par la longueur maximale. Augmentez-la dans les réglages du scénario, continuez ou régénérez.'
          : '');
    render(true);
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
  const b = e.target.closest('button');
  if (!b) {
    const m = e.target.closest('.m');
    if (app.reading && m) speakFrom(+m.dataset.i);
    return;
  }
  if (b.classList.contains('more')) {
    app.LIM += 50;
    render();
    $('#msgs').scrollTop = 0;
    return;
  }
  if (b.parentElement.classList.contains('ch')) {
    $('#inp').value = b.textContent;
    fit();
    $('#inp').focus();
    return;
  }
  const a = b.dataset.a,
    i = +b.dataset.i;
  if (a == 'c') {
    navigator.clipboard
      ?.writeText(plain(app.cur.messages[i].content))
      .then(() => {
        const o = b.innerHTML;
        b.innerHTML = ic('check', 17);
        setTimeout(() => {
          b.innerHTML = o;
        }, 1200);
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
    $('#et').value = app.cur.messages[i].content;
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
  const m = app.cur.messages[app.editI];
  m.content = $('#et').value;
  if (m.alts) m.alts[m.ai] = m.content;
  await save();
  render();
  $('#de').close();
};
