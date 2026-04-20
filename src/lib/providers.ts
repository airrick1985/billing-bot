export type ProviderId = 'google' | 'openai' | 'anthropic' | 'openrouter'

export type DefaultModel = {
  value: string
  hint?: string
}

export type ProviderMeta = {
  id: ProviderId
  displayName: string
  short: string
  getKeyUrl: string
  keyPlaceholder: string
  defaultModel: string
  defaultModels: DefaultModel[]
}

export const PROVIDER_IDS: ProviderId[] = ['google', 'openai', 'anthropic', 'openrouter']

export const PROVIDERS: Record<ProviderId, ProviderMeta> = {
  google: {
    id: 'google',
    displayName: 'Google Gemini',
    short: 'Gemini',
    getKeyUrl: 'https://aistudio.google.com/apikey',
    keyPlaceholder: 'AIza...',
    defaultModel: 'gemini-2.5-flash',
    defaultModels: [
      { value: 'gemini-2.5-flash', hint: '推薦 — 快且便宜,多模態' },
      { value: 'gemini-2.5-pro', hint: '最準、較貴' },
      { value: 'gemini-2.5-flash-lite', hint: '最省成本' },
    ],
  },
  openai: {
    id: 'openai',
    displayName: 'OpenAI',
    short: 'OpenAI',
    getKeyUrl: 'https://platform.openai.com/api-keys',
    keyPlaceholder: 'sk-...',
    defaultModel: 'gpt-4o',
    defaultModels: [
      { value: 'gpt-4o', hint: '多模態,穩定' },
      { value: 'gpt-4o-mini', hint: '便宜版' },
    ],
  },
  anthropic: {
    id: 'anthropic',
    displayName: 'Anthropic Claude',
    short: 'Claude',
    getKeyUrl: 'https://console.anthropic.com/settings/keys',
    keyPlaceholder: 'sk-ant-...',
    defaultModel: 'claude-sonnet-4-6',
    defaultModels: [
      { value: 'claude-opus-4-7', hint: '最強,貴' },
      { value: 'claude-sonnet-4-6', hint: '推薦,平衡' },
      { value: 'claude-haiku-4-5', hint: '快且便宜' },
    ],
  },
  openrouter: {
    id: 'openrouter',
    displayName: 'OpenRouter',
    short: 'OpenRouter',
    getKeyUrl: 'https://openrouter.ai/keys',
    keyPlaceholder: 'sk-or-...',
    defaultModel: 'google/gemini-2.5-flash',
    defaultModels: [
      { value: 'google/gemini-2.5-flash', hint: '經 OpenRouter 打 Gemini' },
      { value: 'anthropic/claude-sonnet-4.6', hint: '經 OpenRouter 打 Claude' },
      { value: 'openai/gpt-4o', hint: '經 OpenRouter 打 GPT' },
    ],
  },
}

export async function fetchModels(id: ProviderId, apiKey: string): Promise<string[]> {
  if (!apiKey.trim()) throw new Error('請先輸入 API Key')
  switch (id) {
    case 'google':
      return fetchGoogleModels(apiKey)
    case 'openai':
      return fetchOpenAIModels(apiKey)
    case 'anthropic':
      return fetchAnthropicModels(apiKey)
    case 'openrouter':
      return fetchOpenRouterModels(apiKey)
  }
}

async function fetchGoogleModels(apiKey: string): Promise<string[]> {
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(apiKey)}`,
  )
  if (!res.ok) throw new Error(`Google API ${res.status}: ${await res.text()}`)
  const data = (await res.json()) as {
    models?: Array<{ name?: string; supportedGenerationMethods?: string[] }>
  }
  return (data.models ?? [])
    .filter((m) => m.supportedGenerationMethods?.includes('generateContent'))
    .map((m) => (m.name ?? '').replace(/^models\//, ''))
    .filter((n) => n.startsWith('gemini-'))
    .sort()
}

async function fetchOpenAIModels(apiKey: string): Promise<string[]> {
  const res = await fetch('https://api.openai.com/v1/models', {
    headers: { Authorization: `Bearer ${apiKey}` },
  })
  if (!res.ok) throw new Error(`OpenAI API ${res.status}: ${await res.text()}`)
  const data = (await res.json()) as { data?: Array<{ id: string }> }
  return (data.data ?? [])
    .map((m) => m.id)
    .filter((id) => /^(gpt-|o\d|chatgpt-)/.test(id))
    .sort()
}

async function fetchAnthropicModels(apiKey: string): Promise<string[]> {
  const res = await fetch('https://api.anthropic.com/v1/models', {
    headers: {
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true',
    },
  })
  if (!res.ok) throw new Error(`Anthropic API ${res.status}: ${await res.text()}`)
  const data = (await res.json()) as { data?: Array<{ id: string }> }
  return (data.data ?? []).map((m) => m.id).sort()
}

async function fetchOpenRouterModels(apiKey: string): Promise<string[]> {
  const res = await fetch('https://openrouter.ai/api/v1/models', {
    headers: { Authorization: `Bearer ${apiKey}` },
  })
  if (!res.ok) throw new Error(`OpenRouter API ${res.status}: ${await res.text()}`)
  const data = (await res.json()) as { data?: Array<{ id: string }> }
  return (data.data ?? []).map((m) => m.id).sort()
}

type ModelCache = { fetchedAt: number; models: string[] }
const CACHE_TTL_MS = 24 * 60 * 60 * 1000
const cacheKey = (id: ProviderId) => `billing-bot:models:${id}:v1`

export function loadCachedModels(id: ProviderId): { models: string[]; fetchedAt: number | null } {
  try {
    const raw = localStorage.getItem(cacheKey(id))
    if (!raw) return { models: [], fetchedAt: null }
    const cache = JSON.parse(raw) as ModelCache
    return { models: cache.models ?? [], fetchedAt: cache.fetchedAt ?? null }
  } catch {
    return { models: [], fetchedAt: null }
  }
}

export function saveCachedModels(id: ProviderId, models: string[]) {
  const cache: ModelCache = { fetchedAt: Date.now(), models }
  localStorage.setItem(cacheKey(id), JSON.stringify(cache))
}

export function isCacheFresh(fetchedAt: number | null): boolean {
  if (fetchedAt == null) return false
  return Date.now() - fetchedAt < CACHE_TTL_MS
}
