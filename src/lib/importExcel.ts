/**
 * 舊 Excel 匯入:解析原本系統匯出的 .xlsx(9 欄舊版或 11 欄新版),
 * 統一轉成 11 欄列,供寫入建案 Google Sheet。
 */
import * as XLSX from 'xlsx'

export type ImportRow = (string | number)[]

export type ImportParseResult = {
  rows: ImportRow[]
  sheetUsed: string
  wasLegacy9Col: boolean
}

const SUMMARY_SHEET = '總表'
const NEW_COL_HEADER = '廠商聯絡人'

export async function parseImportFile(file: File): Promise<ImportParseResult> {
  const wb = XLSX.read(await file.arrayBuffer(), { type: 'array' })
  const sheetUsed = wb.SheetNames.includes(SUMMARY_SHEET) ? SUMMARY_SHEET : wb.SheetNames[0]
  if (!sheetUsed) throw new Error('Excel 檔沒有任何工作表')

  const aoa = XLSX.utils.sheet_to_json<ImportRow>(wb.Sheets[sheetUsed], {
    header: 1,
    defval: '',
  })
  if (aoa.length < 2) throw new Error(`「${sheetUsed}」沒有資料列`)

  const header = aoa[0].map((c) => String(c ?? '').trim())
  const wasLegacy9Col = !header.includes(NEW_COL_HEADER)

  const rows: ImportRow[] = []
  for (const raw of aoa.slice(1)) {
    if (!raw.some((c) => c !== '' && c != null)) continue
    const cells = raw.map((c) => (typeof c === 'number' ? c : String(c ?? '').trim()))
    // 舊 9 欄:在「廠商統編」(index 6)後補上聯絡人、電話兩個空欄
    const normalized = wasLegacy9Col
      ? [...cells.slice(0, 7), '', '', ...cells.slice(7)]
      : cells
    // 補齊 / 截斷到 11 欄
    while (normalized.length < 11) normalized.push('')
    rows.push(normalized.slice(0, 11))
  }
  if (rows.length === 0) throw new Error(`「${sheetUsed}」沒有可匯入的資料`)

  return { rows, sheetUsed, wasLegacy9Col }
}
