import { useEffect, useRef, useState } from 'react'
import GlobalOcrCard from '../components/GlobalOcrCard'
import { useAuth } from '../hooks/useAuth'
import { useSettings } from '../hooks/useSettings'
import {
  appendAuditLog,
  importRows,
  readExistingInvoiceNos,
} from '../lib/google/billingSheet'
import {
  saveProjects,
  saveUsers,
  type AppUser,
  type Project,
} from '../lib/google/masterSheet'
import { parseImportFile, type ImportRow } from '../lib/importExcel'
import { createProjectSheet, verifyProjectSheet } from '../lib/google/projectSheet'
import { createFolder, folderUrl } from '../lib/google/drive'
import { parseSpreadsheetId, spreadsheetUrl } from '../lib/google/sheets'

export default function AdminPage() {
  const { role, ocrConfig, saveGlobalOcrConfig } = useAuth()
  const { settings } = useSettings()

  if (role !== 'admin') {
    return (
      <section className="rounded-2xl border border-dashed border-slate-300 bg-white p-12 text-center">
        <p className="text-slate-500">此頁面僅限管理者使用。</p>
      </section>
    )
  }

  return (
    <div className="space-y-6">
      <ProjectsAdmin />
      <GlobalOcrCard settings={settings} ocrConfig={ocrConfig} onSave={saveGlobalOcrConfig} />
      <UsersAdmin />
      <ImportAdmin />
      <SystemInfo />
    </div>
  )
}

function useFlash() {
  const [flash, setFlash] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null)
  useEffect(() => {
    if (!flash) return
    const t = setTimeout(() => setFlash(null), 6000)
    return () => clearTimeout(t)
  }, [flash])
  return { flash, setFlash }
}

function FlashNote({ flash }: { flash: { kind: 'ok' | 'err'; text: string } | null }) {
  if (!flash) return null
  return (
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
  )
}

function ProjectsAdmin() {
  const { master, masterSheetId, refreshMaster } = useAuth()
  const [drafts, setDrafts] = useState<Project[]>(master?.projects ?? [])
  const [saving, setSaving] = useState(false)
  const [creatingFor, setCreatingFor] = useState<number | null>(null)
  const { flash, setFlash } = useFlash()

  // 主檔重新載入時重置草稿(render 期間調整狀態,避免 effect 級聯渲染)
  const [prevMaster, setPrevMaster] = useState(master)
  if (master !== prevMaster) {
    setPrevMaster(master)
    setDrafts(master?.projects ?? [])
  }

  const update = (i: number, patch: Partial<Project>) => {
    setDrafts((ds) => ds.map((d, j) => (j === i ? { ...d, ...patch } : d)))
  }

  const addRow = () => {
    setDrafts((ds) => [
      ...ds,
      { name: '', sheetId: '', driveFolderId: '', active: true, note: '' },
    ])
  }

  const removeRow = (i: number) => {
    setDrafts((ds) => ds.filter((_, j) => j !== i))
  }

  const createSheetFor = async (i: number) => {
    const p = drafts[i]
    if (!p.name.trim()) {
      setFlash({ kind: 'err', text: '請先填建案名稱再建立試算表' })
      return
    }
    setCreatingFor(i)
    try {
      const id = await createProjectSheet(p.name.trim())
      update(i, { sheetId: id })
      setFlash({ kind: 'ok', text: `已建立「${p.name}」試算表,記得按「儲存變更」` })
    } catch (err) {
      setFlash({ kind: 'err', text: err instanceof Error ? err.message : String(err) })
    } finally {
      setCreatingFor(null)
    }
  }

  const createDriveFolderFor = async (i: number) => {
    const p = drafts[i]
    if (!p.name.trim()) {
      setFlash({ kind: 'err', text: '請先填建案名稱再建立資料夾' })
      return
    }
    setCreatingFor(i)
    try {
      const id = await createFolder(`${p.name.trim()}-請款照片`)
      update(i, { driveFolderId: id })
      setFlash({ kind: 'ok', text: `已建立「${p.name}」照片資料夾,記得按「儲存變更」` })
    } catch (err) {
      setFlash({ kind: 'err', text: err instanceof Error ? err.message : String(err) })
    } finally {
      setCreatingFor(null)
    }
  }

  const save = async () => {
    const cleaned = drafts
      .map((d) => ({
        ...d,
        name: d.name.trim(),
        sheetId: parseSpreadsheetId(d.sheetId),
        driveFolderId: d.driveFolderId.trim(),
        note: d.note.trim(),
      }))
      .filter((d) => d.name)

    const names = new Set<string>()
    for (const d of cleaned) {
      if (names.has(d.name)) {
        setFlash({ kind: 'err', text: `建案名稱重複:${d.name}` })
        return
      }
      names.add(d.name)
    }

    setSaving(true)
    try {
      // 有填試算表 ID 的先驗證可存取,避免存進打錯的 ID
      for (const d of cleaned) {
        if (!d.sheetId) continue
        const v = await verifyProjectSheet(d.sheetId)
        if (!v.hasSummary) {
          setFlash({
            kind: 'err',
            text: `「${d.name}」的試算表(${v.title})沒有「總表」分頁,請確認`,
          })
          setSaving(false)
          return
        }
      }
      await saveProjects(masterSheetId, cleaned)
      await refreshMaster()
      setFlash({ kind: 'ok', text: '建案清單已儲存' })
    } catch (err) {
      setFlash({ kind: 'err', text: err instanceof Error ? err.message : String(err) })
    } finally {
      setSaving(false)
    }
  }

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-slate-900">建案管理</h2>
          <p className="mt-1 text-sm text-slate-600">
            每個建案對應一份 Google Sheet。沒有試算表的建案可按「建立」自動產生。
          </p>
        </div>
        <button
          type="button"
          onClick={addRow}
          className="rounded-lg border border-indigo-300 bg-white px-3 py-1.5 text-sm font-medium text-indigo-700 shadow-sm hover:bg-indigo-50"
        >
          + 新增建案
        </button>
      </div>

      <div className="mt-4 overflow-x-auto">
        <table className="w-full min-w-[720px] text-sm">
          <thead>
            <tr className="border-b border-slate-200 text-left text-xs text-slate-500">
              <th className="py-2 pr-3 font-medium">建案名稱</th>
              <th className="py-2 pr-3 font-medium">試算表</th>
              <th className="py-2 pr-3 font-medium">Drive 資料夾 ID(選填)</th>
              <th className="py-2 pr-3 font-medium">狀態</th>
              <th className="py-2 pr-3 font-medium">備註</th>
              <th className="py-2 font-medium" />
            </tr>
          </thead>
          <tbody>
            {drafts.map((p, i) => (
              <tr key={i} className="border-b border-slate-100 align-top">
                <td className="py-2 pr-3">
                  <input
                    value={p.name}
                    onChange={(e) => update(i, { name: e.target.value })}
                    placeholder="例:富宇學森"
                    className="w-32 rounded border border-slate-200 px-2 py-1 shadow-sm focus:border-indigo-400 focus:outline-none"
                  />
                </td>
                <td className="py-2 pr-3">
                  {p.sheetId ? (
                    <a
                      href={spreadsheetUrl(parseSpreadsheetId(p.sheetId))}
                      target="_blank"
                      rel="noreferrer"
                      className="text-xs text-indigo-600 underline underline-offset-2 hover:text-indigo-800"
                    >
                      開啟試算表 ↗
                    </a>
                  ) : (
                    <button
                      type="button"
                      disabled={creatingFor !== null}
                      onClick={() => void createSheetFor(i)}
                      className="rounded border border-emerald-300 bg-emerald-50 px-2 py-1 text-xs font-medium text-emerald-800 hover:bg-emerald-100 disabled:opacity-40"
                    >
                      {creatingFor === i ? '建立中…' : '建立試算表'}
                    </button>
                  )}
                  <input
                    value={p.sheetId}
                    onChange={(e) => update(i, { sheetId: e.target.value })}
                    placeholder="或貼上既有試算表網址/ID"
                    className="mt-1 block w-56 rounded border border-slate-200 px-2 py-1 font-mono text-[11px] shadow-sm focus:border-indigo-400 focus:outline-none"
                  />
                </td>
                <td className="py-2 pr-3">
                  {p.driveFolderId ? (
                    <a
                      href={folderUrl(p.driveFolderId)}
                      target="_blank"
                      rel="noreferrer"
                      className="text-xs text-indigo-600 underline underline-offset-2 hover:text-indigo-800"
                    >
                      開啟資料夾 ↗
                    </a>
                  ) : (
                    <button
                      type="button"
                      disabled={creatingFor !== null}
                      onClick={() => void createDriveFolderFor(i)}
                      className="rounded border border-emerald-300 bg-emerald-50 px-2 py-1 text-xs font-medium text-emerald-800 hover:bg-emerald-100 disabled:opacity-40"
                    >
                      建立資料夾
                    </button>
                  )}
                  <input
                    value={p.driveFolderId}
                    onChange={(e) => update(i, { driveFolderId: e.target.value })}
                    placeholder="照片歸檔用(需由系統建立)"
                    className="mt-1 block w-40 rounded border border-slate-200 px-2 py-1 font-mono text-[11px] shadow-sm focus:border-indigo-400 focus:outline-none"
                  />
                </td>
                <td className="py-2 pr-3">
                  <button
                    type="button"
                    onClick={() => update(i, { active: !p.active })}
                    className={`rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ${
                      p.active
                        ? 'bg-emerald-50 text-emerald-700 ring-emerald-200'
                        : 'bg-slate-100 text-slate-500 ring-slate-200'
                    }`}
                  >
                    {p.active ? '啟用' : '停用'}
                  </button>
                </td>
                <td className="py-2 pr-3">
                  <input
                    value={p.note}
                    onChange={(e) => update(i, { note: e.target.value })}
                    className="w-28 rounded border border-slate-200 px-2 py-1 shadow-sm focus:border-indigo-400 focus:outline-none"
                  />
                </td>
                <td className="py-2 text-right">
                  <button
                    type="button"
                    onClick={() => removeRow(i)}
                    className="text-xs text-slate-400 hover:text-rose-600"
                    title="從清單移除(不會刪除試算表)"
                  >
                    移除
                  </button>
                </td>
              </tr>
            ))}
            {drafts.length === 0 && (
              <tr>
                <td colSpan={6} className="py-6 text-center text-sm text-slate-400">
                  尚無建案,按「+ 新增建案」開始。
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="mt-4 flex items-center justify-end gap-2">
        <button
          type="button"
          disabled={saving}
          onClick={() => void save()}
          className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-indigo-700 disabled:opacity-40"
        >
          {saving ? '儲存中…' : '儲存變更'}
        </button>
      </div>
      <FlashNote flash={flash} />
    </section>
  )
}

function UsersAdmin() {
  const { master, masterSheetId, refreshMaster, user } = useAuth()
  const [drafts, setDrafts] = useState<AppUser[]>(master?.users ?? [])
  const [saving, setSaving] = useState(false)
  const { flash, setFlash } = useFlash()

  const [prevMaster, setPrevMaster] = useState(master)
  if (master !== prevMaster) {
    setPrevMaster(master)
    setDrafts(master?.users ?? [])
  }

  const update = (i: number, patch: Partial<AppUser>) => {
    setDrafts((ds) => ds.map((d, j) => (j === i ? { ...d, ...patch } : d)))
  }

  const addRow = () => setDrafts((ds) => [...ds, { email: '', role: 'user', note: '' }])
  const removeRow = (i: number) => setDrafts((ds) => ds.filter((_, j) => j !== i))

  const save = async () => {
    const cleaned = drafts
      .map((d) => ({ ...d, email: d.email.trim().toLowerCase(), note: d.note.trim() }))
      .filter((d) => d.email)

    if (!cleaned.some((d) => d.role === 'admin')) {
      setFlash({ kind: 'err', text: '至少要保留一位 admin' })
      return
    }
    const me = cleaned.find((d) => d.email === user?.email)
    if (!me || me.role !== 'admin') {
      setFlash({ kind: 'err', text: '不能移除自己或取消自己的 admin 權限' })
      return
    }

    setSaving(true)
    try {
      await saveUsers(masterSheetId, cleaned)
      await refreshMaster()
      setFlash({ kind: 'ok', text: '使用者白名單已儲存' })
    } catch (err) {
      setFlash({ kind: 'err', text: err instanceof Error ? err.message : String(err) })
    } finally {
      setSaving(false)
    }
  }

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-slate-900">使用者白名單</h2>
          <p className="mt-1 text-sm text-slate-600">
            只有名單內的 Google 帳號能登入;admin 才能進入本頁。
            <b>另外記得把系統主檔與各建案試算表「共用」給這些帳號</b>(Google 端權限)。
          </p>
        </div>
        <button
          type="button"
          onClick={addRow}
          className="rounded-lg border border-indigo-300 bg-white px-3 py-1.5 text-sm font-medium text-indigo-700 shadow-sm hover:bg-indigo-50"
        >
          + 新增使用者
        </button>
      </div>

      <div className="mt-4 space-y-2">
        {drafts.map((u, i) => (
          <div key={i} className="flex flex-wrap items-center gap-2">
            <input
              value={u.email}
              onChange={(e) => update(i, { email: e.target.value })}
              placeholder="user@gmail.com"
              className="w-64 rounded border border-slate-200 px-2 py-1.5 text-sm shadow-sm focus:border-indigo-400 focus:outline-none"
            />
            <select
              value={u.role}
              onChange={(e) => update(i, { role: e.target.value as AppUser['role'] })}
              className="rounded border border-slate-200 bg-white px-2 py-1.5 text-sm shadow-sm"
            >
              <option value="user">user</option>
              <option value="admin">admin</option>
            </select>
            <input
              value={u.note}
              onChange={(e) => update(i, { note: e.target.value })}
              placeholder="備註"
              className="w-40 rounded border border-slate-200 px-2 py-1.5 text-sm shadow-sm focus:border-indigo-400 focus:outline-none"
            />
            <button
              type="button"
              onClick={() => removeRow(i)}
              className="text-xs text-slate-400 hover:text-rose-600"
            >
              移除
            </button>
          </div>
        ))}
      </div>

      <div className="mt-4 flex justify-end">
        <button
          type="button"
          disabled={saving}
          onClick={() => void save()}
          className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-indigo-700 disabled:opacity-40"
        >
          {saving ? '儲存中…' : '儲存變更'}
        </button>
      </div>
      <FlashNote flash={flash} />
    </section>
  )
}

type ImportPreview = {
  filename: string
  rows: ImportRow[]
  sheetUsed: string
  wasLegacy9Col: boolean
  dupCount: number
  newRows: ImportRow[]
}

function ImportAdmin() {
  const { master, user } = useAuth()
  const [projectName, setProjectName] = useState('')
  const [busy, setBusy] = useState(false)
  const [preview, setPreview] = useState<ImportPreview | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const { flash, setFlash } = useFlash()

  const projects = (master?.projects ?? []).filter((p) => p.sheetId)
  const target = projects.find((p) => p.name === projectName) ?? null

  const onPickFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (e.target) e.target.value = ''
    if (!file || !target) return
    setBusy(true)
    setPreview(null)
    try {
      const parsed = await parseImportFile(file)
      const existing = await readExistingInvoiceNos(target.sheetId)
      const newRows = parsed.rows.filter((r) => {
        const no = String(r[3] ?? '').trim()
        return !(no && existing.has(no))
      })
      setPreview({
        filename: file.name,
        rows: parsed.rows,
        sheetUsed: parsed.sheetUsed,
        wasLegacy9Col: parsed.wasLegacy9Col,
        dupCount: parsed.rows.length - newRows.length,
        newRows,
      })
    } catch (err) {
      setFlash({ kind: 'err', text: err instanceof Error ? err.message : String(err) })
    } finally {
      setBusy(false)
    }
  }

  const doImport = async () => {
    if (!preview || !target) return
    setBusy(true)
    try {
      const res = await importRows(target.sheetId, preview.newRows)
      void appendAuditLog(target.sheetId, {
        user: user?.email ?? '',
        action: '匯入舊 Excel',
        detail: `${preview.filename}:+${res.added} 列(跳過重複 ${preview.dupCount}),月份分頁:${res.monthsTouched.join('、') || '無'}`,
      })
      setFlash({
        kind: 'ok',
        text: `已匯入「${target.name}」:+${res.added} 列、更新 ${res.monthsTouched.length} 個月份分頁${preview.dupCount > 0 ? `、跳過重複發票號 ${preview.dupCount} 筆` : ''}`,
      })
      setPreview(null)
    } catch (err) {
      setFlash({ kind: 'err', text: err instanceof Error ? err.message : String(err) })
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
      <h2 className="text-lg font-semibold text-slate-900">匯入舊 Excel</h2>
      <p className="mt-1 text-sm text-slate-600">
        把舊系統匯出的 .xlsx(總表)一次性匯入建案的 Google
        Sheet。舊 9 欄格式會自動補上聯絡人/電話空欄;發票號碼已存在的列自動跳過。
      </p>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <select
          value={projectName}
          onChange={(e) => {
            setProjectName(e.target.value)
            setPreview(null)
          }}
          className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm shadow-sm"
        >
          <option value="">選擇目標建案…</option>
          {projects.map((p) => (
            <option key={p.name} value={p.name}>
              {p.name}
            </option>
          ))}
        </select>
        <button
          type="button"
          disabled={!target || busy}
          onClick={() => inputRef.current?.click()}
          className="rounded-lg border border-indigo-300 bg-white px-3 py-1.5 text-sm font-medium text-indigo-700 shadow-sm hover:bg-indigo-50 disabled:opacity-40"
        >
          {busy ? '處理中…' : '選擇 .xlsx 檔'}
        </button>
        <input ref={inputRef} type="file" accept=".xlsx" hidden onChange={onPickFile} />
      </div>

      {preview && (
        <div className="mt-4 rounded-lg border border-slate-200 bg-slate-50 p-4 text-sm text-slate-700">
          <p>
            <b>{preview.filename}</b>(讀取「{preview.sheetUsed}」
            {preview.wasLegacy9Col ? ',舊 9 欄格式' : ''}):共 {preview.rows.length} 列,
            將匯入 <b>{preview.newRows.length}</b> 列
            {preview.dupCount > 0 && (
              <span className="text-amber-700">,跳過重複發票號 {preview.dupCount} 筆</span>
            )}
            → 寫入「{target?.name}」
          </p>
          <div className="mt-3 flex gap-2">
            <button
              type="button"
              disabled={busy || preview.newRows.length === 0}
              onClick={() => void doImport()}
              className="rounded-lg bg-indigo-600 px-4 py-1.5 text-sm font-medium text-white shadow-sm hover:bg-indigo-700 disabled:opacity-40"
            >
              確認匯入
            </button>
            <button
              type="button"
              onClick={() => setPreview(null)}
              className="rounded-lg border border-slate-300 bg-white px-4 py-1.5 text-sm text-slate-700 shadow-sm hover:bg-slate-50"
            >
              取消
            </button>
          </div>
        </div>
      )}
      <FlashNote flash={flash} />
    </section>
  )
}

function SystemInfo() {
  const { masterSheetId } = useAuth()
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
      <h2 className="text-lg font-semibold text-slate-900">系統資訊</h2>
      <dl className="mt-3 space-y-2 text-sm">
        <div className="flex flex-wrap items-center gap-2">
          <dt className="text-slate-500">系統主檔:</dt>
          <dd>
            <a
              href={spreadsheetUrl(masterSheetId)}
              target="_blank"
              rel="noreferrer"
              className="font-mono text-xs text-indigo-600 underline underline-offset-2 hover:text-indigo-800"
            >
              {masterSheetId}
            </a>
          </dd>
        </div>
      </dl>
      <p className="mt-3 text-xs leading-5 text-slate-400">
        ⓘ 部署到正式環境時,建議把系統主檔 ID 設成環境變數{' '}
        <code className="rounded bg-slate-100 px-1">VITE_MASTER_SHEET_ID</code>
        ,新裝置就不用手動設定。個資提醒:試算表含身分證字號等資料,共用時請指定帳號,勿設成「知道連結者皆可檢視」。
      </p>
    </section>
  )
}
