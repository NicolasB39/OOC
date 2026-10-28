export const PROVIDERS = {
  groq: { n: 'Groq', u: 'https://api.groq.com/openai/v1', m: 'llama-3.3-70b-versatile' },
  gemini: {
    n: 'Gemini',
    u: 'https://generativelanguage.googleapis.com/v1beta/openai',
    m: 'gemini-flash-latest'
  },
  mistral: { n: 'Mistral', u: 'https://api.mistral.ai/v1', m: 'mistral-small-latest' },
  openrouter: { n: 'OpenRouter', u: 'https://openrouter.ai/api/v1', m: 'openrouter/free' },
  claude: { n: 'Claude (Anthropic)', u: 'https://api.anthropic.com/v1', m: 'claude-sonnet-5-5', fmt: 'anthropic' }
};
export const S = { provider: 'groq', keys: {}, models: {} };
export const ctx = { system: '', avatar: '', chars: [], lore: [], images: [], stat: '', decors: [], decorDef: '', intro: '' };
export const IMG = {};
export const app = {
  cur: null,
  menuId: null,
  editI: null,
  actI: null,
  busy: false,
  ctl: null,
  LIM: 50,
  FIL: 'all',
  stream: null,
  reading: false,
  pt: 0
};
