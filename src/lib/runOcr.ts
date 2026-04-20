import { generateObject } from 'ai'
import { getModel } from './aiClient'
import { invoiceSchema, type Invoice } from './ocrSchema'
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

async function fileToPart(vf: VendorFile): Promise<ImagePart | FilePart> {
  const dataUrl = await readFileAsDataUrl(vf.file)
  const isPdf = vf.file.type === 'application/pdf' || /\.pdf$/i.test(vf.name)
  if (isPdf) {
    return { type: 'file', data: dataUrl, mediaType: 'application/pdf' }
  }
  return { type: 'image', image: dataUrl }
}

export type OcrResult =
  | { status: 'success'; vendor: VendorGroup; invoice: Invoice }
  | { status: 'error'; vendor: VendorGroup; error: string }

export async function runOcrForVendor(
  vendor: VendorGroup,
  settings: Settings,
  signal?: AbortSignal,
): Promise<OcrResult> {
  const providerId = settings.activeProvider
  const config = settings.providers[providerId]

  if (!config.apiKey.trim()) {
    return { status: 'error', vendor, error: '未設定 API Key' }
  }
  if (!config.model.trim()) {
    return { status: 'error', vendor, error: '未選擇模型' }
  }

  try {
    const model = getModel(providerId, config.apiKey, config.model)
    const parts = await Promise.all(vendor.files.map(fileToPart))

    const displayName =
      vendor.index > 1 ? `${vendor.displayName}(第 ${vendor.index} 筆)` : vendor.displayName

    const userContent: (TextPart | ImagePart | FilePart)[] = [
      {
        type: 'text',
        text: `這是廠商「${displayName}」的請款資料(共 ${parts.length} 份檔案),包含發票與報價單/請款單。請依系統規範抽取 JSON。`,
      },
      ...parts,
    ]

    const { object } = await generateObject({
      model,
      schema: invoiceSchema,
      system: settings.specPrompt,
      messages: [{ role: 'user', content: userContent }],
      abortSignal: signal,
    })

    return { status: 'success', vendor, invoice: object }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    return { status: 'error', vendor, error: msg }
  }
}
