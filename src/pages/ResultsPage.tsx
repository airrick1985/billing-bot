import { useMemo, useRef, useState } from 'react'
import { useSettings } from '../hooks/useSettings'
import { PROVIDERS } from '../lib/providers'
import { runOcrForVendor, type OcrResult } from '../lib/runOcr'
import type { Invoice } from '../lib/ocrSchema'
import type { ParsedUpload, VendorGroup } from '../lib/upload'
import { isDuplicateWarning, validateInvoice, type FieldWarning } from '../lib/validation'
import {
  analyzeMerge,
  executeMerge,
  exportToExcel,
  type MergeChoices,
  type MergePlan,
} from '../lib/exportExcel'
import type * as XLSX from 'xlsx'
import MergeDialog from '../components/MergeDialog'

const CONCURRENCY = 3

type Props = {
  parsed: ParsedUpload | null
  results: OcrResult[]
  setResults: (r: OcrResult[]) => void
}

export default function ResultsPage({ parsed, results, setResults }: Props) {
  const { settings } = useSettings()
  const [running, setRunning] = useState(false)
  const [progress, setProgress] = useState({ done: 0, total: 0 })
  const abortRef = useRef<AbortController | null>(null)
  const mergeInputRef = useRef<HTMLInputElement>(null)
  const [mergeState, setMergeState] = useState<
    { plan: MergePlan; workbook: XLSX.WorkBook } | null
  >(null)
  const [mergeMessage, setMergeMessage] = useState<string | null>(null)
  const [mergeError, setMergeError] = useState<string | null>(null)

  const activeMeta = PROVIDERS[settings.activeProvider]
  const activeConfig = settings.providers[settings.activeProvider]
  const hasKey = activeConfig.apiKey.trim() !== ''
  const hasModel = activeConfig.model.trim() !== ''
  const canRun = !!parsed && parsed.vendors.length > 0 && hasKey && hasModel

  const resultByFolder = useMemo(() => {
    const map = new Map<string, OcrResult>()
    for (const r of results) map.set(r.vendor.folderName, r)
    return map
  }, [results])

  const invoiceNoCounts = useMemo(() => {
    const counts = new Map<string, number>()
    for (const r of results) {
      if (r.status !== 'success') continue
      const no = r.invoice.invoice_no.trim()
      if (!no) continue
      counts.set(no, (counts.get(no) ?? 0) + 1)
    }
    return counts
  }, [results])

  const successCount = results.filter((r) => r.status === 'success').length
  const errorCount = results.filter((r) => r.status === 'error').length

  if (!parsed || parsed.vendors.length === 0) {
    return (
      <section className="rounded-2xl border border-dashed border-slate-300 bg-white p-12 text-center">
        <p className="text-slate-500">請先到 Step ② 上傳資料夾。</p>
      </section>
    )
  }

  const runAll = async () => {
    if (!canRun) return
    const abort = new AbortController()
    abortRef.current = abort
    setRunning(true)
    setResults([])
    setProgress({ done: 0, total: parsed.vendors.length })

    const acc: OcrResult[] = []
    for (let i = 0; i < parsed.vendors.length; i += CONCURRENCY) {
      if (abort.signal.aborted) break
      const batch = parsed.vendors.slice(i, i + CONCURRENCY)
      const batchResults = await Promise.all(
        batch.map((v) => runOcrForVendor(v, settings, abort.signal)),
      )
      acc.push(...batchResults)
      setResults([...acc])
      setProgress({ done: acc.length, total: parsed.vendors.length })
    }
    setRunning(false)
    abortRef.current = null
  }

  const cancel = () => {
    abortRef.current?.abort()
    setRunning(false)
  }

  const retryOne = async (vendor: VendorGroup) => {
    const result = await runOcrForVendor(vendor, settings)
    const next = results.map((r) => (r.vendor.folderName === vendor.folderName ? result : r))
    setResults(next)
  }

  const updateInvoiceField = <K extends keyof Invoice>(
    folderName: string,
    field: K,
    value: Invoice[K],
  ) => {
    const next = results.map((r) => {
      if (r.vendor.folderName !== folderName) return r
      if (r.status !== 'success') return r
      return { ...r, invoice: { ...r.invoice, [field]: value } }
    })
    setResults(next)
  }

  const onPickMergeFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (e.target) e.target.value = ''
    if (!file || !parsed) return
    setMergeError(null)
    setMergeMessage(null)
    try {
      const { plan, workbook } = await analyzeMerge(file, parsed, results, settings.projectName)
      if (!plan.monthSheetExists && plan.duplicates.length === 0) {
        const r = executeMerge(workbook, plan, { duplicateAction: 'skip', monthAction: 'merge' }, settings.projectName)
        setMergeMessage(
          `已寫入 ${plan.filename}:總表 +${r.summaryAdded} 列,${plan.monthSheetName} 新建 +${r.monthAdded} 列`,
        )
        return
      }
      setMergeState({ plan, workbook })
    } catch (err) {
      setMergeError(err instanceof Error ? err.message : '讀取 Excel 失敗')
    }
  }

  const confirmMerge = (choices: MergeChoices) => {
    if (!mergeState) return
    try {
      const r = executeMerge(mergeState.workbook, mergeState.plan, choices, settings.projectName)
      const bits = [
        `總表 +${r.summaryAdded}`,
        r.summaryReplaced > 0 && `覆蓋 ${r.summaryReplaced}`,
        r.summarySkipped > 0 && `跳過 ${r.summarySkipped}`,
        `${mergeState.plan.monthSheetName} ${r.monthAction === 'overwritten' ? '覆蓋' : r.monthAction === 'merged' ? '合併' : '新建'} +${r.monthAdded}`,
        r.monthSkipped > 0 && `跳過 ${r.monthSkipped}`,
      ].filter(Boolean)
      setMergeMessage(`已寫入 ${mergeState.plan.filename}:${bits.join('、')}`)
    } catch (err) {
      setMergeError(err instanceof Error ? err.message : '寫入失敗')
    } finally {
      setMergeState(null)
    }
  }

  const duplicateCount = useMemo(() => {
    let n = 0
    for (const count of invoiceNoCounts.values()) {
      if (count > 1) n += count
    }
    return n
  }, [invoiceNoCounts])

  return (
    <section className="space-y-4">
      <header className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h2 className="text-xl font-semibold text-slate-900">③ 彙整</h2>
            <p className="mt-1 text-sm text-slate-600">
              將把 {parsed.vendors.length} 筆廠商送去 <b>{activeMeta.displayName}</b>
              (<code className="rounded bg-slate-100 px-1 text-xs">{activeConfig.model || '未設定'}</code>)辨識。
              結果可直接在下方編輯。
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {!running && results.length > 0 && (
              <>
                <button
                  type="button"
                  onClick={() => exportToExcel(parsed, results, settings.projectName)}
                  disabled={successCount === 0}
                  className="rounded-lg border border-emerald-300 bg-emerald-50 px-4 py-2 text-sm font-medium text-emerald-800 shadow-sm hover:bg-emerald-100 disabled:cursor-not-allowed disabled:opacity-40"
                  title={successCount === 0 ? '尚無成功辨識的資料' : '下載新檔 .xlsx'}
                >
                  下載新檔
                </button>
                <button
                  type="button"
                  onClick={() => mergeInputRef.current?.click()}
                  disabled={successCount === 0}
                  className="rounded-lg border border-indigo-300 bg-white px-4 py-2 text-sm font-medium text-indigo-700 shadow-sm hover:bg-indigo-50 disabled:cursor-not-allowed disabled:opacity-40"
                  title={successCount === 0 ? '尚無成功辨識的資料' : '附加到既有的 .xlsx'}
                >
                  附加到既有檔…
                </button>
                <input
                  ref={mergeInputRef}
                  type="file"
                  accept=".xlsx"
                  hidden
                  onChange={onPickMergeFile}
                />
              </>
            )}
            {running ? (
              <button
                type="button"
                onClick={cancel}
                className="rounded-lg border border-rose-300 bg-white px-4 py-2 text-sm font-medium text-rose-700 shadow-sm hover:bg-rose-50"
              >
                取消
              </button>
            ) : (
              <button
                type="button"
                onClick={runAll}
                disabled={!canRun}
                className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-40"
                title={!hasKey ? '請先到設定頁輸入 API Key' : !hasModel ? '請先選擇模型' : undefined}
              >
                {results.length > 0 ? '重新辨識全部' : '開始辨識'}
              </button>
            )}
          </div>
        </div>

        {!hasKey && (
          <p className="mt-3 rounded-lg bg-amber-50 p-3 text-sm text-amber-800 ring-1 ring-amber-200">
            ⚠️ 目前使用中的 Provider(<b>{activeMeta.displayName}</b>)尚未輸入 API Key。請到 Step ① 設定。
          </p>
        )}

        {running && (
          <div className="mt-4">
            <div className="flex items-center justify-between text-xs text-slate-600">
              <span>
                辨識中:{progress.done} / {progress.total}
              </span>
              <span>同時 {CONCURRENCY} 筆</span>
            </div>
            <div className="mt-1 h-2 w-full overflow-hidden rounded-full bg-slate-100">
              <div
                className="h-full bg-indigo-500 transition-all"
                style={{
                  width: `${progress.total ? (progress.done / progress.total) * 100 : 0}%`,
                }}
              />
            </div>
          </div>
        )}

        {mergeMessage && (
          <div className="mt-3 flex items-start justify-between gap-3 rounded-lg bg-emerald-50 p-3 text-sm text-emerald-800 ring-1 ring-emerald-200">
            <span>✓ {mergeMessage}</span>
            <button
              type="button"
              onClick={() => setMergeMessage(null)}
              className="text-emerald-600 hover:text-emerald-900"
            >
              ✕
            </button>
          </div>
        )}
        {mergeError && (
          <div className="mt-3 flex items-start justify-between gap-3 rounded-lg bg-rose-50 p-3 text-sm text-rose-800 ring-1 ring-rose-200">
            <span>⚠ {mergeError}</span>
            <button
              type="button"
              onClick={() => setMergeError(null)}
              className="text-rose-600 hover:text-rose-900"
            >
              ✕
            </button>
          </div>
        )}

        {results.length > 0 && !running && (
          <div className="mt-3 flex flex-wrap gap-2 text-xs">
            <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-emerald-700 ring-1 ring-emerald-200">
              ✓ 成功 {successCount}
            </span>
            {errorCount > 0 && (
              <span className="rounded-full bg-rose-50 px-2.5 py-1 text-rose-700 ring-1 ring-rose-200">
                ✗ 失敗 {errorCount}
              </span>
            )}
            {duplicateCount > 0 && (
              <span className="rounded-full bg-rose-50 px-2.5 py-1 text-rose-700 ring-1 ring-rose-200">
                ⚠ 發票號重複 {duplicateCount}
              </span>
            )}
          </div>
        )}
      </header>

      {mergeState && (
        <MergeDialog
          plan={mergeState.plan}
          onConfirm={confirmMerge}
          onCancel={() => setMergeState(null)}
        />
      )}

      <div className="space-y-3">
        {parsed.vendors.map((v) => {
          const result = resultByFolder.get(v.folderName)
          const isDup = !!(
            result?.status === 'success' &&
            (invoiceNoCounts.get(result.invoice.invoice_no.trim()) ?? 0) > 1
          )
          return (
            <VendorResultCard
              key={v.folderName}
              vendor={v}
              result={result}
              isDuplicate={isDup}
              onRetry={() => retryOne(v)}
              onUpdate={(field, value) => updateInvoiceField(v.folderName, field, value)}
            />
          )
        })}
      </div>
    </section>
  )
}

function VendorResultCard({
  vendor,
  result,
  isDuplicate,
  onRetry,
  onUpdate,
}: {
  vendor: VendorGroup
  result: OcrResult | undefined
  isDuplicate: boolean
  onRetry: () => void
  onUpdate: <K extends keyof Invoice>(field: K, value: Invoice[K]) => void
}) {
  const displayName =
    vendor.index > 1 ? `${vendor.displayName}(第 ${vendor.index} 筆)` : vendor.displayName

  if (!result) {
    return (
      <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex items-center justify-between">
          <span className="text-sm font-semibold text-slate-900">{displayName}</span>
          <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-500">待辨識</span>
        </div>
      </div>
    )
  }

  if (result.status === 'error') {
    return (
      <div className="rounded-xl border border-rose-200 bg-rose-50/40 p-4 shadow-sm">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="text-sm font-semibold text-slate-900">{displayName}</span>
              <span className="rounded-full bg-rose-100 px-2 py-0.5 text-xs font-medium text-rose-700">
                失敗
              </span>
            </div>
            <p className="mt-1 break-words text-xs text-rose-700">{result.error}</p>
          </div>
          <button
            type="button"
            onClick={onRetry}
            className="shrink-0 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 shadow-sm hover:bg-slate-50"
          >
            重試
          </button>
        </div>
      </div>
    )
  }

  return (
    <SuccessCard
      vendor={vendor}
      displayName={displayName}
      invoice={result.invoice}
      isDuplicate={isDuplicate}
      onRetry={onRetry}
      onUpdate={onUpdate}
    />
  )
}

function splitWarnings(warnings: FieldWarning[]) {
  const byField = new Map<keyof Invoice, string>()
  let missingInvoice = ''
  let missingQuote = ''
  for (const w of warnings) {
    if (w.field === 'missing_invoice') missingInvoice = w.message
    else if (w.field === 'missing_quote') missingQuote = w.message
    else if (!byField.has(w.field)) byField.set(w.field, w.message)
  }
  return { byField, missingInvoice, missingQuote }
}

function SuccessCard({
  vendor,
  displayName,
  invoice,
  isDuplicate,
  onRetry,
  onUpdate,
}: {
  vendor: VendorGroup
  displayName: string
  invoice: Invoice
  isDuplicate: boolean
  onRetry: () => void
  onUpdate: <K extends keyof Invoice>(field: K, value: Invoice[K]) => void
}) {
  const warnings = validateInvoice(invoice, vendor, isDuplicate)
  const { byField, missingInvoice, missingQuote } = splitWarnings(warnings)
  const hasDup = warnings.some(isDuplicateWarning)
  const totalIssues = warnings.length

  const frameCls = hasDup
    ? 'border-rose-300 bg-rose-50/40'
    : totalIssues > 0
      ? 'border-amber-200 bg-amber-50/30'
      : 'border-emerald-200 bg-emerald-50/30'

  const badge = hasDup ? (
    <span className="rounded-full bg-rose-100 px-2 py-0.5 text-xs font-medium text-rose-700">
      重複發票
    </span>
  ) : totalIssues > 0 ? (
    <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800">
      {totalIssues} 項需檢查
    </span>
  ) : (
    <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-700">
      通過
    </span>
  )

  const parseIntSafe = (v: string): number => {
    const cleaned = v.replace(/[^\d-]/g, '')
    if (cleaned === '' || cleaned === '-') return 0
    const n = parseInt(cleaned, 10)
    return Number.isFinite(n) ? n : 0
  }

  return (
    <div className={`rounded-xl border p-4 shadow-sm ${frameCls}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-semibold text-slate-900">{displayName}</span>
            {badge}
          </div>
          <p className="mt-0.5 text-xs text-slate-400">{vendor.folderName}</p>
        </div>
        <button
          type="button"
          onClick={onRetry}
          className="shrink-0 rounded-lg border border-slate-200 bg-white px-3 py-1 text-xs font-medium text-slate-600 shadow-sm hover:bg-slate-50"
        >
          重新辨識
        </button>
      </div>

      <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
        <EditField
          label="發票日期"
          value={invoice.invoice_date}
          onChange={(v) => onUpdate('invoice_date', v)}
          warning={byField.get('invoice_date')}
          placeholder="YYYY/MM/DD"
        />
        <EditField
          label="發票號碼"
          value={invoice.invoice_no}
          onChange={(v) => onUpdate('invoice_no', v.toUpperCase())}
          warning={byField.get('invoice_no')}
          mono
          placeholder="AB12345678"
        />
        <EditField
          label="含稅金額"
          value={String(invoice.amount_with_tax)}
          onChange={(v) => onUpdate('amount_with_tax', parseIntSafe(v))}
          warning={byField.get('amount_with_tax')}
          numeric
        />
        <EditField
          label="報價金額"
          value={String(invoice.quoted_amount)}
          onChange={(v) => onUpdate('quoted_amount', parseIntSafe(v))}
          warning={byField.get('quoted_amount')}
          numeric
        />
        <EditField
          label="賣方公司"
          value={invoice.vendor_name}
          onChange={(v) => onUpdate('vendor_name', v)}
          warning={byField.get('vendor_name')}
        />
        <EditField
          label="賣方統編"
          value={invoice.vendor_tax_id}
          onChange={(v) => onUpdate('vendor_tax_id', v)}
          warning={byField.get('vendor_tax_id')}
          mono
          placeholder="8 碼"
        />
      </div>

      <div className="mt-3">
        <EditField
          label="請款內容"
          value={invoice.billing_content}
          onChange={(v) => onUpdate('billing_content', v)}
          warning={byField.get('billing_content')}
        />
      </div>

      <div className="mt-3">
        <EditField
          label="備註"
          value={invoice.notes}
          onChange={(v) => onUpdate('notes', v)}
          warning={byField.get('notes')}
          placeholder="(無)"
        />
      </div>

      {(missingInvoice || missingQuote) && (
        <div className="mt-3 rounded-md border border-amber-200 bg-amber-50 px-2.5 py-1.5 text-xs text-amber-800">
          ⚠️ {[missingInvoice, missingQuote].filter(Boolean).join(';')}
        </div>
      )}
    </div>
  )
}

function EditField({
  label,
  value,
  onChange,
  warning,
  mono,
  numeric,
  placeholder,
}: {
  label: string
  value: string
  onChange: (v: string) => void
  warning?: string
  mono?: boolean
  numeric?: boolean
  placeholder?: string
}) {
  return (
    <div>
      <label className="block text-[10px] uppercase tracking-wide text-slate-500">
        {label}
      </label>
      <input
        type="text"
        inputMode={numeric ? 'numeric' : undefined}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className={`mt-0.5 w-full rounded border px-2 py-1 text-sm shadow-sm transition focus:outline-none focus:ring-1 ${
          warning
            ? 'border-rose-300 bg-rose-50 text-rose-900 focus:border-rose-400 focus:ring-rose-200'
            : 'border-slate-200 bg-white text-slate-900 focus:border-indigo-400 focus:ring-indigo-200'
        } ${mono ? 'font-mono' : ''}`}
      />
      {warning && (
        <p className="mt-0.5 text-[10px] leading-snug text-rose-700">⚠️ {warning}</p>
      )}
    </div>
  )
}
