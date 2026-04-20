import { createAnthropic } from '@ai-sdk/anthropic'
import { createGoogleGenerativeAI } from '@ai-sdk/google'
import { createOpenAI } from '@ai-sdk/openai'
import { createOpenRouter } from '@openrouter/ai-sdk-provider'
import type { LanguageModel } from 'ai'
import type { ProviderId } from './providers'

export function getModel(
  provider: ProviderId,
  apiKey: string,
  modelId: string,
): LanguageModel {
  switch (provider) {
    case 'google':
      return createGoogleGenerativeAI({ apiKey })(modelId)
    case 'openai':
      return createOpenAI({ apiKey })(modelId)
    case 'anthropic':
      return createAnthropic({
        apiKey,
        headers: { 'anthropic-dangerous-direct-browser-access': 'true' },
      })(modelId)
    case 'openrouter':
      return createOpenRouter({ apiKey })(modelId)
  }
}
