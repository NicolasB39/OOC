export const PROVIDERS = {
  groq: { n: 'Groq', u: 'https://api.groq.com/openai/v1', m: 'llama-3.3-70b-versatile' },
  gemini: {
    n: 'Gemini',
    u: 'https://generativelanguage.googleapis.com/v1beta/openai',
    m: 'gemini-3.8-flash'
  },
  mistral: { n: 'Mistral', u: 'https://api.mistral.ai/v1', m: 'mistral-small-latest' },
  openrouter: { n: 'OpenRouter', u: 'https://openrouter.ai/api/v1', m: 'openrouter/free' }
};
export const S = { provider: 'groq', keys: {}, models: {} };
export const ctx = { system: '', avatar: '', chars: [], lore: [], images: [], stat: '' };
export const IMG = {};
export const app = {
  cur: null,
  menuId: null,
  editI: null,
  busy: false,
  ctl: null,
  LIM: 50,
  FIL: 'all',
  stream: null,
  reading: false,
  pt: 0
};
