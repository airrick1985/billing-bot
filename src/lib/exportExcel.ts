import * as XLSX from 'xlsx'
import type { OcrResult } from './runOcr'
import type { BillingPeriod, ParsedUpload } from './upload'
import { validateInvoice } from './validation'

const HEADERS = [
  '請款月份',
  '建案名稱',
  '發票日期',
  '發票號碼',
  '發票金額(含稅)',
  '廠商名稱',
  '廠商統編',
  '請款內容',
  '備註',
] as const

const SUMMARY_SHEET = '總表'
const INVOICE_NO_COL = 3
const COL_WIDTHS = [12, 14, 12, 14, 14, 22, 12, 32, 40]

export type Row = (string | number)[]

function periodLabel(p: BillingPeriod): string {
  if (p.year && p.month) return `${p.year}年${p.month}月`
  return p.raw || '未知月份'
}

function buildRow(
  periodStr: string,
  projectName: string,
  result: OcrResult,
  invoiceNoCounts: Map<string, number>,
): Row {
  if (result.status === 'error') {
    const name =
      result.vendor.index > 1
        ? `${result.vendor.displayName}(第 ${result.vendor.index} 筆)`
        : result.vendor.displayName
    return [periodStr, projectName, '', '', '', name, '', '', `OCR 失敗:${result.error}`]
  }

  const { vendor, invoice } = result
  const no = invoice.invoice_no.trim()
  const isDup = (invoiceNoCounts.get(no) ?? 0) > 1
  const warnings = validateInvoice(invoice, vendor, isDup)

  const parts: string[] = []
  if (invoice.notes.trim()) parts.push(invoice.notes.trim())
  for (const w of warnings) {
    if (w.field === 'missing_invoice' || w.field === 'missing_quote') {
      parts.push(w.message)
    } else if (w.field === 'invoice_no' && w.message.includes('重複')) {
      parts.push('⚠ 發票號重複')
    } else if (w.field === 'quoted_amount') {
      parts.push(w.message)
    } else if (w.field === 'vendor_name' && w.message.includes('不一致')) {
      parts.push(w.message)
    }
  }

  return [
    periodStr,
    projectName,
    invoice.invoice_date,
    invoice.invoice_no,
    invoice.amount_with_tax,
    invoice.vendor_name,
    invoice.vendor_tax_id,
    invoice.billing_content,
    Array.from(new Set(parts)).join('；'),
  ]
}

function makeSheet(rows: Row[]): XLSX.WorkSheet {
  const aoa: (string | number)[][] = [HEADERS as unknown as string[], ...rows]
  const ws = XLSX.utils.aoa_to_sheet(aoa)
  ws['!cols'] = COL_WIDTHS.map((w) => ({ wch: w }))
  ws['!freeze'] = { xSplit: 0, ySplit: 1 } as unknown as XLSX.WorkSheet['!freeze']
  return ws
}

function sanitizeSheetName(name: string): string {
  return name.replace(/[\\/?*[\]:]/g, '_').slice(0, 31)
}

function buildNewRows(
  parsed: ParsedUpload,
  results: OcrResult[],
  projectName: string,
): Row[] {
  const invoiceNoCounts = new Map<string, number>()
  for (const r of results) {
    if (r.status !== 'success') continue
    const no = r.invoice.invoice_no.trim()
    if (!no) continue
    invoiceNoCounts.set(no, (invoiceNoCounts.get(no) ?? 0) + 1)
  }
  const periodStr = periodLabel(parsed.period)
  return results.map((r) => buildRow(periodStr, projectName, r, invoiceNoCounts))
}

function invoiceNoOf(row: Row): string {
  const v = row[INVOICE_NO_COL]
  return typeof v === 'string' ? v.trim() : String(v ?? '').trim()
}

function sheetToRows(ws: XLSX.WorkSheet): Row[] {
  const aoa = XLSX.utils.sheet_to_json<Row>(ws, { header: 1, defval: '' }) as Row[]
  return aoa.slice(1).filter((r) => r.length > 0 && r.some((c) => c !== '' && c != null))
}

export function exportToExcel(
  parsed: ParsedUpload,
  results: OcrResult[],
  projectName: string,
): void {
  const rows = buildNewRows(parsed, results, projectName)

  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, makeSheet(rows), SUMMARY_SHEET)

  const byPeriod = new Map<string, Row[]>()
  for (const row of rows) {
    const key = String(row[0] || '未知月份')
    const bucket = byPeriod.get(key) ?? []
    bucket.push(row)
    byPeriod.set(key, bucket)
  }
  for (const [name, bucket] of byPeriod) {
    const sheetName = sanitizeSheetName(name)
    if (sheetName === SUMMARY_SHEET) continue
    XLSX.utils.book_append_sheet(wb, makeSheet(bucket), sheetName)
  }

  const filename = `${projectName || '廠商請款'}-廠商請款總表.xlsx`
  XLSX.writeFile(wb, filename, { compression: true })
}

export type DuplicateInfo = {
  invoiceNo: string
  newVendor: string
  existingVendor: string
}

export type MergePlan = {
  filename: string
  newRows: Row[]
  monthSheetName: string
  monthSheetExists: boolean
  existingMonthRowCount: number
  duplicates: DuplicateInfo[]
}

export type MergeChoices = {
  duplicateAction: 'skip' | 'overwrite'
  monthAction: 'overwrite' | 'merge'
}

export async function analyzeMerge(
  file: File,
  parsed: ParsedUpload,
  results: OcrResult[],
  projectName: string,
): Promise<{ plan: MergePlan; workbook: XLSX.WorkBook }> {
  const buf = await file.arrayBuffer()
  const wb = XLSX.read(buf, { type: 'array' })

  const newRows = buildNewRows(parsed, results, projectName)
  const monthSheetName = sanitizeSheetName(periodLabel(parsed.period))

  const summaryWs = wb.Sheets[SUMMARY_SHEET]
  const summaryRows: Row[] = summaryWs ? sheetToRows(summaryWs) : []

  const existingByInvoiceNo = new Map<string, Row>()
  for (const r of summaryRows) {
    const no = invoiceNoOf(r)
    if (no) existingByInvoiceNo.set(no, r)
  }

  const duplicates: DuplicateInfo[] = []
  for (const r of newRows) {
    const no = invoiceNoOf(r)
    if (!no) continue
    const existing = existingByInvoiceNo.get(no)
    if (existing) {
      duplicates.push({
        invoiceNo: no,
        newVendor: String(r[5] ?? ''),
        existingVendor: String(existing[5] ?? ''),
      })
    }
  }

  const monthWs = wb.Sheets[monthSheetName]
  const monthExistingRows = monthWs ? sheetToRows(monthWs) : []

  const plan: MergePlan = {
    filename: file.name,
    newRows,
    monthSheetName,
    monthSheetExists: !!monthWs && monthSheetName !== SUMMARY_SHEET,
    existingMonthRowCount: monthExistingRows.length,
    duplicates,
  }

  return { plan, workbook: wb }
}

export type MergeResult = {
  summaryAdded: number
  summaryReplaced: number
  summarySkipped: number
  monthAction: 'created' | 'overwritten' | 'merged'
  monthAdded: number
  monthSkipped: number
}

export function executeMerge(
  wb: XLSX.WorkBook,
  plan: MergePlan,
  choices: MergeChoices,
  projectName: string,
): MergeResult {
  const { newRows, monthSheetName } = plan

  const summaryWs = wb.Sheets[SUMMARY_SHEET]
  const summaryRows: Row[] = summaryWs ? sheetToRows(summaryWs) : []
  const summaryIndex = new Map<string, number>()
  summaryRows.forEach((r, i) => {
    const no = invoiceNoOf(r)
    if (no) summaryIndex.set(no, i)
  })

  let summaryAdded = 0
  let summaryReplaced = 0
  let summarySkipped = 0
  for (const r of newRows) {
    const no = invoiceNoOf(r)
    const hit = no ? summaryIndex.get(no) : undefined
    if (hit !== undefined) {
      if (choices.duplicateAction === 'overwrite') {
        summaryRows[hit] = r
        summaryReplaced++
      } else {
        summarySkipped++
      }
    } else {
      summaryRows.push(r)
      if (no) summaryIndex.set(no, summaryRows.length - 1)
      summaryAdded++
    }
  }

  if (summaryWs) delete wb.Sheets[SUMMARY_SHEET]
  const newSummarySheet = makeSheet(summaryRows)
  const sheetNames = wb.SheetNames
  const summaryIdx = sheetNames.indexOf(SUMMARY_SHEET)
  if (summaryIdx >= 0) {
    wb.Sheets[SUMMARY_SHEET] = newSummarySheet
  } else {
    wb.SheetNames.unshift(SUMMARY_SHEET)
    wb.Sheets[SUMMARY_SHEET] = newSummarySheet
  }

  let monthAction: MergeResult['monthAction'] = 'created'
  let monthAdded = 0
  let monthSkipped = 0

  if (!plan.monthSheetExists) {
    if (monthSheetName && monthSheetName !== SUMMARY_SHEET) {
      XLSX.utils.book_append_sheet(wb, makeSheet(newRows), monthSheetName)
      monthAction = 'created'
      monthAdded = newRows.length
    }
  } else if (choices.monthAction === 'overwrite') {
    delete wb.Sheets[monthSheetName]
    wb.Sheets[monthSheetName] = makeSheet(newRows)
    monthAction = 'overwritten'
    monthAdded = newRows.length
  } else {
    const existing = sheetToRows(wb.Sheets[monthSheetName])
    const existingIdx = new Map<string, number>()
    existing.forEach((r, i) => {
      const no = invoiceNoOf(r)
      if (no) existingIdx.set(no, i)
    })
    for (const r of newRows) {
      const no = invoiceNoOf(r)
      const hit = no ? existingIdx.get(no) : undefined
      if (hit !== undefined) {
        if (choices.duplicateAction === 'overwrite') {
          existing[hit] = r
          monthAdded++
        } else {
          monthSkipped++
        }
      } else {
        existing.push(r)
        if (no) existingIdx.set(no, existing.length - 1)
        monthAdded++
      }
    }
    delete wb.Sheets[monthSheetName]
    wb.Sheets[monthSheetName] = makeSheet(existing)
    monthAction = 'merged'
  }

  const outName =
    plan.filename || `${projectName || '廠商請款'}-廠商請款總表.xlsx`
  XLSX.writeFile(wb, outName, { compression: true })

  return { summaryAdded, summaryReplaced, summarySkipped, monthAction, monthAdded, monthSkipped }
}
