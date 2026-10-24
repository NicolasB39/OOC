import { S } from './state.js';

const W = 60000;
let use = [];
const RL = { lim: 0, rem: 0, at: 0, req: 0 };
export const last = { cached: 0, total: 0 };

const dur = s => {
  const m = String(s || '').match(/^(?:([\d.]+)h)?(?:([\d.]+)m)?(?:([\d.]+)s)?$/);
  return m ? ((+m[1] || 0) * 3600 + (+m[2] || 0) * 60 + (+m[3] || 0)) * 1000 : 0;
};
const local = () => {
  const t = Date.now() - W;
  use = use.filter(x => x[0] > t);
  return use.reduce((a, x) => a + x[1], 0);
};
export const spend = n => n > 0 && use.push([Date.now(), n]);
export const reset = () => {
  use = [];
  Object.assign(RL, { lim: 0, rem: 0, at: 0, req: 0 });
  Object.assign(last, { cached: 0, total: 0 });
};

export function note(h, u) {
  const tot = u?.total_tokens || (u?.prompt_tokens || 0) + (u?.completion_tokens || 0);
  if (tot) {
    spend(tot);
    last.total = tot;
  }
  last.cached = u?.prompt_tokens_details?.cached_tokens ?? u?.cache_read_input_tokens ?? 0;
  const lim = +h?.get?.('x-ratelimit-limit-tokens') || 0,
    rem = h?.get?.('x-ratelimit-remaining-tokens');
  if (lim && rem != null && rem !== '') {
    RL.lim = lim;
    RL.rem = +rem;
    RL.at = Date.now();
    RL.req = +h.get('x-ratelimit-remaining-requests') || 0;
    if (S.tpm !== lim) S.tpm = lim;
  }
}

export function status() {
  const fresh = RL.lim && Date.now() - RL.at < 150000;
  if (fresh) {
    const back = (RL.lim * Math.min(W, Date.now() - RL.at)) / W;
    return { lim: RL.lim, rem: Math.min(RL.lim, Math.round(RL.rem + back)), src: 'api', req: RL.req };
  }
  const lim = S.tpm || 0;
  return lim ? { lim, rem: Math.max(0, lim - local()), src: 'local', req: 0 } : null;
}

export function wait(est) {
  const s = status();
  if (!s || !est || est > s.lim) return 0;
  if (est <= s.rem) return 0;
  if (s.src == 'api') return Math.ceil(((est - s.rem) / s.lim) * 60);
  const now = Date.now();
  let acc = s.rem;
  for (const [t, n] of [...use].sort((a, b) => a[0] - b[0])) {
    acc += n;
    if (acc >= est) return Math.max(1, Math.ceil((t + W - now) / 1000));
  }
  return 60;
}
