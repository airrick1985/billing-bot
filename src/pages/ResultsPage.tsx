import { useMemo, useRef, useState } from 'react'
import { useAuth } from '../hooks/useAuth'
import { useSettings } from '../hooks/useSettings'
import { effectiveOcr } from '../lib/effectiveOcr'
import { PROVIDERS } from '../lib/providers'
import { runOcrForVendor, type OcrResult } from '../lib/runOcr'
import type { Invoice } from '../lib/ocrSchema'
import type { ParsedUpload, VendorGroup } from '../lib/upload'
import { isDuplicateWarning, validateInvoice, type FieldWarning } from '../lib/validation'
import {
  analyzeMerge,
  buildNewRows,
  executeMerge,
  exportToExcel,
  periodLabel,
  type MergeChoices,
  type MergePlan,
} from '../lib/exportExcel'
import {
  appendAuditLog,
  appendBillingRows,
  readExistingInvoiceNos,
} from '../lib/google/billingSheet'
import { createFolder } from '../lib/google/drive'
import { spreadsheetUrl } from '../lib/google/sheets'
import { isProxyEnabled } from '../lib/ocrProxy'
import { archiveVendorPhotos } from '../lib/photoArchive'
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
  const { activeProject, updateProjectDriveFolder, user, ocrConfig } = useAuth()
  // 建案名稱以切換中的建案為準;尚未設定建案時退回設定頁的名稱
  const projectName = activeProject?.name || settings.projectName
  const ocrTarget = effectiveOcr(settings, ocrConfig)
  const [running, setRunning] = useState(false)
  const [progress, setProgress] = useState({ done: 0, total: 0 })
  const abortRef = useRef<AbortController | null>(null)
  const mergeInputRef = useRef<HTMLInputElement>(null)
  const [mergeState, setMergeState] = useState<
    { plan: MergePlan; workbook: XLSX.WorkBook } | null
  >(null)
  const [mergeMessage, setMergeMessage] = useState<string | null>(null)
  const [mergeError, setMergeError] = useState<string | null>(null)
  const [writing, setWriting] = useState(false)
  const [writeDone, setWriteDone] = useState(false)

  // 結果變動(重跑或編輯)後解除「已寫入」狀態
  const [prevResults, setPrevResults] = useState(results)
  if (results !== prevResults) {
    setPrevResults(results)
    setWriteDone(false)
  }

  const activeMeta = PROVIDERS[ocrTarget.provider]
  const hasKey = isProxyEnabled() || settings.providers[ocrTarget.provider].apiKey.trim() !== ''
  const hasModel = ocrTarget.model.trim() !== ''
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

  const duplicateCount = useMemo(() => {
    let n = 0
    for (const count of invoiceNoCounts.values()) {
      if (count > 1) n += count
    }
    return n
  }, [invoiceNoCounts])

  if (!parsed || parsed.vendors.length === 0) {
    return (
      <section className="nb-card border-dashed p-12 text-center">
        <p className="font-bold text-neutral-500">請先到 Step ① 建立請款批次。</p>
      </section>
    )
  }

  const writeToSheet = async () => {
    if (!parsed || !activeProject?.sheetId) return
    setWriting(true)
    setMergeError(null)
    setMergeMessage(null)
    try {
      if (writeDone) {
        const again = window.confirm('這批資料剛剛已寫入過 Google Sheet,確定要再寫入一次嗎?')
        if (!again) return
      }
      const okResults = results.filter(
        (r): r is Extract<OcrResult, { status: 'success' }> => r.status === 'success',
      )
      const failedCount = results.length - okResults.length
      const rows = buildNewRows(parsed, okResults, projectName)
      // rows[i] 對應 okResults[i],配對以便照片歸檔只處理實際寫入的筆
      let pairs = okResults.map((result, i) => ({ result, row: rows[i] }))

      // 跨月查重:比對總表既有發票號碼
      const existing = await readExistingInvoiceNos(activeProject.sheetId)
      const dupPairs = pairs.filter((p) => {
        const no = String(p.row[3] ?? '').trim()
        return no !== '' && existing.has(no)
      })
      if (dupPairs.length > 0) {
        const list = dupPairs.map((p) => `${p.row[5]}(${p.row[3]})`).join('、')
        const skip = window.confirm(
          `總表已存在 ${dupPairs.length} 筆相同發票號:${list}\n\n按「確定」跳過這些列,只寫入其餘 ${pairs.length - dupPairs.length} 筆;按「取消」中止寫入。`,
        )
        if (!skip) return
        const dupSet = new Set(dupPairs)
        pairs = pairs.filter((p) => !dupSet.has(p))
      }
      if (pairs.length === 0) {
        setMergeError('沒有可寫入的資料(全部重複或辨識失敗)')
        return
      }

      const monthName = periodLabel(parsed.period)
      const res = await appendBillingRows(
        activeProject.sheetId,
        monthName,
        pairs.map((p) => p.row),
      )
      setWriteDone(true)

      // 照片歸檔到 Drive(失敗不影響已寫入的資料)
      let photoNote = ''
      try {
        let rootId = activeProject.driveFolderId
        if (!rootId) {
          rootId = await createFolder(`${activeProject.name}-請款照片`)
          await updateProjectDriveFolder(activeProject.name, rootId).catch(() => {
            // 回寫主檔失敗時照片仍上傳,下次會再建一個資料夾,由管理者手動整理
          })
        }
        let uploaded = 0
        const photoErrors: string[] = []
        for (const p of pairs) {
          const outcome = await archiveVendorPhotos(
            rootId,
            monthName,
            p.result.vendor,
            p.result.invoice,
          )
          uploaded += outcome.uploaded
          photoErrors.push(...outcome.errors)
        }
        photoNote =
          `照片歸檔 ${uploaded} 張` + (photoErrors.length > 0 ? `(失敗 ${photoErrors.length})` : '')
        if (photoErrors.length > 0) {
          setMergeError(`部分照片上傳失敗:${photoErrors.slice(0, 3).join(';')}`)
        }
      } catch (err) {
        photoNote = '照片歸檔失敗'
        setMergeError(
          `資料已寫入,但照片歸檔失敗:${err instanceof Error ? err.message : String(err)}`,
        )
      }

      const bits = [
        `總表 +${res.added} 列`,
        `${monthName}${res.monthSheetCreated ? '(新建分頁)' : ''} +${res.added} 列`,
        dupPairs.length > 0 && `跳過重複 ${dupPairs.length} 筆`,
        failedCount > 0 && `辨識失敗未寫入 ${failedCount} 筆`,
        photoNote,
      ].filter(Boolean)
      setMergeMessage(`已寫入 Google Sheet:${bits.join('、')}`)

      void appendAuditLog(activeProject.sheetId, {
        user: user?.email ?? '',
        action: '寫入請款批次',
        detail: `${monthName}:${bits.join('、')}`,
      })
    } catch (err) {
      setMergeError(err instanceof Error ? err.message : '寫入 Google Sheet 失敗')
    } finally {
      setWriting(false)
    }
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
        batch.map((v) => runOcrForVendor(v, settings, ocrConfig, abort.signal)),
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
    const result = await runOcrForVendor(vendor, settings, ocrConfig)
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
      const { plan, workbook } = await analyzeMerge(file, parsed, results, projectName)
      if (!plan.monthSheetExists && plan.duplicates.length === 0) {
        const r = executeMerge(workbook, plan, { duplicateAction: 'skip', monthAction: 'merge' }, projectName)
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
      const r = executeMerge(mergeState.workbook, mergeState.plan, choices, projectName)
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

  return (
    <section className="space-y-4">
      <header className="nb-card p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h2 className="text-xl font-extrabold">② 彙整寫入</h2>
            <p className="mt-1 text-sm text-neutral-600">
              將把 {parsed.vendors.length} 筆廠商送去 <b>{activeMeta.displayName}</b>
              (<code className="nb-frame bg-[var(--nb-bg)] px-1 text-xs">{ocrTarget.model || '未設定'}</code>)辨識。
              結果可直接在下方編輯。
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {!running && results.length > 0 && (
              <>
                <button
                  type="button"
                  onClick={() => void writeToSheet()}
                  disabled={successCount === 0 || writing || !activeProject?.sheetId}
                  className="nb-btn nb-btn-green px-4 py-2 text-sm"
                  title={
                    !activeProject?.sheetId
                      ? '此建案尚未設定 Google Sheet'
                      : successCount === 0
                        ? '尚無成功辨識的資料'
                        : `寫入「${activeProject.name}」的總表與月份分頁`
                  }
                >
                  {writing ? '寫入中…' : writeDone ? '✓ 已寫入(再寫一次)' : '寫入 Google Sheet'}
                </button>
                <button
                  type="button"
                  onClick={() => exportToExcel(parsed, results, projectName)}
                  disabled={successCount === 0}
                  className="nb-btn px-4 py-2 text-sm"
                  title={successCount === 0 ? '尚無成功辨識的資料' : '備援:下載 .xlsx'}
                >
                  下載 Excel
                </button>
                <button
                  type="button"
                  onClick={() => mergeInputRef.current?.click()}
                  disabled={successCount === 0}
                  className="nb-btn nb-btn-blue px-4 py-2 text-sm"
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
                className="nb-btn nb-btn-danger px-4 py-2 text-sm"
              >
                取消
              </button>
            ) : (
              <button
                type="button"
                onClick={runAll}
                disabled={!canRun}
                className="nb-btn nb-btn-primary px-4 py-2 text-sm"
                title={
                  !hasKey
                    ? '請先在頁面上方輸入個人 API Key'
                    : !hasModel
                      ? '請管理者到「管理後台 → 全域 OCR 設定」儲存模型'
                      : undefined
                }
              >
                {results.length > 0 ? '重新辨識全部' : '開始辨識'}
              </button>
            )}
          </div>
        </div>

        {!hasKey && (
          <p className="nb-frame mt-3 bg-[var(--nb-amber-soft)] p-3 text-sm font-medium">
            ⚠️ 尚未輸入 <b>{activeMeta.displayName}</b> 的個人 API
            Key,請展開頁面上方的「個人 API Key」欄位輸入。
          </p>
        )}

        {running && (
          <div className="mt-4">
            <div className="flex items-center justify-between text-xs font-bold">
              <span>
                辨識中:{progress.done} / {progress.total}
              </span>
              <span>同時 {CONCURRENCY} 筆</span>
            </div>
            <div className="nb-frame mt-1 h-4 w-full overflow-hidden bg-white">
              <div
                className="h-full bg-[var(--nb-yellow)] transition-all"
                style={{
                  width: `${progress.total ? (progress.done / progress.total) * 100 : 0}%`,
                }}
              />
            </div>
          </div>
        )}

        {mergeMessage && (
          <div className="nb-frame mt-3 flex items-start justify-between gap-3 bg-[var(--nb-green-soft)] p-3 text-sm font-medium">
            <span>
              ✓ {mergeMessage}
              {mergeMessage.includes('Google Sheet') && activeProject?.sheetId && (
                <>
                  {' '}
                  <a
                    href={spreadsheetUrl(activeProject.sheetId)}
                    target="_blank"
                    rel="noreferrer"
                    className="nb-link"
                  >
                    開啟試算表 ↗
                  </a>
                </>
              )}
            </span>
            <button
              type="button"
              onClick={() => setMergeMessage(null)}
              className="font-bold hover:text-neutral-600"
            >
              ✕
            </button>
          </div>
        )}
        {mergeError && (
          <div className="nb-frame mt-3 flex items-start justify-between gap-3 bg-[var(--nb-red-soft)] p-3 text-sm font-medium">
            <span>⚠ {mergeError}</span>
            <button
              type="button"
              onClick={() => setMergeError(null)}
              className="font-bold hover:text-neutral-600"
            >
              ✕
            </button>
          </div>
        )}

        {results.length > 0 && !running && (
          <div className="mt-3 flex flex-wrap gap-2 text-xs">
            <span className="nb-badge bg-[var(--nb-green)] px-2.5 py-1">
              ✓ 成功 {successCount}
            </span>
            {errorCount > 0 && (
              <span className="nb-badge bg-[var(--nb-red)] px-2.5 py-1">
                ✗ 失敗 {errorCount}
              </span>
            )}
            {duplicateCount > 0 && (
              <span className="nb-badge bg-[var(--nb-red-soft)] px-2.5 py-1">
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
      <div className="nb-card-sm p-4">
        <div className="flex items-center justify-between">
          <span className="text-sm font-bold">{displayName}</span>
          <span className="nb-badge bg-neutral-200 px-2 py-0.5 text-xs text-neutral-600">待辨識</span>
        </div>
      </div>
    )
  }

  if (result.status === 'error') {
    return (
      <div className="nb-card-sm bg-[var(--nb-red-soft)] p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="text-sm font-bold">{displayName}</span>
              <span className="nb-badge bg-[var(--nb-red)] px-2 py-0.5 text-xs">
                失敗
              </span>
            </div>
            <p className="mt-1 break-words text-xs font-medium">{result.error}</p>
          </div>
          <button
            type="button"
            onClick={onRetry}
            className="nb-btn shrink-0 px-3 py-1.5 text-xs"
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
  const referral = invoice.doc_type === 'referral_fee'

  const frameCls = hasDup
    ? 'bg-[var(--nb-red-soft)]'
    : totalIssues > 0
      ? 'bg-[var(--nb-amber-soft)]'
      : 'bg-[var(--nb-green-soft)]'

  const badge = hasDup ? (
    <span className="nb-badge bg-[var(--nb-red)] px-2 py-0.5 text-xs">
      重複發票
    </span>
  ) : totalIssues > 0 ? (
    <span className="nb-badge bg-[var(--nb-amber)] px-2 py-0.5 text-xs">
      {totalIssues} 項需檢查
    </span>
  ) : (
    <span className="nb-badge bg-[var(--nb-green)] px-2 py-0.5 text-xs">
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
    <div className={`nb-card-sm p-4 ${frameCls}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-bold">{displayName}</span>
            {referral && (
              <span className="nb-badge bg-[var(--nb-blue)] px-2 py-0.5 text-xs">
                介紹費
              </span>
            )}
            {badge}
          </div>
          <p className="mt-0.5 text-xs text-neutral-500">{vendor.folderName}</p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <select
            value={invoice.doc_type}
            onChange={(e) => onUpdate('doc_type', e.target.value as Invoice['doc_type'])}
            className="nb-select px-2 py-1 text-xs"
            title="單據類型"
          >
            <option value="invoice">一般發票</option>
            <option value="referral_fee">介紹費</option>
          </select>
          <button
            type="button"
            onClick={onRetry}
            className="nb-btn px-3 py-1 text-xs"
          >
            重新辨識
          </button>
        </div>
      </div>

      <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
        <EditField
          label={referral ? '單據日期' : '發票日期'}
          value={invoice.invoice_date}
          onChange={(v) => onUpdate('invoice_date', v)}
          warning={byField.get('invoice_date')}
          placeholder="YYYY/MM/DD"
        />
        {!referral && (
          <EditField
            label="發票號碼"
            value={invoice.invoice_no}
            onChange={(v) => onUpdate('invoice_no', v.toUpperCase())}
            warning={byField.get('invoice_no')}
            mono
            placeholder="AB12345678"
          />
        )}
        <EditField
          label={referral ? '介紹費總額(未扣稅)' : '含稅金額'}
          value={String(invoice.amount_with_tax)}
          onChange={(v) => onUpdate('amount_with_tax', parseIntSafe(v))}
          warning={byField.get('amount_with_tax')}
          numeric
        />
        {!referral && (
          <EditField
            label="報價金額"
            value={String(invoice.quoted_amount)}
            onChange={(v) => onUpdate('quoted_amount', parseIntSafe(v))}
            warning={byField.get('quoted_amount')}
            numeric
          />
        )}
        <EditField
          label={referral ? '介紹人' : '賣方公司'}
          value={invoice.vendor_name}
          onChange={(v) => onUpdate('vendor_name', v)}
          warning={byField.get('vendor_name')}
        />
        <EditField
          label="聯絡人"
          value={invoice.vendor_contact}
          onChange={(v) => onUpdate('vendor_contact', v)}
          warning={byField.get('vendor_contact')}
          placeholder="(無)"
        />
        <EditField
          label="連絡電話"
          value={invoice.vendor_phone}
          onChange={(v) => onUpdate('vendor_phone', v)}
          warning={byField.get('vendor_phone')}
          placeholder="(無)"
        />
        {referral ? (
          <>
            <EditField
              label="身分證字號"
              value={invoice.payee_id_number}
              onChange={(v) => onUpdate('payee_id_number', v.toUpperCase())}
              warning={byField.get('payee_id_number')}
              mono
              placeholder="A123456789"
            />
            <EditField
              label="代扣所得稅(10%)"
              value={String(invoice.withholding_tax)}
              onChange={(v) => onUpdate('withholding_tax', parseIntSafe(v))}
              warning={byField.get('withholding_tax')}
              numeric
            />
            <EditField
              label="健保補充保費(2.11%)"
              value={String(invoice.nhi_premium)}
              onChange={(v) => onUpdate('nhi_premium', parseIntSafe(v))}
              warning={byField.get('nhi_premium')}
              numeric
            />
            <EditField
              label="實領金額"
              value={String(invoice.net_amount)}
              onChange={(v) => onUpdate('net_amount', parseIntSafe(v))}
              warning={byField.get('net_amount')}
              numeric
            />
          </>
        ) : (
          <EditField
            label="賣方統編"
            value={invoice.vendor_tax_id}
            onChange={(v) => onUpdate('vendor_tax_id', v)}
            warning={byField.get('vendor_tax_id')}
            mono
            placeholder="8 碼"
          />
        )}
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
        <div className="nb-frame mt-3 bg-[var(--nb-amber)] px-2.5 py-1.5 text-xs font-medium">
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
      <label className="block text-[10px] font-bold uppercase tracking-wide text-neutral-600">
        {label}
      </label>
      <input
        type="text"
        inputMode={numeric ? 'numeric' : undefined}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className={`nb-input mt-0.5 w-full px-2 py-1 text-sm ${
          warning ? 'border-[var(--nb-red)] bg-[var(--nb-red-soft)]' : ''
        } ${mono ? 'font-mono' : ''}`}
      />
      {warning && (
        <p className="mt-0.5 text-[10px] font-bold leading-snug text-red-700">⚠️ {warning}</p>
      )}
    </div>
  )
}
