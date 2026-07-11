/**
 * 實際生效的 OCR 設定:
 * 全域設定(系統主檔「設定」分頁,admin 維護)優先;
 * 尚未設定全域值時退回本機 settings(相容單機/初次使用)。
 */
import type { OcrConfig } from './google/masterSheet'
import { PROVIDERS, type ProviderId } from './providers'
import type { Settings } from './settings'

export type EffectiveOcr = {
  provider: ProviderId
  model: string
  specPrompt: string
  /** provider/model 是否來自 admin 的全域設定 */
  adminManaged: boolean
}

function isProviderId(v: string): v is ProviderId {
  return v in PROVIDERS
}

export function effectiveOcr(settings: Settings, config: OcrConfig | null): EffectiveOcr {
  const globalProvider =
    config && isProviderId(config.provider) ? config.provider : null

  if (globalProvider) {
    return {
      provider: globalProvider,
      model: config!.model.trim() || settings.providers[globalProvider].model,
      specPrompt: config!.specPrompt.trim() || settings.specPrompt,
      adminManaged: true,
    }
  }

  return {
    provider: settings.activeProvider,
    model: settings.providers[settings.activeProvider].model,
    specPrompt: config?.specPrompt.trim() || settings.specPrompt,
    adminManaged: false,
  }
}
