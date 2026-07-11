/**
 * OCR Proxy(Vercel Serverless Function)。
 * - AI Provider 的 API Key 只存在伺服器環境變數,前端不接觸。
 * - 驗證:請求需帶 Google OAuth access token,且 token 的 aud 必須是本系統的 Client ID
 *   (代表使用者通過了我們的 OAuth 同意畫面/測試使用者名單)。
 *
 * Vercel 環境變數:
 *   GOOGLE_CLIENT_ID(或沿用 VITE_GOOGLE_CLIENT_ID)
 *   GEMINI_API_KEY / OPENAI_API_KEY / ANTHROPIC_API_KEY / OPENROUTER_API_KEY(至少設一個)
 */
import { generateObject } from 'ai'
import { createGoogleGenerativeAI } from '@ai-sdk/google'
import { createOpenAI } from '@ai-sdk/openai'
import { createAnthropic } from '@ai-sdk/anthropic'
import { createOpenRouter } from '@openrouter/ai-sdk-provider'
import type { LanguageModel } from 'ai'
import { invoiceSchema } from '../src/lib/ocrSchema'

export const maxDuration = 60

type ApiRequest = {
  method?: string
  headers: Record<string, string | string[] | undefined>
  body?: unknown
}
type ApiResponse = {
  status: (code: number) => ApiResponse
  json: (body: unknown) => void
  setHeader: (name: string, value: string) => void
}

type ProxyFile = { mediaType: string; data: string }
type ProxyBody = {
  provider: 'google' | 'openai' | 'anthropic' | 'openrouter'
  model: string
  specPrompt: string
  hint: string
  files: ProxyFile[]
}

const MAX_FILES = 20

function env(name: string): string {
  return (process.env[name] ?? '').trim()
}

function getServerModel(provider: ProxyBody['provider'], modelId: string): LanguageModel {
  switch (provider) {
    case 'google': {
      const apiKey = env('GEMINI_API_KEY')
      if (!apiKey) throw new Error('伺服器未設定 GEMINI_API_KEY')
      return createGoogleGenerativeAI({ apiKey })(modelId)
    }
    case 'openai': {
      const apiKey = env('OPENAI_API_KEY')
      if (!apiKey) throw new Error('伺服器未設定 OPENAI_API_KEY')
      return createOpenAI({ apiKey })(modelId)
    }
    case 'anthropic': {
      const apiKey = env('ANTHROPIC_API_KEY')
      if (!apiKey) throw new Error('伺服器未設定 ANTHROPIC_API_KEY')
      return createAnthropic({ apiKey })(modelId)
    }
    case 'openrouter': {
      const apiKey = env('OPENROUTER_API_KEY')
      if (!apiKey) throw new Error('伺服器未設定 OPENROUTER_API_KEY')
      return createOpenRouter({ apiKey })(modelId)
    }
    default:
      throw new Error(`不支援的 provider:${String(provider)}`)
  }
}

async function verifyGoogleToken(authHeader: string | undefined): Promise<string> {
  const token = (authHeader ?? '').replace(/^Bearer\s+/i, '').trim()
  if (!token) throw new Error('缺少授權 token')

  const res = await fetch(
    `https://oauth2.googleapis.com/tokeninfo?access_token=${encodeURIComponent(token)}`,
  )
  if (!res.ok) throw new Error('token 無效或已過期,請重新登入')
  const info = (await res.json()) as { aud?: string; email?: string }

  const clientId = env('GOOGLE_CLIENT_ID') || env('VITE_GOOGLE_CLIENT_ID')
  if (!clientId) throw new Error('伺服器未設定 GOOGLE_CLIENT_ID')
  if (info.aud !== clientId) throw new Error('token 不屬於本系統')
  return info.email ?? ''
}

function parseBody(body: unknown): ProxyBody {
  const b = body as Partial<ProxyBody> | undefined
  if (!b || typeof b !== 'object') throw new Error('請求格式錯誤')
  if (!b.provider || !b.model || !Array.isArray(b.files)) throw new Error('缺少必要欄位')
  if (b.files.length === 0) throw new Error('沒有檔案')
  if (b.files.length > MAX_FILES) throw new Error(`檔案數量超過上限(${MAX_FILES})`)
  for (const f of b.files) {
    if (typeof f?.mediaType !== 'string' || typeof f?.data !== 'string') {
      throw new Error('檔案格式錯誤')
    }
  }
  return {
    provider: b.provider,
    model: String(b.model),
    specPrompt: String(b.specPrompt ?? ''),
    hint: String(b.hint ?? ''),
    files: b.files,
  }
}

export default async function handler(req: ApiRequest, res: ApiResponse): Promise<void> {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' })
    return
  }

  try {
    const authHeader = Array.isArray(req.headers.authorization)
      ? req.headers.authorization[0]
      : req.headers.authorization
    await verifyGoogleToken(authHeader)
  } catch (err) {
    res.status(401).json({ error: err instanceof Error ? err.message : '未授權' })
    return
  }

  let body: ProxyBody
  try {
    body = parseBody(req.body)
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : '請求格式錯誤' })
    return
  }

  try {
    const model = getServerModel(body.provider, body.model)

    const content: Array<
      | { type: 'text'; text: string }
      | { type: 'image'; image: string }
      | { type: 'file'; data: string; mediaType: string }
    > = [{ type: 'text', text: `${body.hint}。請依系統規範抽取 JSON。` }]

    for (const f of body.files) {
      const dataUrl = `data:${f.mediaType};base64,${f.data}`
      if (f.mediaType === 'application/pdf') {
        content.push({ type: 'file', data: dataUrl, mediaType: 'application/pdf' })
      } else {
        content.push({ type: 'image', image: dataUrl })
      }
    }

    const { object } = await generateObject({
      model,
      schema: invoiceSchema,
      system: body.specPrompt,
      messages: [{ role: 'user', content }],
    })

    res.status(200).json({ invoice: object })
  } catch (err) {
    res.status(502).json({ error: err instanceof Error ? err.message : 'OCR 執行失敗' })
  }
}
