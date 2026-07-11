/**
 * 照片歸檔:寫入 Google Sheet 成功後,把照片依
 * 「建案資料夾 / 年月 / 廠商」路徑上傳 Drive,
 * 檔名 = 請款日期-廠商名稱-請款內容-照片種類.副檔名
 */
import { ensureFolderPath, sanitizeName, uploadFileToFolder } from './google/drive'
import type { Invoice } from './ocrSchema'
import type { FileKind, VendorFile, VendorGroup } from './upload'

const KIND_LABEL: Record<FileKind, string> = {
  invoice: '發票',
  quote: '請款單',
  referral: '介紹費申請單',
  unknown: '附件',
}

export function photoFilename(
  invoice: Invoice,
  vendorName: string,
  vf: VendorFile,
  seq: number,
): string {
  const date = invoice.invoice_date.trim().replaceAll('/', '-') || '未知日期'
  const content = sanitizeName(invoice.billing_content).slice(0, 20) || '請款'
  const ext = vf.name.match(/\.[^.]+$/)?.[0]?.toLowerCase() ?? ''
  const kind = KIND_LABEL[vf.kind]
  const suffix = seq > 1 ? `(${seq})` : ''
  return `${date}-${sanitizeName(vendorName)}-${content}-${kind}${suffix}${ext}`
}

export type ArchiveOutcome = {
  uploaded: number
  errors: string[]
}

/** 上傳單一廠商的所有照片,個別失敗不中斷 */
export async function archiveVendorPhotos(
  rootFolderId: string,
  monthName: string,
  vendor: VendorGroup,
  invoice: Invoice,
): Promise<ArchiveOutcome> {
  const displayName =
    vendor.index > 1 ? `${vendor.displayName}(第 ${vendor.index} 筆)` : vendor.displayName
  const folderId = await ensureFolderPath(rootFolderId, [monthName, displayName])

  const kindSeq = new Map<FileKind, number>()
  let uploaded = 0
  const errors: string[] = []
  for (const vf of vendor.files) {
    const seq = (kindSeq.get(vf.kind) ?? 0) + 1
    kindSeq.set(vf.kind, seq)
    try {
      await uploadFileToFolder(folderId, photoFilename(invoice, vendor.displayName, vf, seq), vf.file)
      uploaded += 1
    } catch (err) {
      errors.push(`${vf.name}:${err instanceof Error ? err.message : String(err)}`)
    }
  }
  return { uploaded, errors }
}
