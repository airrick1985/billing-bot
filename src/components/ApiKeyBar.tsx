import { useState } from 'react'
import { useAuth } from '../hooks/useAuth'
import { useSettings } from '../hooks/useSettings'
import { effectiveOcr } from '../lib/effectiveOcr'
import { isProxyEnabled } from '../lib/ocrProxy'
import { PROVIDERS } from '../lib/providers'

/**
 * 個人 API Key 精簡列:只在「未啟用雲端 Proxy」時顯示。
 * Key 屬於個人,只存本機瀏覽器;Provider/模型由管理者的全域設定決定。
 */
export default function ApiKeyBar() {
  const { settings, updateProvider } = useSettings()
  const { ocrConfig } = useAuth()
  const [show, setShow] = useState(false)

  if (isProxyEnabled()) return null

  const target = effectiveOcr(settings, ocrConfig)
  const meta = PROVIDERS[target.provider]
  const value = settings.providers[target.provider].apiKey
  const missing = value.trim() === ''

  return (
    <details
      className={`rounded-xl border px-4 py-2.5 text-sm shadow-sm ${
        missing ? 'border-amber-300 bg-amber-50' : 'border-slate-200 bg-white'
      }`}
      open={missing || undefined}
    >
      <summary className="cursor-pointer select-none text-slate-700">
        {missing ? '⚠️ ' : '🔑 '}
        個人 {meta.displayName} API Key
        {missing ? (
          <span className="ml-1 font-medium text-amber-700">尚未設定,無法辨識</span>
        ) : (
          <span className="ml-1 text-xs text-slate-400">已設定(只存這台裝置)</span>
        )}
      </summary>
      <div className="mt-2 flex items-center gap-2 pb-1">
        <input
          type={show ? 'text' : 'password'}
          value={value}
          onChange={(e) => updateProvider(target.provider, { apiKey: e.target.value })}
          placeholder={meta.keyPlaceholder}
          autoComplete="off"
          spellCheck={false}
          className="min-w-0 flex-1 rounded-lg border border-slate-300 bg-white px-3 py-1.5 font-mono text-xs text-slate-900 shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-200"
        />
        <button
          type="button"
          onClick={() => setShow((v) => !v)}
          className="shrink-0 text-xs font-medium text-slate-500 hover:text-slate-800"
        >
          {show ? '隱藏' : '顯示'}
        </button>
        <a
          href={meta.getKeyUrl}
          target="_blank"
          rel="noreferrer"
          className="shrink-0 text-xs text-indigo-600 hover:underline"
        >
          取得 Key ↗
        </a>
      </div>
    </details>
  )
}
