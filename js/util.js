let toastT;
const PRIM = {
  value: '',
  checked: false,
  hidden: false,
  open: false,
  disabled: false,
  readOnly: false,
  textContent: '',
  innerHTML: '',
  innerText: '',
  className: ''
};
const stub = new Proxy(function () {}, {
  get: (_, k) =>
    k in PRIM ? PRIM[k] : k === Symbol.toPrimitive ? () => '' : k === 'then' ? undefined : stub,
  set: () => true,
  apply: () => stub
});
export const $ = s => {
  const e = document.querySelector(s);
  if (e) return e;
  (window.__missing ??= new Set()).add(s);
  return stub;
};
const NS = 'http://www.w3.org/2000/svg';
export const el = (t, p, ...c) => {
  const e = document.createElement(t);
  for (const k in p || {}) {
    const v = p[k];
    if (v == null || v === false) continue;
    if (k == 'class') e.className = v;
    else if (k == 'text') e.textContent = v;
    else if (k == 'data') for (const d in v) e.dataset[d] = v[d];
    else if (k.startsWith('on')) e[k] = v;
    else if (k in e && typeof e[k] == 'boolean') e[k] = !!v;
    else e.setAttribute(k, v);
  }
  for (const x of c.flat(9)) if (x != null && x !== false) e.append(x);
  return e;
};
export const ic = (n, s) => {
  const e = document.createElementNS(NS, 'svg'),
    u = document.createElementNS(NS, 'use');
  e.setAttribute('class', 'i' + (n == 'logo' ? ' logo' : ''));
  e.setAttribute('aria-hidden', 'true');
  if (s) {
    e.style.width = s + 'px';
    e.style.height = s + 'px';
  }
  u.setAttribute('href', '#i-' + n);
  e.append(u);
  return e;
};
export const hue = s => {
  let x = 0;
  for (const c of s) x = (x * 31 + c.charCodeAt(0)) % 360;
  return x;
};
export const ago = t => {
  const m = Math.round((Date.now() - t) / 6e4);
  if (m < 1) return "à l'instant";
  if (m < 60) return 'il y a ' + m + ' min';
  const h = Math.round(m / 60);
  if (h < 24) return 'il y a ' + h + ' h';
  const d = Math.round(h / 24);
  return d == 1
    ? 'hier'
    : d < 30
      ? 'il y a ' + d + ' j'
      : new Date(t).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });
};
export const LS = {
  get: k => {
    try {
      return localStorage.getItem(k);
    } catch (e) {
      return null;
    }
  },
  set: (k, v) => {
    try {
      localStorage.setItem(k, v);
    } catch (e) {}
  },
  del: k => {
    try {
      localStorage.removeItem(k);
    } catch (e) {}
  }
};
export const dlg = (t, { m = '', v = null, ok = 'OK', no = 'Annuler', ph = '' } = {}) =>
  new Promise(res => {
    const d = $('#dq'),
      i = $('#dqi');
    $('#dqt').textContent = t;
    $('#dqm').textContent = m;
    $('#dqm').hidden = !m;
    i.hidden = v === null;
    i.value = v ?? '';
    i.placeholder = ph;
    $('#dqo').textContent = ok;
    $('#dqc').textContent = no;
    let r = null;
    $('#dqo').onclick = () => {
      r = v === null ? true : i.value;
      d.close();
    };
    $('#dqc').onclick = () => d.close();
    d.onclose = () => res(r);
    d.showModal();
    if (v !== null) i.focus();
  });
export const vt = fn => {
  if (!document.startViewTransition || matchMedia('(prefers-reduced-motion: reduce)').matches) {
    fn();
    return Promise.resolve();
  }
  try {
    const t = document.startViewTransition(fn);
    t.finished.catch(() => {});
    return t.updateCallbackDone;
  } catch (e) {
    fn();
    return Promise.resolve();
  }
};
export const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
export const strip = t =>
  t
    .replace(/<think>[\s\S]*?(?:<\/think>|$)/gi, '')
    .replace(/^[\s\S]*<\/think>/i, '')
    .trim();
export const plain = (t, nm) =>
  t
    .replace(/<choix>[\s\S]*?(?:<\/choix>|$)/gi, '')
    .replace(/<etat>[\s\S]*?(?:<\/etat>|$)/gi, '')
    .replace(/\{\{img::[^}]*\}\}/g, '')
    .replace(/\{\{user\}\}/gi, nm?.trim() || 'Joueur')
    .trim();
export const err = (t, bad, a) => {
  const e = $('#err');
  e.textContent = t;
  e.className = t && bad ? 'e' : '';
  if (t && a) {
    const b = document.createElement('button');
    b.textContent = a.label;
    b.onclick = () => {
      err('');
      a.fn();
    };
    e.append(b);
  }
};
export const num = s => ($(s).value === '' ? null : +$(s).value);
export const fit = () => {
  const i = $('#inp');
  i.style.height = 'auto';
  i.style.height = Math.min(i.scrollHeight, 140) + 'px';
};
export const nz = s =>
  s
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
export const ikey = s =>
  nz(s)
    .replace(/[\s_.\-]+/g, '_')
    .replace(/^_+|_+$/g, '');
export const toast = (t, a) => {
  const e = $('#toast');
  e.textContent = t;
  if (a) {
    const b = document.createElement('button');
    b.textContent = a.label;
    b.onclick = () => {
      e.hidden = true;
      clearTimeout(toastT);
      a.fn();
    };
    e.append(b);
  }
  e.hidden = false;
  clearTimeout(toastT);
  if (a?.keep) return;
  toastT = setTimeout(
    () => {
      e.hidden = true;
    },
    a ? 7000 : 2600
  );
};
