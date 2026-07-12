import { useMemo, useState } from 'react'
import { effectiveOcr } from '../lib/effectiveOcr'
import type { OcrConfig } from '../lib/google/masterSheet'
import {
  PROVIDER_IDS,
  PROVIDERS,
  fetchModels,
  isCacheFresh,
  loadCachedModels,
  saveCachedModels,
  type ProviderId,
} from '../lib/providers'
import { DEFAULT_SPEC_PROMPT, type Settings } from '../lib/settings'

/** 全域 OCR 設定(AI Provider / 模型 / SPEC Prompt),僅管理者可編輯,存系統主檔 */
export default function GlobalOcrCard({
  settings,
  ocrConfig,
  onSave,
}: {
  settings: Settings
  ocrConfig: OcrConfig | null
  onSave: (config: OcrConfig) => Promise<void>
}) {
  const init = effectiveOcr(settings, ocrConfig)
  const [provider, setProvider] = useState<ProviderId>(init.provider)
  const [model, setModel] = useState(init.model)
  const [specPrompt, setSpecPrompt] = useState(init.specPrompt)
  const [saving, setSaving] = useState(false)
  const [flash, setFlash] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null)

  const dirty =
    provider !== (ocrConfig?.provider ?? '') ||
    model !== (ocrConfig?.model ?? '') ||
    specPrompt !== (ocrConfig?.specPrompt ?? '')

  const switchProvider = (id: ProviderId) => {
    setProvider(id)
    setModel(PROVIDERS[id].defaultModel)
  }

  const save = async () => {
    if (!model.trim()) {
      setFlash({ kind: 'err', text: '請先選擇模型' })
      return
    }
    setSaving(true)
    setFlash(null)
    try {
      await onSave({ provider, model: model.trim(), specPrompt })
      setFlash({ kind: 'ok', text: '已儲存,所有使用者立即生效' })
    } catch (err) {
      setFlash({ kind: 'err', text: err instanceof Error ? err.message : String(err) })
    } finally {
      setSaving(false)
    }
  }

  return (
    <section className="nb-card p-6">
      <div className="flex items-baseline justify-between">
        <div>
          <h2 className="text-lg font-extrabold">全域 OCR 設定</h2>
          <p className="mt-1 text-sm text-neutral-600">
            AI Provider、模型與 SPEC Prompt,全公司共用,儲存後所有使用者立即生效。
          </p>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        {PROVIDER_IDS.map((id) => (
          <button
            key={id}
            type="button"
            onClick={() => switchProvider(id)}
            className={`nb-btn px-3 py-1.5 text-sm ${
              id === provider ? 'nb-btn-dark' : ''
            }`}
          >
            {PROVIDERS[id].short}
          </button>
        ))}
      </div>

      <div className="mt-5">
        <ModelField
          key={provider}
          providerId={provider}
          apiKey={settings.providers[provider].apiKey}
          value={model}
          onChange={setModel}
        />
      </div>

      <div className="mt-5">
        <div className="flex items-baseline justify-between">
          <label htmlFor="spec-prompt" className="text-sm font-bold">
            SPEC Prompt
          </label>
          <button
            type="button"
            onClick={() => {
              if (confirm('把 SPEC Prompt 重設為系統預設?當前內容會被覆蓋。')) {
                setSpecPrompt(DEFAULT_SPEC_PROMPT)
              }
            }}
            className="nb-link text-xs"
          >
            重設為預設
          </button>
        </div>
        <textarea
          id="spec-prompt"
          value={specPrompt}
          onChange={(e) => setSpecPrompt(e.target.value)}
          rows={14}
          className="nb-textarea mt-2 block w-full bg-[var(--nb-bg)] px-3 py-2 font-mono text-xs leading-relaxed focus:bg-white"
          spellCheck={false}
        />
      </div>

      <div className="mt-4 flex items-center justify-end gap-3">
        {dirty && (
          <span className="nb-badge bg-[var(--nb-amber)] px-2 py-0.5 text-xs">尚未儲存</span>
        )}
        <button
          type="button"
          disabled={saving}
          onClick={() => void save()}
          className="nb-btn nb-btn-primary px-4 py-2 text-sm"
        >
          {saving ? '儲存中…' : '儲存全域設定'}
        </button>
      </div>
      {flash && (
        <p
          className={`nb-frame mt-3 p-3 text-sm font-bold ${
            flash.kind === 'ok'
              ? 'bg-[var(--nb-green-soft)]'
              : 'bg-[var(--nb-red-soft)]'
          }`}
        >
          {flash.kind === 'ok' ? '✓ ' : '⚠ '}
          {flash.text}
        </p>
      )}
    </section>
  )
}

function ModelField({
  providerId,
  apiKey,
  value,
  onChange,
}: {
  providerId: ProviderId
  apiKey: string
  value: string
  onChange: (v: string) => void
}) {
  const meta = PROVIDERS[providerId]
  const [cache, setCache] = useState(() => loadCachedModels(providerId))
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const mergedModels = useMemo(() => {
    const set = new Set<string>()
    meta.defaultModels.forEach((m) => set.add(m.value))
    cache.models.forEach((m) => set.add(m))
    if (value) set.add(value)
    return Array.from(set).sort()
  }, [meta, cache.models, value])

  const loadLatest = async () => {
    setLoading(true)
    setError(null)
    try {
      const models = await fetchModels(providerId, apiKey)
      saveCachedModels(providerId, models)
      setCache({ models, fetchedAt: Date.now() })
    } catch (err) {
      setError(err instanceof Error ? err.message : '載入失敗')
    } finally {
      setLoading(false)
    }
  }

  const datalistId = `models-${providerId}`
  const fresh = isCacheFresh(cache.fetchedAt)

  return (
    <div>
      <div className="flex items-baseline justify-between">
        <label htmlFor={`model-${providerId}`} className="text-sm font-bold">
          模型
        </label>
        <button
          type="button"
          onClick={loadLatest}
          disabled={loading || !apiKey.trim()}
          title={!apiKey.trim() ? '需要個人 API Key 才能抓模型清單(也可直接輸入模型 ID)' : undefined}
          className="nb-link text-xs disabled:cursor-not-allowed disabled:text-neutral-400 disabled:no-underline disabled:hover:bg-transparent"
        >
          {loading ? '載入中…' : '🔄 載入最新'}
        </button>
      </div>

      <input
        id={`model-${providerId}`}
        type="text"
        list={datalistId}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="nb-input mt-2 block w-full px-3 py-2 font-mono text-sm"
        placeholder={meta.defaultModel}
      />
      <datalist id={datalistId}>
        {mergedModels.map((m) => (
          <option key={m} value={m} />
        ))}
      </datalist>

      <div className="mt-3">
        <div className="text-xs font-bold text-neutral-600">推薦預設</div>
        <div className="mt-1.5 flex flex-wrap gap-2">
          {meta.defaultModels.map((m) => {
            const selected = m.value === value
            return (
              <button
                key={m.value}
                type="button"
                onClick={() => onChange(m.value)}
                className={`nb-frame px-2.5 py-1 text-xs font-medium transition ${
                  selected
                    ? 'bg-[var(--nb-yellow)] shadow-[2px_2px_0_0_#111]'
                    : 'bg-white hover:bg-[var(--nb-bg)]'
                }`}
                title={m.hint}
              >
                {m.value}
              </button>
            )
          })}
        </div>
      </div>

      {cache.models.length > 0 && (
        <details className="nb-frame mt-3 bg-[var(--nb-bg)]">
          <summary className="cursor-pointer select-none px-3 py-2 text-xs font-bold">
            已載入 <b>{cache.models.length}</b> 個模型
            <span className="ml-2 font-medium text-neutral-500">
              ({fresh ? '24 小時內' : '已過期,建議重新載入'})
            </span>
          </summary>
          <div className="max-h-56 overflow-y-auto border-t-2 border-black bg-white px-3 py-2">
            <div className="flex flex-wrap gap-1">
              {cache.models.map((m) => {
                const selected = m === value
                return (
                  <button
                    key={m}
                    type="button"
                    onClick={() => onChange(m)}
                    className={`nb-frame px-2 py-0.5 font-mono text-[11px] transition ${
                      selected
                        ? 'bg-[var(--nb-yellow)]'
                        : 'bg-white hover:bg-[var(--nb-bg)]'
                    }`}
                  >
                    {m}
                  </button>
                )
              })}
            </div>
          </div>
        </details>
      )}

      {error && (
        <p className="nb-frame mt-2 bg-[var(--nb-red-soft)] px-2 py-1.5 text-xs font-medium">
          ⚠️ {error}
        </p>
      )}
    </div>
  )
}
