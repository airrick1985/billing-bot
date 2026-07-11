import { generateObject } from 'ai'
import { getModel } from './aiClient'
import { effectiveOcr } from './effectiveOcr'
import type { OcrConfig } from './google/masterSheet'
import { compressImage } from './imageCompress'
import { invoiceSchema, type Invoice } from './ocrSchema'
import { isProxyEnabled, runOcrViaProxy, type ProxyFile } from './ocrProxy'
import type { Settings } from './settings'
import type { VendorFile, VendorGroup } from './upload'

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as string)
    reader.onerror = () => reject(new Error(`讀取檔案失敗:${file.name}`))
    reader.readAsDataURL(file)
  })
}

type ImagePart = { type: 'image'; image: string }
type FilePart = { type: 'file'; data: string; mediaType: string }
type TextPart = { type: 'text'; text: string }

function isPdf(vf: VendorFile): boolean {
  return vf.file.type === 'application/pdf' || /\.pdf$/i.test(vf.name)
}

async function prepareFile(vf: VendorFile): Promise<File> {
  return isPdf(vf) ? vf.file : compressImage(vf.file)
}

async function fileToPart(vf: VendorFile): Promise<ImagePart | FilePart> {
  const dataUrl = await readFileAsDataUrl(await prepareFile(vf))
  if (isPdf(vf)) {
    return { type: 'file', data: dataUrl, mediaType: 'application/pdf' }
  }
  return { type: 'image', image: dataUrl }
}

async function fileToProxyFile(vf: VendorFile): Promise<ProxyFile> {
  const dataUrl = await readFileAsDataUrl(await prepareFile(vf))
  const m = dataUrl.match(/^data:([^;,]+);base64,(.*)$/s)
  if (!m) throw new Error(`無法編碼檔案:${vf.name}`)
  return {
    mediaType: isPdf(vf) ? 'application/pdf' : m[1],
    data: m[2],
  }
}

/** OCR 沒抓到的欄位,以總表歷史廠商資訊回填 */
function applyKnownInfo(invoice: Invoice, vendor: VendorGroup): Invoice {
  if (!vendor.known) return invoice
  const filled = { ...invoice }
  if (!filled.vendor_tax_id.trim() && filled.doc_type !== 'referral_fee') {
    filled.vendor_tax_id = vendor.known.taxId
  }
  if (!filled.vendor_contact.trim()) filled.vendor_contact = vendor.known.contact
  if (!filled.vendor_phone.trim()) filled.vendor_phone = vendor.known.phone
  return filled
}

export type OcrResult =
  | { status: 'success'; vendor: VendorGroup; invoice: Invoice }
  | { status: 'error'; vendor: VendorGroup; error: string }

export async function runOcrForVendor(
  vendor: VendorGroup,
  settings: Settings,
  ocrConfig: OcrConfig | null,
  signal?: AbortSignal,
): Promise<OcrResult> {
  // 全域設定(admin 維護)優先,未設定時退回本機 settings
  const target = effectiveOcr(settings, ocrConfig)
  const providerId = target.provider
  const apiKey = settings.providers[providerId].apiKey
  const useProxy = isProxyEnabled()

  if (!useProxy && !apiKey.trim()) {
    return { status: 'error', vendor, error: '未設定 API Key' }
  }
  if (!target.model.trim()) {
    return { status: 'error', vendor, error: '未選擇模型(請管理者到設定頁儲存全域設定)' }
  }
  if (vendor.files.length === 0) {
    return { status: 'error', vendor, error: '尚未上傳任何照片' }
  }

  const displayName =
    vendor.index > 1 ? `${vendor.displayName}(第 ${vendor.index} 筆)` : vendor.displayName

  const hintDetail = vendor.hasReferral
    ? '此資料夾檔名含「介紹費」,應為介紹費申請單(doc_type: referral_fee,無發票)'
    : '可能是發票 + 報價單/請款單,也可能是介紹費申請單(無發票),請先判斷 doc_type'
  const hint = `這是廠商「${displayName}」的請款資料(共 ${vendor.files.length} 份檔案)。${hintDetail}`

  try {
    let invoice: Invoice

    if (useProxy) {
      const files = await Promise.all(vendor.files.map(fileToProxyFile))
      invoice = await runOcrViaProxy(
        {
          provider: providerId,
          model: target.model,
          specPrompt: target.specPrompt,
          hint,
          files,
        },
        signal,
      )
    } else {
      const model = getModel(providerId, apiKey, target.model)
      const parts = await Promise.all(vendor.files.map(fileToPart))
      const userContent: (TextPart | ImagePart | FilePart)[] = [
        { type: 'text', text: `${hint}。請依系統規範抽取 JSON。` },
        ...parts,
      ]
      const { object } = await generateObject({
        model,
        schema: invoiceSchema,
        system: target.specPrompt,
        messages: [{ role: 'user', content: userContent }],
        abortSignal: signal,
      })
      invoice = object
    }

    return { status: 'success', vendor, invoice: applyKnownInfo(invoice, vendor) }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    return { status: 'error', vendor, error: msg }
  }
}
