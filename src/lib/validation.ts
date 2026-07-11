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

export function isReferral(invoice: Invoice): boolean {
  return invoice.doc_type === 'referral_fee'
}

export function validateInvoice(
  invoice: Invoice,
  vendor: VendorGroup,
  isDuplicate: boolean,
): FieldWarning[] {
  const out: FieldWarning[] = []
  const referral = isReferral(invoice)

  if (isDuplicate) {
    out.push({ field: 'invoice_no', message: '發票號碼重複(與其他廠商相同)' })
  }

  if (referral) {
    validateReferral(invoice, out)
  } else {
    if (!invoice.invoice_no) {
      out.push({ field: 'invoice_no', message: '發票號碼為空' })
    } else if (!/^[A-Z]{2}\d{8}$/.test(invoice.invoice_no)) {
      out.push({ field: 'invoice_no', message: '格式不符(應為 2 大寫字母 + 8 數字)' })
    }

    if (invoice.vendor_tax_id && !/^\d{8}$/.test(invoice.vendor_tax_id)) {
      out.push({ field: 'vendor_tax_id', message: '統編應為 8 碼純數字' })
    } else if (
      vendor.known?.taxId &&
      invoice.vendor_tax_id &&
      vendor.known.taxId !== invoice.vendor_tax_id
    ) {
      out.push({
        field: 'vendor_tax_id',
        message: `與總表歷史紀錄不符(歷史:${vendor.known.taxId})`,
      })
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
  }

  if (!invoice.invoice_date) {
    out.push({ field: 'invoice_date', message: referral ? '單據日期為空' : '發票日期為空' })
  } else if (!/^\d{4}\/\d{1,2}\/\d{1,2}$/.test(invoice.invoice_date)) {
    out.push({ field: 'invoice_date', message: '格式不符(YYYY/MM/DD)' })
  }

  if (!invoice.amount_with_tax || invoice.amount_with_tax <= 0) {
    out.push({ field: 'amount_with_tax', message: '金額為 0 或無法辨識' })
  }

  if (!invoice.vendor_name) {
    out.push({ field: 'vendor_name', message: referral ? '介紹人姓名為空' : '賣方名稱為空' })
  } else if (!vendorNameMatches(invoice.vendor_name, vendor.displayName)) {
    out.push({
      field: 'vendor_name',
      message: `與資料夾「${vendor.displayName}」不一致`,
    })
  }

  if (!referral && !vendor.hasReferral && !vendor.hasInvoice) {
    out.push({ field: 'missing_invoice', message: '資料夾缺發票圖' })
  }
  if (!referral && !vendor.hasReferral && !vendor.hasQuote) {
    out.push({ field: 'missing_quote', message: '資料夾缺報價單/請款單' })
  }

  return out
}

/** 介紹費專屬檢核:身分證字號格式、代扣所得稅 10%、健保補充保費 2.11%、實領金額算式 */
function validateReferral(invoice: Invoice, out: FieldWarning[]): void {
  const gross = invoice.amount_with_tax

  if (invoice.invoice_no) {
    out.push({ field: 'invoice_no', message: '介紹費不應有發票號碼,請確認單據類型' })
  }

  if (!invoice.payee_id_number) {
    out.push({ field: 'payee_id_number', message: '介紹人身分證字號為空' })
  } else if (!/^[A-Z][12]\d{8}$/.test(invoice.payee_id_number.toUpperCase())) {
    out.push({
      field: 'payee_id_number',
      message: '格式不符(應為 1 英文字母 + 9 數字)',
    })
  }

  if (gross > 0) {
    const expectedTax = Math.round(gross * 0.1)
    if (invoice.withholding_tax > 0 && Math.abs(invoice.withholding_tax - expectedTax) > 1) {
      out.push({
        field: 'withholding_tax',
        message: `與 10% 不符(應約 ${expectedTax.toLocaleString()})`,
      })
    }

    const expectedNhi = Math.round(gross * 0.0211)
    if (invoice.nhi_premium > 0 && Math.abs(invoice.nhi_premium - expectedNhi) > 1) {
      out.push({
        field: 'nhi_premium',
        message: `與 2.11% 不符(應約 ${expectedNhi.toLocaleString()})`,
      })
    }

    if (invoice.net_amount > 0) {
      const expectedNet = gross - invoice.withholding_tax - invoice.nhi_premium
      if (invoice.net_amount !== expectedNet) {
        out.push({
          field: 'net_amount',
          message: `總額 - 代扣 ≠ 實領(應為 ${expectedNet.toLocaleString()})`,
        })
      }
    } else {
      out.push({ field: 'net_amount', message: '實領金額為 0 或無法辨識' })
    }
  }
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
