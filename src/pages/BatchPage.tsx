import { useEffect, useMemo, useRef, useState } from 'react'
import { useAuth } from '../hooks/useAuth'
import { readVendorDirectory, type VendorInfo } from '../lib/google/billingSheet'
import { spreadsheetUrl } from '../lib/google/sheets'
import {
  ACCEPTED_UPLOAD_EXT,
  classifyFile,
  computeKindFlags,
  formatFileSize,
  type FileKind,
  type KnownVendorInfo,
  type ParsedUpload,
  type VendorFile,
  type VendorGroup,
} from '../lib/upload'

type Props = {
  parsed: ParsedUpload | null
  setParsed: (p: ParsedUpload | null) => void
}

const KIND_OPTIONS: { value: FileKind; label: string }[] = [
  { value: 'invoice', label: '發票' },
  { value: 'quote', label: '報價/請款單' },
  { value: 'referral', label: '介紹費申請單' },
  { value: 'unknown', label: '其他' },
]

function emptyBatch(year: number, month: number): ParsedUpload {
  return {
    rootName: `${year}年${month}月`,
    period: { raw: `${year}年${month}月`, year, month },
    vendors: [],
    totalFiles: 0,
    skippedFiles: 0,
  }
}

function recount(p: ParsedUpload): ParsedUpload {
  return { ...p, totalFiles: p.vendors.reduce((n, v) => n + v.files.length, 0) }
}

export default function BatchPage({ parsed, setParsed }: Props) {
  const { activeProject } = useAuth()
  const now = new Date()
  const batch = parsed ?? emptyBatch(now.getFullYear(), now.getMonth() + 1)

  type DirState = { key: string; list: VendorInfo[] | null; error: string | null }
  const sheetId = activeProject?.sheetId ?? ''
  // list === null 表示載入中(僅在有 sheetId 時);建案切換時於 render 期間重置
  const [dirState, setDirState] = useState<DirState>({
    key: sheetId,
    list: sheetId ? null : [],
    error: null,
  })
  if (dirState.key !== sheetId) {
    setDirState({ key: sheetId, list: sheetId ? null : [], error: null })
  }
  const directory = dirState.list
  const dirError = dirState.error

  const [search, setSearch] = useState('')
  const [newVendorName, setNewVendorName] = useState('')

  useEffect(() => {
    if (!sheetId) return
    let cancelled = false
    readVendorDirectory(sheetId)
      .then((d) => {
        if (!cancelled) setDirState({ key: sheetId, list: d, error: null })
      })
      .catch((err) => {
        if (!cancelled) {
          setDirState({
            key: sheetId,
            list: [],
            error: err instanceof Error ? err.message : String(err),
          })
        }
      })
    return () => {
      cancelled = true
    }
  }, [sheetId])

  const filteredDirectory = useMemo(() => {
    if (!directory) return []
    const q = search.trim()
    if (!q) return directory
    return directory.filter(
      (v) =>
        v.name.includes(q) ||
        v.taxId.includes(q) ||
        v.contact.includes(q) ||
        v.phone.includes(q),
    )
  }, [directory, search])

  const setPeriod = (year: number, month: number) => {
    const raw = `${year}年${month}月`
    setParsed({ ...batch, rootName: raw, period: { raw, year, month } })
  }

  const addVendor = (name: string, known?: KnownVendorInfo) => {
    const trimmed = name.trim()
    if (!trimmed) return
    const sameName = batch.vendors.filter((v) => v.displayName === trimmed)
    const index = sameName.length + 1
    const vendor: VendorGroup = {
      folderName: index > 1 ? `${trimmed}-${index}` : trimmed,
      displayName: trimmed,
      index,
      files: [],
      hasInvoice: false,
      hasQuote: false,
      hasReferral: false,
      known,
    }
    setParsed(recount({ ...batch, vendors: [...batch.vendors, vendor] }))
  }

  const removeVendor = (folderName: string) => {
    setParsed(
      recount({ ...batch, vendors: batch.vendors.filter((v) => v.folderName !== folderName) }),
    )
  }

  const updateVendor = (folderName: string, files: VendorFile[]) => {
    setParsed(
      recount({
        ...batch,
        vendors: batch.vendors.map((v) =>
          v.folderName === folderName ? { ...v, files, ...computeKindFlags(files) } : v,
        ),
      }),
    )
  }

  const addFilesTo = (vendor: VendorGroup, picked: File[]) => {
    const accepted = picked.filter((f) => ACCEPTED_UPLOAD_EXT.test(f.name))
    const next = [...vendor.files]
    for (const file of accepted) {
      next.push({
        name: file.name,
        relativePath: `${vendor.folderName}/${next.length}-${file.name}`,
        size: file.size,
        file,
        kind: classifyFile(file.name),
      })
    }
    updateVendor(vendor.folderName, next)
  }

  const inBatch = new Set(batch.vendors.map((v) => v.displayName))

  return (
    <section className="space-y-4">
      <header className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="text-xl font-semibold text-slate-900">① 建立請款批次</h2>
        <p className="mt-1 text-sm text-slate-600">
          建案 <b>{activeProject?.name ?? '未選擇'}</b>
          {activeProject?.sheetId && (
            <>
              (
              <a
                href={spreadsheetUrl(activeProject.sheetId)}
                target="_blank"
                rel="noreferrer"
                className="text-indigo-600 underline underline-offset-2"
              >
                總表
              </a>
              )
            </>
          )}
          。選擇請款月份,從歷史廠商挑選或新增,再上傳各廠商本月的請款照片。
        </p>

        <div className="mt-4 flex flex-wrap items-center gap-3">
          <span className="text-sm text-slate-600">請款月份</span>
          <select
            value={batch.period.year ?? now.getFullYear()}
            onChange={(e) => setPeriod(Number(e.target.value), batch.period.month ?? 1)}
            className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm shadow-sm"
          >
            {Array.from({ length: 4 }, (_, i) => now.getFullYear() - 2 + i).map((y) => (
              <option key={y} value={y}>
                {y} 年
              </option>
            ))}
          </select>
          <select
            value={batch.period.month ?? now.getMonth() + 1}
            onChange={(e) =>
              setPeriod(batch.period.year ?? now.getFullYear(), Number(e.target.value))
            }
            className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm shadow-sm"
          >
            {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
              <option key={m} value={m}>
                {m} 月
              </option>
            ))}
          </select>
          <span className="text-xs text-slate-400">
            寫入時會存到「{batch.rootName}」分頁與總表
          </span>
        </div>
      </header>

      {!activeProject?.sheetId && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
          ⚠️ 此建案尚未設定 Google Sheet,無法載入歷史廠商與寫入。請管理者到「管理後台」補上。
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        {/* 左:歷史廠商目錄 */}
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between gap-2">
            <h3 className="text-sm font-semibold text-slate-900">
              歷史廠商
              {directory && (
                <span className="ml-1 text-xs font-normal text-slate-400">
                  {directory.length} 筆
                </span>
              )}
            </h3>
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="搜尋名稱 / 統編 / 聯絡人"
              className="w-48 rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs shadow-sm focus:border-indigo-400 focus:outline-none"
            />
          </div>

          {dirError && (
            <p className="mt-3 rounded-lg bg-rose-50 p-2.5 text-xs text-rose-700 ring-1 ring-rose-200">
              ⚠ 讀取總表失敗:{dirError}
            </p>
          )}

          <div className="mt-3 max-h-96 space-y-1.5 overflow-y-auto pr-1">
            {directory === null && (
              <p className="py-6 text-center text-xs text-slate-400">載入中…</p>
            )}
            {directory !== null && filteredDirectory.length === 0 && (
              <p className="py-6 text-center text-xs text-slate-400">
                {search ? '沒有符合的廠商' : '總表還沒有請款紀錄,用下方「新增廠商」開始'}
              </p>
            )}
            {filteredDirectory.map((v) => (
              <div
                key={v.name}
                className="flex items-center justify-between gap-2 rounded-lg border border-slate-100 px-3 py-2"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-slate-800">{v.name}</p>
                  <p className="truncate text-[11px] text-slate-400">
                    {[
                      v.taxId && `統編 ${v.taxId}`,
                      v.contact,
                      v.phone,
                      v.lastPeriod && `上次 ${v.lastPeriod}`,
                      `${v.count} 筆`,
                    ]
                      .filter(Boolean)
                      .join('・')}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() =>
                    addVendor(v.name, { taxId: v.taxId, contact: v.contact, phone: v.phone })
                  }
                  className={`shrink-0 rounded-lg px-2.5 py-1 text-xs font-medium shadow-sm ${
                    inBatch.has(v.name)
                      ? 'border border-slate-200 bg-slate-50 text-slate-500 hover:bg-slate-100'
                      : 'border border-indigo-300 bg-white text-indigo-700 hover:bg-indigo-50'
                  }`}
                >
                  {inBatch.has(v.name) ? '再加一筆' : '+ 加入'}
                </button>
              </div>
            ))}
          </div>

          <div className="mt-3 flex gap-2 border-t border-slate-100 pt-3">
            <input
              value={newVendorName}
              onChange={(e) => setNewVendorName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  addVendor(newVendorName)
                  setNewVendorName('')
                }
              }}
              placeholder="新增廠商名稱(總表沒有的)"
              className="min-w-0 flex-1 rounded-lg border border-slate-200 px-3 py-1.5 text-sm shadow-sm focus:border-indigo-400 focus:outline-none"
            />
            <button
              type="button"
              disabled={!newVendorName.trim()}
              onClick={() => {
                addVendor(newVendorName)
                setNewVendorName('')
              }}
              className="rounded-lg bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white shadow-sm hover:bg-indigo-700 disabled:opacity-40"
            >
              新增
            </button>
          </div>
        </div>

        {/* 右:本批清單 */}
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <h3 className="text-sm font-semibold text-slate-900">
            本批請款廠商
            <span className="ml-1 text-xs font-normal text-slate-400">
              {batch.vendors.length} 筆・{batch.totalFiles} 張照片
            </span>
          </h3>

          <div className="mt-3 space-y-3">
            {batch.vendors.length === 0 && (
              <p className="rounded-xl border border-dashed border-slate-200 py-8 text-center text-xs text-slate-400">
                從左側加入廠商後,在這裡上傳照片
              </p>
            )}
            {batch.vendors.map((v) => (
              <EntryCard
                key={v.folderName}
                vendor={v}
                onAddFiles={(files) => addFilesTo(v, files)}
                onSetKind={(relPath, kind) =>
                  updateVendor(
                    v.folderName,
                    v.files.map((f) => (f.relativePath === relPath ? { ...f, kind } : f)),
                  )
                }
                onRemoveFile={(relPath) =>
                  updateVendor(
                    v.folderName,
                    v.files.filter((f) => f.relativePath !== relPath),
                  )
                }
                onRemove={() => removeVendor(v.folderName)}
              />
            ))}
          </div>
        </div>
      </div>

      {batch.vendors.some((v) => v.files.length === 0) && (
        <p className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
          ⚠️ 有廠商尚未上傳照片,進入下一步辨識時會被標記失敗。
        </p>
      )}
    </section>
  )
}

function EntryCard({
  vendor,
  onAddFiles,
  onSetKind,
  onRemoveFile,
  onRemove,
}: {
  vendor: VendorGroup
  onAddFiles: (files: File[]) => void
  onSetKind: (relativePath: string, kind: FileKind) => void
  onRemoveFile: (relativePath: string) => void
  onRemove: () => void
}) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [dragging, setDragging] = useState(false)

  const displayName =
    vendor.index > 1 ? `${vendor.displayName}(第 ${vendor.index} 筆)` : vendor.displayName

  return (
    <div
      onDragOver={(e) => {
        e.preventDefault()
        setDragging(true)
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={(e) => {
        e.preventDefault()
        setDragging(false)
        onAddFiles(Array.from(e.dataTransfer.files))
      }}
      className={`rounded-xl border p-3 transition ${
        dragging ? 'border-indigo-400 bg-indigo-50' : 'border-slate-200 bg-white'
      }`}
    >
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-slate-900">{displayName}</p>
          {vendor.known && (vendor.known.taxId || vendor.known.contact || vendor.known.phone) && (
            <p className="truncate text-[11px] text-slate-400">
              {[
                vendor.known.taxId && `統編 ${vendor.known.taxId}`,
                vendor.known.contact,
                vendor.known.phone,
              ]
                .filter(Boolean)
                .join('・')}
            </p>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            className="rounded-lg border border-indigo-300 bg-white px-2.5 py-1 text-xs font-medium text-indigo-700 shadow-sm hover:bg-indigo-50"
          >
            + 照片
          </button>
          <button
            type="button"
            onClick={onRemove}
            className="text-xs text-slate-400 hover:text-rose-600"
          >
            移除
          </button>
        </div>
      </div>

      <input
        ref={inputRef}
        type="file"
        hidden
        multiple
        accept="image/*,.pdf,.heic,.heif"
        onChange={(e) => {
          onAddFiles(e.target.files ? Array.from(e.target.files) : [])
          e.target.value = ''
        }}
      />

      {vendor.files.length > 0 && (
        <ul className="mt-2 divide-y divide-slate-100 border-t border-slate-100 text-xs">
          {vendor.files.map((f) => (
            <li key={f.relativePath} className="flex items-center gap-2 py-1.5">
              <select
                value={f.kind}
                onChange={(e) => onSetKind(f.relativePath, e.target.value as FileKind)}
                className="shrink-0 rounded border border-slate-200 bg-white px-1.5 py-0.5 text-[11px] text-slate-600"
              >
                {KIND_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
              <span className="min-w-0 flex-1 truncate text-slate-700">{f.name}</span>
              <span className="shrink-0 text-slate-400">{formatFileSize(f.size)}</span>
              <button
                type="button"
                onClick={() => onRemoveFile(f.relativePath)}
                className="shrink-0 text-slate-300 hover:text-rose-600"
                title="移除照片"
              >
                ✕
              </button>
            </li>
          ))}
        </ul>
      )}
      {vendor.files.length === 0 && (
        <p className="mt-2 text-[11px] text-slate-400">
          拖曳照片到這裡,或按「+ 照片」選擇(jpg / png / webp / heic / pdf)
        </p>
      )}
    </div>
  )
}
