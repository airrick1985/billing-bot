/**
 * 系統主檔:一份 Google Sheet 管理所有建案與使用者白名單。
 * - 「建案」分頁:建案名稱 | 試算表ID | Drive資料夾ID | 狀態 | 備註
 * - 「使用者」分頁:Email | 角色 | 備註
 */
import {
  appendValues,
  batchUpdate,
  clearValues,
  createSpreadsheet,
  getSpreadsheetMeta,
  getValues,
  setValues,
  type CellValue,
} from './sheets'

const MASTER_ID_KEY = 'billing-bot:master-sheet-id'

export const PROJECTS_TAB = '建案'
export const USERS_TAB = '使用者'
export const CONFIG_TAB = '設定'

const PROJECT_HEADERS = ['建案名稱', '試算表ID', 'Drive資料夾ID', '狀態', '備註']
// 「可用建案」附加在最後,舊主檔(只有 3 欄)讀取時視為未限制
const USER_HEADERS = ['Email', '角色', '備註', '可用建案']
const CONFIG_HEADERS = ['項目', '值']

export type Project = {
  name: string
  sheetId: string
  driveFolderId: string
  active: boolean
  note: string
}

export type Role = 'admin' | 'user'

export type AppUser = {
  email: string
  role: Role
  note: string
  /** 可用建案名稱清單;空陣列 = 不限制(全部建案) */
  projects: string[]
}

/** 全域 OCR 設定(admin 維護,所有使用者共用) */
export type OcrConfig = {
  provider: string
  model: string
  specPrompt: string
}

export type MasterData = {
  projects: Project[]
  users: AppUser[]
  ocrConfig: OcrConfig | null
}

/** 環境變數提供的主檔 ID(部署時全站預設) */
export function getEnvMasterSheetId(): string {
  return ((import.meta.env.VITE_MASTER_SHEET_ID as string | undefined) ?? '').trim()
}

/** 生效的主檔 ID:此裝置的明確設定(localStorage)優先,其次環境變數 */
export function getMasterSheetId(): string {
  return localStorage.getItem(MASTER_ID_KEY)?.trim() || getEnvMasterSheetId()
}

export function saveMasterSheetId(id: string): void {
  localStorage.setItem(MASTER_ID_KEY, id.trim())
}

/** 清除此裝置的覆寫,回到環境變數設定 */
export function clearMasterSheetIdOverride(): void {
  localStorage.removeItem(MASTER_ID_KEY)
}

/** 建立全新的系統主檔,並把目前使用者設成第一位 admin */
export async function createMasterSheet(adminEmail: string): Promise<string> {
  const { spreadsheetId } = await createSpreadsheet('廠商請款助理-系統主檔', [
    PROJECTS_TAB,
    USERS_TAB,
  ])
  await setValues(spreadsheetId, `${PROJECTS_TAB}!A1`, [PROJECT_HEADERS])
  await setValues(spreadsheetId, `${USERS_TAB}!A1`, [
    USER_HEADERS,
    [adminEmail, 'admin', '系統建立者', ''],
  ])
  return spreadsheetId
}

function toStr(v: CellValue | undefined): string {
  return v == null ? '' : String(v).trim()
}

export async function loadMasterData(masterId: string): Promise<MasterData> {
  const [projectRows, userRows, configRows] = await Promise.all([
    getValues(masterId, `${PROJECTS_TAB}!A2:E`),
    getValues(masterId, `${USERS_TAB}!A2:D`),
    // 舊版主檔沒有「設定」分頁,讀不到就當沒設定
    getValues(masterId, `${CONFIG_TAB}!A2:B`).catch(() => [] as CellValue[][]),
  ])

  const projects: Project[] = projectRows
    .filter((r) => toStr(r[0]))
    .map((r) => ({
      name: toStr(r[0]),
      sheetId: toStr(r[1]),
      driveFolderId: toStr(r[2]),
      active: toStr(r[3]) !== '停用',
      note: toStr(r[4]),
    }))

  const users: AppUser[] = userRows
    .filter((r) => toStr(r[0]))
    .map((r) => ({
      email: toStr(r[0]).toLowerCase(),
      role: toStr(r[1]) === 'admin' ? 'admin' : 'user',
      note: toStr(r[2]),
      projects: toStr(r[3])
        .split(/[、,;\s]+/)
        .map((s) => s.trim())
        .filter(Boolean),
    }))

  const kv = new Map<string, string>()
  for (const r of configRows) {
    const key = toStr(r[0])
    if (key) kv.set(key, toStr(r[1]))
  }
  const provider = kv.get('provider') ?? ''
  const model = kv.get('model') ?? ''
  const specPrompt = kv.get('specPrompt') ?? ''
  const ocrConfig: OcrConfig | null =
    provider || model || specPrompt ? { provider, model, specPrompt } : null

  return { projects, users, ocrConfig }
}

/** 儲存全域 OCR 設定(分頁不存在時自動建立) */
export async function saveOcrConfig(masterId: string, config: OcrConfig): Promise<void> {
  const meta = await getSpreadsheetMeta(masterId)
  if (!meta.sheets.some((s) => s.title === CONFIG_TAB)) {
    await batchUpdate(masterId, [
      {
        addSheet: {
          properties: { title: CONFIG_TAB, gridProperties: { frozenRowCount: 1 } },
        },
      },
    ])
    await setValues(masterId, `${CONFIG_TAB}!A1`, [CONFIG_HEADERS])
  }
  await setValues(masterId, `${CONFIG_TAB}!A2:B4`, [
    ['provider', config.provider],
    ['model', config.model],
    ['specPrompt', config.specPrompt],
  ])
}

/** 全量覆寫建案分頁(資料量小,整頁重寫最單純) */
export async function saveProjects(masterId: string, projects: Project[]): Promise<void> {
  await clearValues(masterId, `${PROJECTS_TAB}!A2:E`)
  if (projects.length === 0) return
  await appendValues(
    masterId,
    `${PROJECTS_TAB}!A1`,
    projects.map((p) => [p.name, p.sheetId, p.driveFolderId, p.active ? '啟用' : '停用', p.note]),
  )
}

/** 全量覆寫使用者分頁(同時更新表頭,讓舊主檔補上「可用建案」欄) */
export async function saveUsers(masterId: string, users: AppUser[]): Promise<void> {
  await setValues(masterId, `${USERS_TAB}!A1`, [USER_HEADERS])
  await clearValues(masterId, `${USERS_TAB}!A2:D`)
  if (users.length === 0) return
  await appendValues(
    masterId,
    `${USERS_TAB}!A1`,
    users.map((u) => [u.email, u.role, u.note, u.projects.join('、')]),
  )
}
