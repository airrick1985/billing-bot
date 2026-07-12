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
  getEnvMasterSheetId,
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
      <section className="nb-card border-dashed p-12 text-center">
        <p className="font-bold text-neutral-500">此頁面僅限管理者使用。</p>
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
      className={`nb-frame mt-3 p-3 text-sm font-bold ${
        flash.kind === 'ok' ? 'bg-[var(--nb-green-soft)]' : 'bg-[var(--nb-red-soft)]'
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
    <section className="nb-card p-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-extrabold">建案管理</h2>
          <p className="mt-1 text-sm text-neutral-600">
            每個建案對應一份 Google Sheet。沒有試算表的建案可按「建立」自動產生。
          </p>
        </div>
        <button
          type="button"
          onClick={addRow}
          className="nb-btn nb-btn-blue px-3 py-1.5 text-sm"
        >
          + 新增建案
        </button>
      </div>

      <div className="mt-4 overflow-x-auto">
        <table className="w-full min-w-[720px] text-sm">
          <thead>
            <tr className="border-b-2 border-black text-left text-xs">
              <th className="py-2 pr-3 font-extrabold">建案名稱</th>
              <th className="py-2 pr-3 font-extrabold">試算表</th>
              <th className="py-2 pr-3 font-extrabold">Drive 資料夾 ID(選填)</th>
              <th className="py-2 pr-3 font-extrabold">狀態</th>
              <th className="py-2 pr-3 font-extrabold">備註</th>
              <th className="py-2 font-extrabold" />
            </tr>
          </thead>
          <tbody>
            {drafts.map((p, i) => (
              <tr key={i} className="border-b border-neutral-300 align-top">
                <td className="py-2 pr-3">
                  <input
                    value={p.name}
                    onChange={(e) => update(i, { name: e.target.value })}
                    placeholder="例:富宇學森"
                    className="nb-input w-32 px-2 py-1"
                  />
                </td>
                <td className="py-2 pr-3">
                  {p.sheetId ? (
                    <a
                      href={spreadsheetUrl(parseSpreadsheetId(p.sheetId))}
                      target="_blank"
                      rel="noreferrer"
                      className="nb-link text-xs"
                    >
                      開啟試算表 ↗
                    </a>
                  ) : (
                    <button
                      type="button"
                      disabled={creatingFor !== null}
                      onClick={() => void createSheetFor(i)}
                      className="nb-btn nb-btn-green px-2 py-1 text-xs"
                    >
                      {creatingFor === i ? '建立中…' : '建立試算表'}
                    </button>
                  )}
                  <input
                    value={p.sheetId}
                    onChange={(e) => update(i, { sheetId: e.target.value })}
                    placeholder="或貼上既有試算表網址/ID"
                    className="nb-input mt-1 block w-56 px-2 py-1 font-mono text-[11px]"
                  />
                </td>
                <td className="py-2 pr-3">
                  {p.driveFolderId ? (
                    <a
                      href={folderUrl(p.driveFolderId)}
                      target="_blank"
                      rel="noreferrer"
                      className="nb-link text-xs"
                    >
                      開啟資料夾 ↗
                    </a>
                  ) : (
                    <button
                      type="button"
                      disabled={creatingFor !== null}
                      onClick={() => void createDriveFolderFor(i)}
                      className="nb-btn nb-btn-green px-2 py-1 text-xs"
                    >
                      建立資料夾
                    </button>
                  )}
                  <input
                    value={p.driveFolderId}
                    onChange={(e) => update(i, { driveFolderId: e.target.value })}
                    placeholder="照片歸檔用(需由系統建立)"
                    className="nb-input mt-1 block w-40 px-2 py-1 font-mono text-[11px]"
                  />
                </td>
                <td className="py-2 pr-3">
                  <button
                    type="button"
                    onClick={() => update(i, { active: !p.active })}
                    className={`nb-badge px-2.5 py-0.5 text-xs ${
                      p.active ? 'bg-[var(--nb-green)]' : 'bg-neutral-200 text-neutral-500'
                    }`}
                  >
                    {p.active ? '啟用' : '停用'}
                  </button>
                </td>
                <td className="py-2 pr-3">
                  <input
                    value={p.note}
                    onChange={(e) => update(i, { note: e.target.value })}
                    className="nb-input w-28 px-2 py-1"
                  />
                </td>
                <td className="py-2 text-right">
                  <button
                    type="button"
                    onClick={() => removeRow(i)}
                    className="text-xs font-medium text-neutral-500 underline decoration-2 underline-offset-2 hover:bg-[var(--nb-red-soft)] hover:text-black"
                    title="從清單移除(不會刪除試算表)"
                  >
                    移除
                  </button>
                </td>
              </tr>
            ))}
            {drafts.length === 0 && (
              <tr>
                <td colSpan={6} className="py-6 text-center text-sm font-medium text-neutral-500">
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
          className="nb-btn nb-btn-primary px-4 py-2 text-sm"
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

  const addRow = () =>
    setDrafts((ds) => [...ds, { email: '', role: 'user', note: '', projects: [] }])
  const removeRow = (i: number) => setDrafts((ds) => ds.filter((_, j) => j !== i))

  const projectNames = (master?.projects ?? []).map((p) => p.name)

  const toggleProject = (i: number, name: string) => {
    setDrafts((ds) =>
      ds.map((d, j) => {
        if (j !== i) return d
        const has = d.projects.includes(name)
        return {
          ...d,
          projects: has ? d.projects.filter((p) => p !== name) : [...d.projects, name],
        }
      }),
    )
  }

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
    <section className="nb-card p-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-extrabold">使用者白名單</h2>
          <p className="mt-1 text-sm text-neutral-600">
            只有名單內的 Google 帳號能登入;admin 才能進入本頁。
            <b>另外記得把系統主檔與各建案試算表「共用」給這些帳號</b>(Google 端權限)。
          </p>
        </div>
        <button
          type="button"
          onClick={addRow}
          className="nb-btn nb-btn-blue px-3 py-1.5 text-sm"
        >
          + 新增使用者
        </button>
      </div>

      <div className="mt-4 space-y-2">
        {drafts.map((u, i) => (
          <div key={i} className="nb-frame p-3">
            <div className="flex flex-wrap items-center gap-2">
              <input
                value={u.email}
                onChange={(e) => update(i, { email: e.target.value })}
                placeholder="user@gmail.com"
                className="nb-input w-64 px-2 py-1.5 text-sm"
              />
              <select
                value={u.role}
                onChange={(e) => update(i, { role: e.target.value as AppUser['role'] })}
                className="nb-select px-2 py-1.5 text-sm font-bold"
              >
                <option value="user">user</option>
                <option value="admin">admin</option>
              </select>
              <input
                value={u.note}
                onChange={(e) => update(i, { note: e.target.value })}
                placeholder="備註"
                className="nb-input w-40 px-2 py-1.5 text-sm"
              />
              <button
                type="button"
                onClick={() => removeRow(i)}
                className="text-xs font-medium text-neutral-500 underline decoration-2 underline-offset-2 hover:bg-[var(--nb-red-soft)] hover:text-black"
              >
                移除
              </button>
            </div>

            <div className="mt-2 flex flex-wrap items-center gap-1.5">
              <span className="text-[11px] font-bold">可用建案:</span>
              {u.role === 'admin' ? (
                <span className="nb-badge bg-[var(--nb-purple)] px-2 py-0.5 text-[11px]">
                  全部建案(管理者)
                </span>
              ) : projectNames.length === 0 ? (
                <span className="text-[11px] text-neutral-500">尚無建案</span>
              ) : (
                <>
                  {projectNames.map((name) => {
                    const selected = u.projects.includes(name)
                    return (
                      <button
                        key={name}
                        type="button"
                        onClick={() => toggleProject(i, name)}
                        className={`nb-frame px-2 py-0.5 text-[11px] font-medium transition ${
                          selected
                            ? 'bg-[var(--nb-yellow)] shadow-[2px_2px_0_0_#111]'
                            : 'bg-white text-neutral-600 hover:bg-[var(--nb-bg)]'
                        }`}
                      >
                        {selected ? '✓ ' : ''}
                        {name}
                      </button>
                    )
                  })}
                  {u.projects.length === 0 && (
                    <span className="text-[11px] text-neutral-500">(未勾選 = 全部建案)</span>
                  )}
                </>
              )}
            </div>
          </div>
        ))}
      </div>

      <div className="mt-4 flex justify-end">
        <button
          type="button"
          disabled={saving}
          onClick={() => void save()}
          className="nb-btn nb-btn-primary px-4 py-2 text-sm"
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
    <section className="nb-card p-6">
      <h2 className="text-lg font-extrabold">匯入舊 Excel</h2>
      <p className="mt-1 text-sm text-neutral-600">
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
          className="nb-select px-3 py-1.5 text-sm font-bold"
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
          className="nb-btn nb-btn-blue px-3 py-1.5 text-sm"
        >
          {busy ? '處理中…' : '選擇 .xlsx 檔'}
        </button>
        <input ref={inputRef} type="file" accept=".xlsx" hidden onChange={onPickFile} />
      </div>

      {preview && (
        <div className="nb-frame mt-4 bg-[var(--nb-bg)] p-4 text-sm text-neutral-800">
          <p>
            <b>{preview.filename}</b>(讀取「{preview.sheetUsed}」
            {preview.wasLegacy9Col ? ',舊 9 欄格式' : ''}):共 {preview.rows.length} 列,
            將匯入 <b>{preview.newRows.length}</b> 列
            {preview.dupCount > 0 && (
              <span className="font-bold text-amber-800">,跳過重複發票號 {preview.dupCount} 筆</span>
            )}
            → 寫入「{target?.name}」
          </p>
          <div className="mt-3 flex gap-2">
            <button
              type="button"
              disabled={busy || preview.newRows.length === 0}
              onClick={() => void doImport()}
              className="nb-btn nb-btn-primary px-4 py-1.5 text-sm"
            >
              確認匯入
            </button>
            <button
              type="button"
              onClick={() => setPreview(null)}
              className="nb-btn px-4 py-1.5 text-sm"
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
  const { masterSheetId, switchMasterSheet, resetMasterToEnv } = useAuth()
  const [input, setInput] = useState('')
  const [busy, setBusy] = useState(false)
  const { flash, setFlash } = useFlash()

  const envId = getEnvMasterSheetId()
  const overridden = !!envId && masterSheetId !== envId

  const doSwitch = async () => {
    setBusy(true)
    try {
      await switchMasterSheet(input)
      setInput('')
      setFlash({ kind: 'ok', text: '已切換系統主檔,建案與白名單已重新載入' })
    } catch (err) {
      setFlash({ kind: 'err', text: err instanceof Error ? err.message : String(err) })
    } finally {
      setBusy(false)
    }
  }

  const doReset = async () => {
    setBusy(true)
    try {
      await resetMasterToEnv()
      setFlash({ kind: 'ok', text: '已恢復使用環境變數設定的系統主檔' })
    } catch (err) {
      setFlash({ kind: 'err', text: err instanceof Error ? err.message : String(err) })
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="nb-card p-6">
      <h2 className="text-lg font-extrabold">系統主檔</h2>
      <dl className="mt-3 space-y-2 text-sm">
        <div className="flex flex-wrap items-center gap-2">
          <dt className="font-bold">目前使用:</dt>
          <dd>
            <a
              href={spreadsheetUrl(masterSheetId)}
              target="_blank"
              rel="noreferrer"
              className="nb-link font-mono text-xs"
            >
              {masterSheetId || '(未設定)'}
            </a>
          </dd>
          {overridden && (
            <span className="nb-badge bg-[var(--nb-amber)] px-2 py-0.5 text-[11px]">
              此裝置覆寫中
            </span>
          )}
        </div>
      </dl>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="貼上新的系統主檔網址或 ID"
          className="nb-input min-w-0 flex-1 px-3 py-1.5 font-mono text-xs"
        />
        <button
          type="button"
          disabled={busy || !input.trim()}
          onClick={() => void doSwitch()}
          className="nb-btn nb-btn-primary px-3 py-1.5 text-sm"
        >
          {busy ? '處理中…' : '切換主檔'}
        </button>
        {overridden && (
          <button
            type="button"
            disabled={busy}
            onClick={() => void doReset()}
            className="nb-btn px-3 py-1.5 text-sm"
            title={`環境變數設定:${envId}`}
          >
            恢復環境變數設定
          </button>
        )}
      </div>

      <p className="mt-3 text-xs leading-5 text-neutral-500">
        ⓘ 切換前會先驗證:讀得到該試算表、含「建案/使用者」分頁、且你的帳號在其白名單,否則不會切換。
        切換只影響<b>這台裝置</b>;要讓所有使用者一起切換,請同步更新部署環境變數{' '}
        <code className="nb-frame bg-[var(--nb-bg)] px-1">VITE_MASTER_SHEET_ID</code>{' '}
        並重新部署。個資提醒:試算表含身分證字號等資料,共用時請指定帳號,勿設成「知道連結者皆可檢視」。
      </p>
      <FlashNote flash={flash} />
    </section>
  )
}
