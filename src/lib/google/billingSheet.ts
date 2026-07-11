/**
 * 建案試算表的請款資料讀寫:
 * - 廠商目錄:從總表彙整歷史請款廠商(名稱/統編/聯絡人/電話)
 * - 跨月發票號查重
 * - 寫入:append 到總表,月份分頁不存在時自動建立
 */
import {
  appendValues,
  batchUpdate,
  getSpreadsheetMeta,
  getValues,
  setValues,
  type CellValue,
} from './sheets'
import { SHEET_HEADERS, SUMMARY_TAB } from './projectSheet'

export type VendorInfo = {
  name: string
  taxId: string
  contact: string
  phone: string
  lastPeriod: string
  count: number
}

function str(v: CellValue | undefined): string {
  return v == null ? '' : String(v).trim()
}

/** 從總表彙整歷史廠商;同名多筆時,越晚的列(越新)非空值優先 */
export async function readVendorDirectory(sheetId: string): Promise<VendorInfo[]> {
  const rows = await getValues(sheetId, `${SUMMARY_TAB}!A2:K`)
  const map = new Map<string, VendorInfo>()
  for (const r of rows) {
    const name = str(r[5])
    if (!name) continue
    const cur =
      map.get(name) ?? { name, taxId: '', contact: '', phone: '', lastPeriod: '', count: 0 }
    cur.count += 1
    if (str(r[0])) cur.lastPeriod = str(r[0])
    if (str(r[6])) cur.taxId = str(r[6])
    if (str(r[7])) cur.contact = str(r[7])
    if (str(r[8])) cur.phone = str(r[8])
    map.set(name, cur)
  }
  return [...map.values()].sort((a, b) => a.name.localeCompare(b.name, 'zh-TW'))
}

/** 總表既有的發票號碼集合(跨月查重用) */
export async function readExistingInvoiceNos(sheetId: string): Promise<Set<string>> {
  const rows = await getValues(sheetId, `${SUMMARY_TAB}!D2:D`)
  const set = new Set<string>()
  for (const r of rows) {
    const no = str(r[0])
    if (no) set.add(no)
  }
  return set
}

const AUDIT_TAB = '操作紀錄'

/** 寫進隱藏的「操作紀錄」分頁;失敗不拋錯(紀錄不該擋住主流程) */
export async function appendAuditLog(
  sheetId: string,
  entry: { user: string; action: string; detail: string },
): Promise<void> {
  try {
    const meta = await getSpreadsheetMeta(sheetId)
    if (!meta.sheets.some((s) => s.title === AUDIT_TAB)) {
      await batchUpdate(sheetId, [
        {
          addSheet: {
            properties: {
              title: AUDIT_TAB,
              hidden: true,
              gridProperties: { frozenRowCount: 1 },
            },
          },
        },
      ])
      await setValues(sheetId, `${AUDIT_TAB}!A1`, [['時間', '使用者', '動作', '明細']])
    }
    await appendValues(sheetId, `${AUDIT_TAB}!A1`, [
      [new Date().toLocaleString('zh-TW'), entry.user, entry.action, entry.detail],
    ])
  } catch {
    // 紀錄失敗不影響主流程
  }
}

export type AppendResult = {
  added: number
  monthSheetCreated: boolean
}

/** 月份分頁不存在時建立(含表頭);回傳是否新建 */
export async function ensureMonthTab(sheetId: string, monthName: string): Promise<boolean> {
  const meta = await getSpreadsheetMeta(sheetId)
  if (meta.sheets.some((s) => s.title === monthName)) return false
  await batchUpdate(sheetId, [
    {
      addSheet: {
        properties: { title: monthName, gridProperties: { frozenRowCount: 1 } },
      },
    },
  ])
  await setValues(sheetId, `${monthName}!A1`, [[...SHEET_HEADERS]])
  return true
}

/** 寫入:總表 append + 月份分頁(不存在自動建立)append */
export async function appendBillingRows(
  sheetId: string,
  monthName: string,
  rows: CellValue[][],
): Promise<AppendResult> {
  if (rows.length === 0) return { added: 0, monthSheetCreated: false }

  await appendValues(sheetId, `${SUMMARY_TAB}!A1`, rows)

  let monthSheetCreated = false
  if (monthName && monthName !== SUMMARY_TAB) {
    monthSheetCreated = await ensureMonthTab(sheetId, monthName)
    await appendValues(sheetId, `${monthName}!A1`, rows)
  }

  return { added: rows.length, monthSheetCreated }
}

/** 匯入舊資料:總表 append + 依月份分組寫入各月份分頁 */
export async function importRows(
  sheetId: string,
  rows: CellValue[][],
): Promise<{ added: number; monthsTouched: string[] }> {
  if (rows.length === 0) return { added: 0, monthsTouched: [] }

  await appendValues(sheetId, `${SUMMARY_TAB}!A1`, rows)

  const byMonth = new Map<string, CellValue[][]>()
  for (const r of rows) {
    const month = String(r[0] ?? '').trim()
    if (!month || month === SUMMARY_TAB) continue
    const bucket = byMonth.get(month) ?? []
    bucket.push(r)
    byMonth.set(month, bucket)
  }
  for (const [month, bucket] of byMonth) {
    await ensureMonthTab(sheetId, month)
    await appendValues(sheetId, `${month}!A1`, bucket)
  }

  return { added: rows.length, monthsTouched: [...byMonth.keys()] }
}
