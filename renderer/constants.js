// ═══════════════════════════════════════════════════════════
// Banana Code Studio — Constants (mirrors CLI constants.js)
// ═══════════════════════════════════════════════════════════

export const DEFAULT_QWEN_BASE_URL = 'https://dashscope-intl.aliyuncs.com/compatible-mode/v1';
export const DEFAULT_LLAMACPP_BASE_URL = 'http://127.0.0.1:8080/v1';

export const QWEN_ENDPOINTS = [
  { label: 'International / Singapore', value: DEFAULT_QWEN_BASE_URL },
  { label: 'US / Virginia', value: 'https://dashscope-us.aliyuncs.com/compatible-mode/v1' },
  { label: 'China / Beijing', value: 'https://dashscope.aliyuncs.com/compatible-mode/v1' },
  { label: 'Custom OpenAI-compatible URL', value: 'CUSTOM_URL' },
];

export const PROVIDER_MODELS = {
  gemini: [
    { label: 'Auto Mode', value: 'auto' },
    { label: 'Gemini 2.5 Flash', value: 'gemini-2.5-flash' },
    { label: 'Gemini 2.5 Pro (paid)', value: 'gemini-2.5-pro' },
    { label: 'Gemini 3 Flash', value: 'gemini-3-flash-preview' },
    { label: 'Gemini 3.1 Flash Lite', value: 'gemini-3.1-flash-lite-preview' },
    { label: 'Gemini 3.1 Pro (paid)', value: 'gemini-3.1-pro-preview' },
  ],
  claude: [
    { label: 'Auto Mode', value: 'auto' },
    { label: 'Claude Opus 4.7 (Flagship)', value: 'claude-opus-4-7' },
    { label: 'Claude Opus 4.6', value: 'claude-opus-4-6' },
    { label: 'Claude Opus 4.6 (Fast Mode)', value: 'claude-opus-4-6-fast' },
    { label: 'Claude Sonnet 4.6', value: 'claude-sonnet-4-6' },
    { label: 'Claude Haiku 4.5', value: 'claude-haiku-4-5' },
  ],
  openai: [
    { label: 'Auto Mode', value: 'auto' },
    { label: 'GPT-5.5', value: 'gpt-5.5' },
    { label: 'GPT-5.4 Thinking', value: 'gpt-5.4' },
    { label: 'GPT-5.4 Pro', value: 'gpt-5.4-pro' },
    { label: 'GPT-5.4 mini', value: 'gpt-5.4-mini' },
    { label: 'GPT-5.3 Instant', value: 'gpt-5.3-instant' },
  ],
  mistral: [
    { label: 'Auto Mode', value: 'auto' },
    { label: 'Mistral Large', value: 'mistral-large-latest' },
    { label: 'Mistral Medium', value: 'mistral-medium-latest' },
    { label: 'Mistral Small', value: 'mistral-small-latest' },
    { label: 'Codestral', value: 'codestral-latest' },
    { label: 'Mistral Nemo', value: 'open-mistral-nemo' },
    { label: 'Pixtral 12B', value: 'pixtral-12b-2409' },
  ],
  deepseek: [
    { label: 'Auto Mode', value: 'auto' },
    { label: 'DeepSeek V4 Pro', value: 'deepseek-v4-pro' },
    { label: 'DeepSeek V4 Flash', value: 'deepseek-v4-flash' },
  ],
  kimi: [
    { label: 'Auto Mode', value: 'auto' },
    { label: 'Kimi K2.6', value: 'kimi-k2.6' },
    { label: 'Kimi K2.5', value: 'kimi-k2.5' },
  ],
  qwen: [
    { label: 'Auto Mode', value: 'auto' },
    { label: 'Qwen 3.6 Max Preview', value: 'qwen3.6-max-preview' },
    { label: 'Qwen 3.6 Plus', value: 'qwen3.6-plus' },
    { label: 'Qwen 3.6 Plus Snapshot 2026-04-02', value: 'qwen3.6-plus-2026-04-02' },
    { label: 'Qwen 3.6 Flash', value: 'qwen3.6-flash' },
    { label: 'Qwen 3.6 Flash Snapshot 2026-04-16', value: 'qwen3.6-flash-2026-04-16' },
    { label: 'Qwen 3.6 35B A3B', value: 'qwen3.6-35b-a3b' },
    { label: 'Qwen 3.6 27B', value: 'qwen3.6-27b' },
    { label: 'Qwen 3.5 Plus', value: 'qwen3.5-plus' },
    { label: 'Qwen 3.5 Plus Snapshot 2026-04-20', value: 'qwen3.5-plus-2026-04-20' },
    { label: 'Qwen 3.5 Flash', value: 'qwen3.5-flash' },
    { label: 'Qwen 3.5 397B A17B', value: 'qwen3.5-397b-a17b' },
    { label: 'Qwen 3.5 122B A10B', value: 'qwen3.5-122b-a10b' },
    { label: 'Qwen 3 Max', value: 'qwen3-max' },
    { label: 'Qwen 3 Coder Next', value: 'qwen3-coder-next' },
    { label: 'Qwen 3 Next 80B Thinking', value: 'qwen3-next-80b-a3b-thinking' },
    { label: 'Qwen 3 Next 80B Instruct', value: 'qwen3-next-80b-a3b-instruct' },
  ],
  openrouter: [], // free-text model ID input
  openai_oauth: [
    { label: 'Auto Mode', value: 'auto' },
    { label: 'GPT-5.5 (Newest)', value: 'gpt-5.5' },
    { label: 'GPT-5.4', value: 'gpt-5.4' },
    { label: 'GPT-5.3 Codex', value: 'gpt-5.3-codex' },
    { label: 'GPT-5.2 (General, Cheapest)', value: 'gpt-5.2' }
  ],
  ollama_cloud: [
    { label: 'Auto Mode', value: 'auto' },
    { label: 'Kimi K2 Thinking', value: 'kimi-k2-thinking:cloud' },
    { label: 'Kimi K2.5', value: 'kimi-k2.5:cloud' },
    { label: 'Qwen 3.5 397B', value: 'qwen3.5:397b-cloud' },
    { label: 'DeepSeek V3.2', value: 'deepseek-v3.2:cloud' },
    { label: 'GLM-5.1', value: 'glm-5.1:cloud' },
    { label: 'MiniMax M2.7', value: 'minimax-m2.7:cloud' },
    { label: 'Gemma 4 31B', value: 'gemma4:31b-cloud' },
  ],
  ollama: [],    // auto-detect from localhost:11434
  lmstudio: [],  // auto-detect from configured base URL
  llamacpp: [],  // auto-detect from configured llama.cpp server base URL
};

export const PROVIDERS = [
  { id: 'gemini',       name: 'Google Gemini',   logo: '../assets/providers/gemini.svg', needsKey: true },
  { id: 'claude',       name: 'Anthropic Claude', logo: '../assets/providers/claude.svg', needsKey: true },
  { id: 'openai',       name: 'OpenAI',          logo: '../assets/providers/openai.svg', needsKey: true },
  { id: 'openai_oauth', name: 'OpenAI Codex (OAuth)', logo: '../assets/providers/openai.svg', needsKey: false, needsOAuth: true },
  { id: 'mistral',      name: 'Mistral AI',      logo: '../assets/providers/mistral.svg', needsKey: true },
  { id: 'deepseek',     name: 'DeepSeek',        logo: '../assets/providers/deepseek.svg', needsKey: true },
  { id: 'kimi',         name: 'Kimi AI',         logo: '../assets/providers/kimi-icon-rounded-corner.png', needsKey: true },
  { id: 'qwen',         name: 'Qwen',            needsKey: true },
  { id: 'openrouter',   name: 'OpenRouter',      logo: '../assets/providers/openrouter.webp', needsKey: true },
  { id: 'ollama_cloud', name: 'Ollama Cloud',    logo: '../assets/providers/ollama.svg', needsKey: true },
  { id: 'ollama',       name: 'Ollama (Local)',  logo: '../assets/providers/ollama.svg', needsKey: false },
  { id: 'lmstudio',     name: 'LM Studio',       logo: '../assets/providers/lmstudio.png', needsKey: false },
  { id: 'llamacpp',     name: 'llama.cpp',       needsKey: false },
];

export const REASONING_LEVELS = {
  low:    { label: 'Low' },
  medium: { label: 'Medium' },
  high:   { label: 'High' },
  xhigh:  { label: 'XHigh' },
  max:    { label: 'Max' },
};

export const PERMISSION_MODES = [
  { id: 'yolo',   label: 'Full access',   icon: 'unlocked', desc: 'Auto-approve all' },
  { id: 'guard',  label: 'Banana Guard',  icon: 'shield', desc: 'Smart auto-approve' },
  { id: 'manual', label: 'Permissions',   icon: 'lock', desc: 'Ask for everything' },
];

export const OPERATING_MODES = [
  { id: 'agent', label: 'Agent' },
  { id: 'plan', label: 'Plan' },
  { id: 'ask', label: 'Ask' },
  { id: 'security', label: 'Security' },
  { id: 'deepreview_full', label: 'DeepReview Full' },
  { id: 'deepreview_diff', label: 'DeepReview Diff' },
  { id: 'skill_creator', label: 'Skill Creator' },
];

export function providerLogoHtml(provider, className = 'provider-logo') {
  if (!provider) return `<span class="${className} provider-logo-fallback">AI</span>`;
  if (provider.logo) {
    return `<img class="${className}" src="${provider.logo}" alt="${provider.name} logo">`;
  }
  return `<span class="${className} provider-logo-fallback">${provider.short || provider.name.slice(0, 2).toUpperCase()}</span>`;
}

export function iconHtml(name, className = 'ui-icon') {
  const icons = {
    back: '<svg viewBox="0 0 20 20" aria-hidden="true"><path d="M12.5 4.5 7 10l5.5 5.5"/></svg>',
    forward: '<svg viewBox="0 0 20 20" aria-hidden="true"><path d="m7.5 4.5 5.5 5.5-5.5 5.5"/></svg>',
    menu: '<svg viewBox="0 0 20 20" aria-hidden="true"><path d="M4 6h12M4 10h12M4 14h12"/></svg>',
    edit: '<svg viewBox="0 0 20 20" aria-hidden="true"><path d="M4.5 14.5 5 11l7.2-7.2a1.7 1.7 0 0 1 2.4 2.4L7.4 13.4 4.5 14.5Z"/><path d="M11.4 4.6 13.4 6.6"/></svg>',
    folder: '<svg viewBox="0 0 20 20" aria-hidden="true"><path d="M3 6.5h5l1.5 2H17l-1.2 6H4.2L3 6.5Z"/></svg>',
    plus: '<svg viewBox="0 0 20 20" aria-hidden="true"><path d="M10 4v12M4 10h12"/></svg>',
    trash: '<svg viewBox="0 0 20 20" aria-hidden="true"><path d="M7 5V4h6v1M4.5 6.5h11M6 6.5l.7 9h6.6l.7-9M8.5 9v4M11.5 9v4"/></svg>',
    settings: '<svg viewBox="0 0 20 20" aria-hidden="true"><path d="M10 7a3 3 0 1 0 0 6 3 3 0 0 0 0-6Z"/><path d="M15.5 11.2a5.8 5.8 0 0 0 0-2.4l1.4-1.1-1.5-2.5-1.7.7a6 6 0 0 0-2.1-1.2L11.4 3H8.6l-.3 1.7a6 6 0 0 0-2.1 1.2l-1.7-.7L3.1 7.7l1.4 1.1a5.8 5.8 0 0 0 0 2.4l-1.4 1.1 1.4 2.5 1.7-.7a6 6 0 0 0 2.1 1.2l.3 1.7h2.8l.3-1.7a6 6 0 0 0 2.1-1.2l1.7.7 1.5-2.5-1.5-1.1Z"/></svg>',
    shield: '<svg viewBox="0 0 20 20" aria-hidden="true"><path d="M10 3.5 15 5v4.2c0 3.1-1.7 5.6-5 7.3-3.3-1.7-5-4.2-5-7.3V5l5-1.5Z"/></svg>',
    lock: '<svg viewBox="0 0 20 20" aria-hidden="true"><path d="M6 8V6.7a4 4 0 0 1 8 0V8"/><rect x="5" y="8" width="10" height="8" rx="2"/></svg>',
    unlocked: '<svg viewBox="0 0 20 20" aria-hidden="true"><path d="M7 8V6.7a4 4 0 0 1 7.5-1.9"/><rect x="5" y="8" width="10" height="8" rx="2"/></svg>',
  };
  return `<span class="${className}">${icons[name] || ''}</span>`;
}
