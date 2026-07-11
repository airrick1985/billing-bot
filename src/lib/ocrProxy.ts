/**
 * OCR Proxy 前端:部署時設 VITE_OCR_PROXY_URL(例如 /api/ocr),
 * OCR 改走後端,API Key 由伺服器環境變數保管,前端不再需要輸入。
 */
import { getAccessToken } from './google/auth'
import { invoiceSchema, type Invoice } from './ocrSchema'
import type { ProviderId } from './providers'

export function getProxyUrl(): string {
  return ((import.meta.env.VITE_OCR_PROXY_URL as string | undefined) ?? '').trim()
}

export function isProxyEnabled(): boolean {
  return getProxyUrl() !== ''
}

export type ProxyFile = {
  /** MIME type,如 image/jpeg、application/pdf */
  mediaType: string
  /** base64(不含 data: 前綴) */
  data: string
}

export type ProxyRequest = {
  provider: ProviderId
  model: string
  specPrompt: string
  hint: string
  files: ProxyFile[]
}

export async function runOcrViaProxy(
  params: ProxyRequest,
  signal?: AbortSignal,
): Promise<Invoice> {
  const token = await getAccessToken()
  const res = await fetch(getProxyUrl(), {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(params),
    signal,
  })

  let data: unknown
  try {
    data = await res.json()
  } catch {
    throw new Error(`OCR Proxy 回應異常(${res.status})`)
  }

  if (!res.ok) {
    const err = (data as { error?: string }).error
    throw new Error(err || `OCR Proxy 錯誤(${res.status})`)
  }

  const parsed = invoiceSchema.safeParse((data as { invoice?: unknown }).invoice)
  if (!parsed.success) {
    throw new Error('OCR Proxy 回傳的資料格式不符')
  }
  return parsed.data
}
