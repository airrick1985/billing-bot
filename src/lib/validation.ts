import type { Invoice } from './ocrSchema'
import type { VendorGroup } from './upload'

export type WarningKey =
  | keyof Invoice
  | 'missing_invoice'
  | 'missing_quote'

export type FieldWarning = {
  field: WarningKey
  message: string
}

export function validateInvoice(
  invoice: Invoice,
  vendor: VendorGroup,
  isDuplicate: boolean,
): FieldWarning[] {
  const out: FieldWarning[] = []

  if (isDuplicate) {
    out.push({ field: 'invoice_no', message: '發票號碼重複(與其他廠商相同)' })
  }

  if (!invoice.invoice_no) {
    out.push({ field: 'invoice_no', message: '發票號碼為空' })
  } else if (!/^[A-Z]{2}\d{8}$/.test(invoice.invoice_no)) {
    out.push({ field: 'invoice_no', message: '格式不符(應為 2 大寫字母 + 8 數字)' })
  }

  if (!invoice.invoice_date) {
    out.push({ field: 'invoice_date', message: '發票日期為空' })
  } else if (!/^\d{4}\/\d{1,2}\/\d{1,2}$/.test(invoice.invoice_date)) {
    out.push({ field: 'invoice_date', message: '格式不符(YYYY/MM/DD)' })
  }

  if (invoice.vendor_tax_id && !/^\d{8}$/.test(invoice.vendor_tax_id)) {
    out.push({ field: 'vendor_tax_id', message: '統編應為 8 碼純數字' })
  }

  if (!invoice.amount_with_tax || invoice.amount_with_tax <= 0) {
    out.push({ field: 'amount_with_tax', message: '金額為 0 或無法辨識' })
  }

  if (
    invoice.quoted_amount > 0 &&
    invoice.amount_with_tax > 0 &&
    invoice.quoted_amount !== invoice.amount_with_tax
  ) {
    out.push({
      field: 'quoted_amount',
      message: `報價 ${invoice.quoted_amount.toLocaleString()} ≠ 發票 ${invoice.amount_with_tax.toLocaleString()}`,
    })
  }

  if (!invoice.vendor_name) {
    out.push({ field: 'vendor_name', message: '賣方名稱為空' })
  } else if (!vendorNameMatches(invoice.vendor_name, vendor.displayName)) {
    out.push({
      field: 'vendor_name',
      message: `與資料夾「${vendor.displayName}」不一致`,
    })
  }

  if (!vendor.hasInvoice) {
    out.push({ field: 'missing_invoice', message: '資料夾缺發票圖' })
  }
  if (!vendor.hasQuote) {
    out.push({ field: 'missing_quote', message: '資料夾缺報價單/請款單' })
  }

  return out
}

function vendorNameMatches(a: string, b: string): boolean {
  const norm = (s: string) =>
    s
      .replace(/\s+/g, '')
      .replace(/(有限公司|股份有限公司|企業社|工作室|商行|行)$/g, '')
  const na = norm(a)
  const nb = norm(b)
  if (!na || !nb) return true
  return na === nb || na.includes(nb) || nb.includes(na)
}

export function isDuplicateWarning(w: FieldWarning): boolean {
  return w.field === 'invoice_no' && w.message.includes('重複')
}
