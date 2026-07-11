/**
 * 建案試算表:每個建案一份,結構沿用原 Excel(總表 + 各月份分頁)。
 * 總表 11 欄:原 9 欄在「廠商統編」後插入「廠商聯絡人」「連絡電話」。
 */
import { createSpreadsheet, getSpreadsheetMeta, setValues } from './sheets'

export const SUMMARY_TAB = '總表'

export const SHEET_HEADERS = [
  '請款月份',
  '建案名稱',
  '發票日期',
  '發票號碼',
  '發票金額(含稅)',
  '廠商名稱',
  '廠商統編',
  '廠商聯絡人',
  '連絡電話',
  '請款內容',
  '備註',
] as const

/** 為新建案建立試算表(總表 + 表頭),回傳 spreadsheetId */
export async function createProjectSheet(projectName: string): Promise<string> {
  const { spreadsheetId } = await createSpreadsheet(
    `${projectName}-廠商請款總表`,
    [SUMMARY_TAB],
  )
  await setValues(spreadsheetId, `${SUMMARY_TAB}!A1`, [[...SHEET_HEADERS]])
  return spreadsheetId
}

/** 驗證既有試算表可存取,且有總表分頁;回傳試算表標題 */
export async function verifyProjectSheet(
  spreadsheetId: string,
): Promise<{ title: string; hasSummary: boolean }> {
  const meta = await getSpreadsheetMeta(spreadsheetId)
  return {
    title: meta.title,
    hasSummary: meta.sheets.some((s) => s.title === SUMMARY_TAB),
  }
}
