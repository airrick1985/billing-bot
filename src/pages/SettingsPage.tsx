import { useMemo, useState } from 'react'
import { useSettings } from '../hooks/useSettings'
import {
  PROVIDER_IDS,
  PROVIDERS,
  fetchModels,
  isCacheFresh,
  loadCachedModels,
  saveCachedModels,
  type ProviderId,
} from '../lib/providers'
import type { ProviderConfig } from '../lib/settings'

export default function SettingsPage() {
  const { settings, update, updateProvider, setActiveProvider, resetSpecPrompt } = useSettings()
  const [editing, setEditing] = useState<ProviderId>(settings.activeProvider)

  return (
    <section className="space-y-6">
      <header className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="text-xl font-semibold text-slate-900">① 設定</h2>
        <p className="mt-1 text-sm text-slate-600">
          所有設定只存在瀏覽器本機(localStorage),不會離開你的電腦。
        </p>
      </header>

      <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <label className="block">
          <span className="text-sm font-medium text-slate-800">建案名稱</span>
          <span className="ml-2 text-xs text-slate-400">Excel 的「建案名稱」欄</span>
          <input
            type="text"
            value={settings.projectName}
            onChange={(e) => update('projectName', e.target.value)}
            className="mt-2 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-200"
            placeholder="例:富宇學森"
          />
        </label>
      </div>

      <ProvidersCard
        activeProvider={settings.activeProvider}
        editing={editing}
        config={settings.providers[editing]}
        onEdit={setEditing}
        onUse={() => setActiveProvider(editing)}
        onUpdateKey={(v) => updateProvider(editing, { apiKey: v })}
        onUpdateModel={(v) => updateProvider(editing, { model: v })}
      />

      <SpecPromptCard
        value={settings.specPrompt}
        onChange={(v) => update('specPrompt', v)}
        onReset={resetSpecPrompt}
      />
    </section>
  )
}

function ProvidersCard(props: {
  activeProvider: ProviderId
  editing: ProviderId
  config: ProviderConfig
  onEdit: (id: ProviderId) => void
  onUse: () => void
  onUpdateKey: (v: string) => void
  onUpdateModel: (v: string) => void
}) {
  const meta = PROVIDERS[props.editing]
  const isActive = props.activeProvider === props.editing

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
      <div className="mb-4 flex items-baseline justify-between">
        <span className="text-sm font-medium text-slate-800">AI Provider</span>
        <span className="text-xs text-slate-400">
          目前使用中:
          <span className="ml-1 font-medium text-slate-700">
            {PROVIDERS[props.activeProvider].displayName}
          </span>
        </span>
      </div>

      <div className="flex flex-wrap gap-2">
        {PROVIDER_IDS.map((id) => {
          const isEditing = id === props.editing
          const isUsing = id === props.activeProvider
          return (
            <button
              key={id}
              type="button"
              onClick={() => props.onEdit(id)}
              className={`flex items-center gap-2 rounded-lg px-3 py-1.5 text-sm font-medium transition ${
                isEditing
                  ? 'bg-indigo-600 text-white shadow-sm'
                  : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
              }`}
            >
              {PROVIDERS[id].short}
              {isUsing && (
                <span
                  className={`rounded-full px-1.5 py-0.5 text-[10px] ${
                    isEditing ? 'bg-white/20 text-white' : 'bg-emerald-100 text-emerald-700'
                  }`}
                >
                  使用中
                </span>
              )}
            </button>
          )
        })}
      </div>

      <div className="mt-6 space-y-5">
        <ApiKeyField meta={meta} value={props.config.apiKey} onChange={props.onUpdateKey} />
        <ModelField
          key={props.editing}
          providerId={props.editing}
          apiKey={props.config.apiKey}
          value={props.config.model}
          onChange={props.onUpdateModel}
        />
        {!isActive && (
          <div className="flex items-center justify-between rounded-lg bg-slate-50 p-3">
            <span className="text-xs text-slate-600">
              目前在編輯 <b>{meta.displayName}</b>,但實際使用的是{' '}
              <b>{PROVIDERS[props.activeProvider].displayName}</b>。
            </span>
            <button
              type="button"
              onClick={props.onUse}
              className="rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-medium text-white shadow-sm hover:bg-indigo-700"
            >
              改用此 Provider
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

function ApiKeyField({
  meta,
  value,
  onChange,
}: {
  meta: (typeof PROVIDERS)[ProviderId]
  value: string
  onChange: (v: string) => void
}) {
  const [show, setShow] = useState(false)
  return (
    <label className="block">
      <div className="flex items-baseline justify-between">
        <span className="text-sm font-medium text-slate-800">{meta.displayName} API Key</span>
        <a
          href={meta.getKeyUrl}
          target="_blank"
          rel="noreferrer"
          className="text-xs text-indigo-600 hover:underline"
        >
          取得 Key ↗
        </a>
      </div>
      <div className="relative mt-2">
        <input
          type={show ? 'text' : 'password'}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={meta.keyPlaceholder}
          autoComplete="off"
          spellCheck={false}
          className="block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 pr-16 font-mono text-sm text-slate-900 shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-200"
        />
        <button
          type="button"
          onClick={() => setShow((v) => !v)}
          className="absolute inset-y-0 right-0 flex items-center px-3 text-xs font-medium text-slate-500 hover:text-slate-800"
        >
          {show ? '隱藏' : '顯示'}
        </button>
      </div>
    </label>
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

      {cache.models.length === 0 && (
        <p className="mt-2 text-xs text-slate-500">
          尚未載入過模型清單。按上方「🔄 載入最新」抓取,或直接在輸入框打入任何模型 ID。
        </p>
      )}
      {error && (
        <p className="mt-2 rounded-md border border-rose-200 bg-rose-50 px-2 py-1.5 text-xs text-rose-700">
          ⚠️ {error}
        </p>
      )}
    </div>
  )
}

function SpecPromptCard({
  value,
  onChange,
  onReset,
}: {
  value: string
  onChange: (v: string) => void
  onReset: () => void
}) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
      <div className="flex items-baseline justify-between">
        <label htmlFor="spec-prompt" className="text-sm font-medium text-slate-800">
          SPEC Prompt
        </label>
        <button
          type="button"
          onClick={() => {
            if (confirm('把 SPEC Prompt 重設為預設?當前內容會被覆蓋。')) {
              onReset()
            }
          }}
          className="text-xs text-slate-500 hover:text-slate-800 hover:underline"
        >
          重設為預設
        </button>
      </div>
      <textarea
        id="spec-prompt"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        rows={18}
        className="mt-2 block w-full rounded-lg border border-slate-300 bg-slate-50 px-3 py-2 font-mono text-xs leading-relaxed text-slate-900 shadow-inner focus:border-indigo-500 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-200"
        spellCheck={false}
      />
      <p className="mt-2 text-xs text-slate-500">
        Step ③「彙整」時丟給模型的系統指令,可依實際發票格式微調。
      </p>
    </div>
  )
}
