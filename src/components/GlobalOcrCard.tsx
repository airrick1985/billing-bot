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
    <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
      <div className="flex items-baseline justify-between">
        <div>
          <h2 className="text-lg font-semibold text-slate-900">全域 OCR 設定</h2>
          <p className="mt-1 text-sm text-slate-600">
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
            className={`rounded-lg px-3 py-1.5 text-sm font-medium transition ${
              id === provider
                ? 'bg-indigo-600 text-white shadow-sm'
                : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
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
          <label htmlFor="spec-prompt" className="text-sm font-medium text-slate-800">
            SPEC Prompt
          </label>
          <button
            type="button"
            onClick={() => {
              if (confirm('把 SPEC Prompt 重設為系統預設?當前內容會被覆蓋。')) {
                setSpecPrompt(DEFAULT_SPEC_PROMPT)
              }
            }}
            className="text-xs text-slate-500 hover:text-slate-800 hover:underline"
          >
            重設為預設
          </button>
        </div>
        <textarea
          id="spec-prompt"
          value={specPrompt}
          onChange={(e) => setSpecPrompt(e.target.value)}
          rows={14}
          className="mt-2 block w-full rounded-lg border border-slate-300 bg-slate-50 px-3 py-2 font-mono text-xs leading-relaxed text-slate-900 shadow-inner focus:border-indigo-500 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-200"
          spellCheck={false}
        />
      </div>

      <div className="mt-4 flex items-center justify-end gap-3">
        {dirty && <span className="text-xs text-amber-600">尚未儲存</span>}
        <button
          type="button"
          disabled={saving}
          onClick={() => void save()}
          className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-indigo-700 disabled:opacity-40"
        >
          {saving ? '儲存中…' : '儲存全域設定'}
        </button>
      </div>
      {flash && (
        <p
          className={`mt-3 rounded-lg p-3 text-sm ring-1 ${
            flash.kind === 'ok'
              ? 'bg-emerald-50 text-emerald-800 ring-emerald-200'
              : 'bg-rose-50 text-rose-800 ring-rose-200'
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
        <label htmlFor={`model-${providerId}`} className="text-sm font-medium text-slate-800">
          模型
        </label>
        <button
          type="button"
          onClick={loadLatest}
          disabled={loading || !apiKey.trim()}
          title={!apiKey.trim() ? '需要個人 API Key 才能抓模型清單(也可直接輸入模型 ID)' : undefined}
          className="text-xs text-indigo-600 hover:underline disabled:cursor-not-allowed disabled:text-slate-400 disabled:no-underline"
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
        className="mt-2 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 font-mono text-sm text-slate-900 shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-200"
        placeholder={meta.defaultModel}
      />
      <datalist id={datalistId}>
        {mergedModels.map((m) => (
          <option key={m} value={m} />
        ))}
      </datalist>

      <div className="mt-3">
        <div className="text-xs font-medium text-slate-500">推薦預設</div>
        <div className="mt-1.5 flex flex-wrap gap-2">
          {meta.defaultModels.map((m) => {
            const selected = m.value === value
            return (
              <button
                key={m.value}
                type="button"
                onClick={() => onChange(m.value)}
                className={`rounded-full border px-2.5 py-1 text-xs transition ${
                  selected
                    ? 'border-indigo-300 bg-indigo-100 text-indigo-700'
                    : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
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
        <details className="mt-3 rounded-lg border border-slate-200 bg-slate-50">
          <summary className="cursor-pointer select-none px-3 py-2 text-xs text-slate-700 marker:text-slate-400">
            已載入 <b>{cache.models.length}</b> 個模型
            <span className="ml-2 text-slate-400">
              ({fresh ? '24 小時內' : '已過期,建議重新載入'})
            </span>
          </summary>
          <div className="max-h-56 overflow-y-auto border-t border-slate-200 px-3 py-2">
            <div className="flex flex-wrap gap-1">
              {cache.models.map((m) => {
                const selected = m === value
                return (
                  <button
                    key={m}
                    type="button"
                    onClick={() => onChange(m)}
                    className={`rounded border px-2 py-0.5 font-mono text-[11px] transition ${
                      selected
                        ? 'border-indigo-300 bg-indigo-100 text-indigo-700'
                        : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-100'
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
        <p className="mt-2 rounded-md border border-rose-200 bg-rose-50 px-2 py-1.5 text-xs text-rose-700">
          ⚠️ {error}
        </p>
      )}
    </div>
  )
}
