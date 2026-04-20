import { useRef, useState } from 'react'
import {
  filesFromDataTransfer,
  formatFileSize,
  parseFileList,
  type ParsedUpload,
  type VendorGroup,
} from '../lib/upload'

type UploadPageProps = {
  parsed: ParsedUpload | null
  setParsed: (p: ParsedUpload | null) => void
}

export default function UploadPage({ parsed, setParsed }: UploadPageProps) {
  const [isDragging, setIsDragging] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const handleFiles = (files: File[]) => {
    setError(null)
    if (!files.length) {
      setError('沒有讀到任何檔案')
      return
    }
    const result = parseFileList(files)
    if (result.totalFiles === 0) {
      setError('沒有符合格式的檔案(支援 jpg / png / webp / heic / pdf)')
      return
    }
    if (result.vendors.length === 0) {
      setError('資料夾結構不對,應為 {請款期間}/{廠商名稱}/發票或報價單 兩層')
      return
    }
    setParsed(result)
  }

  const onPick = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files ? Array.from(e.target.files) : []
    handleFiles(files)
  }

  const onDrop = async (e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(false)
    try {
      const files = await filesFromDataTransfer(e.dataTransfer)
      handleFiles(files)
    } catch (err) {
      setError(err instanceof Error ? err.message : '讀取拖曳的檔案失敗')
    }
  }

  const clear = () => {
    setParsed(null)
    setError(null)
    if (inputRef.current) inputRef.current.value = ''
  }

  if (!parsed) {
    return (
      <section className="space-y-4">
        <header className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="text-xl font-semibold text-slate-900">② 上傳</h2>
          <p className="mt-1 text-sm text-slate-600">
            選一個請款月份的根資料夾(例:
            <code className="mx-1 rounded bg-slate-100 px-1.5 py-0.5 text-xs text-slate-700">
              2026年4月
            </code>
            ),其下每個子資料夾代表一筆廠商請款,裡面要有發票與報價單。
          </p>
        </header>

        <div
          onDragOver={(e) => {
            e.preventDefault()
            setIsDragging(true)
          }}
          onDragLeave={() => setIsDragging(false)}
          onDrop={onDrop}
          className={`rounded-2xl border-2 border-dashed p-12 text-center transition ${
            isDragging
              ? 'border-indigo-500 bg-indigo-50'
              : 'border-slate-300 bg-white hover:border-slate-400'
          }`}
        >
          <div className="mx-auto max-w-sm space-y-4">
            <div className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-indigo-100 text-2xl text-indigo-600">
              📁
            </div>
            <p className="text-sm font-medium text-slate-800">
              拖曳資料夾到這裡,或
            </p>
            <button
              type="button"
              onClick={() => inputRef.current?.click()}
              className="inline-flex items-center rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-indigo-700"
            >
              選擇資料夾
            </button>
            <p className="text-xs text-slate-400">
              支援格式:jpg / png / webp / heic / pdf。資料不會離開你的瀏覽器,除非你在下一步送去 Gemini OCR。
            </p>
          </div>
          <input
            ref={inputRef}
            type="file"
            hidden
            multiple
            /* @ts-expect-error non-standard but widely supported folder input */
            webkitdirectory=""
            onChange={onPick}
          />
        </div>

        {error && (
          <div className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">
            ⚠️ {error}
          </div>
        )}
      </section>
    )
  }

  return (
    <section className="space-y-4">
      <header className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-xl font-semibold text-slate-900">② 上傳</h2>
            <p className="mt-1 text-sm text-slate-600">已讀入檔案,確認下方廠商分組後進入下一步。</p>
          </div>
          <button
            type="button"
            onClick={clear}
            className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-600 shadow-sm transition hover:bg-slate-50"
          >
            清除重選
          </button>
        </div>
      </header>

      <SummaryCard parsed={parsed} />

      <div className="space-y-3">
        {parsed.vendors.map((v) => (
          <VendorCard key={v.folderName} vendor={v} />
        ))}
      </div>

      {parsed.skippedFiles > 0 && (
        <p className="text-center text-xs text-slate-400">
          已忽略 {parsed.skippedFiles} 個不支援格式的檔案
        </p>
      )}
    </section>
  )
}

function SummaryCard({ parsed }: { parsed: ParsedUpload }) {
  const { period, vendors, totalFiles } = parsed
  const periodLabel = period.year && period.month
    ? `${period.year} 年 ${period.month} 月`
    : period.raw
  const periodKnown = !!period.year

  const missingInvoice = vendors.filter((v) => !v.hasInvoice).length
  const missingQuote = vendors.filter((v) => !v.hasQuote).length

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
      <div className="grid gap-4 sm:grid-cols-3">
        <Stat
          label="請款期間"
          value={periodLabel}
          hint={periodKnown ? `原資料夾:${period.raw}` : '⚠️ 無法辨識月份格式,請手動確認'}
          warn={!periodKnown}
        />
        <Stat label="廠商數" value={`${vendors.length} 筆`} />
        <Stat label="檔案總數" value={`${totalFiles} 個`} />
      </div>

      {(missingInvoice > 0 || missingQuote > 0) && (
        <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
          ⚠️ 有 {missingInvoice} 筆缺發票、{missingQuote} 筆缺報價單,仍可送 OCR 但結果可能不完整。
        </div>
      )}
    </div>
  )
}

function Stat({
  label,
  value,
  hint,
  warn,
}: {
  label: string
  value: string
  hint?: string
  warn?: boolean
}) {
  return (
    <div>
      <div className="text-xs text-slate-500">{label}</div>
      <div className="mt-1 text-lg font-semibold text-slate-900">{value}</div>
      {hint && (
        <div className={`mt-1 text-xs ${warn ? 'text-amber-600' : 'text-slate-400'}`}>{hint}</div>
      )}
    </div>
  )
}

function VendorCard({ vendor }: { vendor: VendorGroup }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h3 className="truncate text-sm font-semibold text-slate-900">
              {vendor.displayName}
            </h3>
            {vendor.index > 1 && (
              <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600">
                第 {vendor.index} 筆
              </span>
            )}
          </div>
          <p className="mt-0.5 text-xs text-slate-400">{vendor.folderName}</p>
        </div>
        <div className="flex shrink-0 gap-2">
          <Badge ok={vendor.hasInvoice} label="發票" />
          <Badge ok={vendor.hasQuote} label="報價單" />
        </div>
      </div>

      <ul className="mt-3 divide-y divide-slate-100 border-t border-slate-100 text-xs">
        {vendor.files.map((f) => (
          <li key={f.relativePath} className="flex items-center justify-between py-1.5">
            <span className="flex min-w-0 items-center gap-2">
              <KindTag kind={f.kind} />
              <span className="truncate text-slate-700">{f.name}</span>
            </span>
            <span className="shrink-0 text-slate-400">{formatFileSize(f.size)}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}

function Badge({ ok, label }: { ok: boolean; label: string }) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${
        ok
          ? 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200'
          : 'bg-rose-50 text-rose-700 ring-1 ring-rose-200'
      }`}
    >
      <span>{ok ? '✓' : '✗'}</span>
      {label}
    </span>
  )
}

function KindTag({ kind }: { kind: 'invoice' | 'quote' | 'unknown' }) {
  const map = {
    invoice: { label: '發票', cls: 'bg-indigo-50 text-indigo-700 ring-indigo-200' },
    quote: { label: '報價', cls: 'bg-violet-50 text-violet-700 ring-violet-200' },
    unknown: { label: '其他', cls: 'bg-slate-50 text-slate-500 ring-slate-200' },
  }[kind]
  return (
    <span
      className={`inline-flex shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium ring-1 ${map.cls}`}
    >
      {map.label}
    </span>
  )
}
