let toastT;
export const $ = s => document.querySelector(s);
export const ic = (n, s) =>
  `<svg class="i${n == 'logo' ? ' logo' : ''}"${s ? ` style="width:${s}px;height:${s}px"` : ''} aria-hidden="true"><use href="#i-${n}"/></svg>`;
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
export const esc = t =>
  String(t).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
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
export const dlg = (t, { m = '', v = null, ok = 'OK', no = 'Annuler' } = {}) =>
  new Promise(res => {
    const d = $('#dq'),
      i = $('#dqi');
    $('#dqt').textContent = t;
    $('#dqm').textContent = m;
    $('#dqm').hidden = !m;
    i.hidden = v === null;
    i.value = v ?? '';
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
export const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
export const strip = t => t.replace(/<think>[\s\S]*?(?:<\/think>|$)/gi, '').trim();
export const plain = t =>
  t
    .replace(/<choix>[\s\S]*?(?:<\/choix>|$)/gi, '')
    .replace(/<etat>[\s\S]*?(?:<\/etat>|$)/gi, '')
    .replace(/\{\{img::[^}]*\}\}/g, '')
    .trim();
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
  toastT = setTimeout(
    () => {
      e.hidden = true;
    },
    a ? 7000 : 2600
  );
};
