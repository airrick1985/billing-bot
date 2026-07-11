/**
 * Google Identity Services(GIS)OAuth 整合。
 * - Access token 只存在記憶體,約 1 小時效期,過期時靜默續取。
 * - Client ID 來源:VITE_GOOGLE_CLIENT_ID 環境變數,或初次設定時存入 localStorage。
 */

const GSI_SRC = 'https://accounts.google.com/gsi/client'
const CLIENT_ID_KEY = 'billing-bot:google-client-id'

export const SCOPES = [
  'openid',
  'email',
  'profile',
  'https://www.googleapis.com/auth/spreadsheets',
  'https://www.googleapis.com/auth/drive.file',
].join(' ')

export type GoogleUser = {
  email: string
  name: string
  picture: string
}

type TokenResponse = {
  access_token?: string
  expires_in?: number
  error?: string
  error_description?: string
}

type TokenClient = {
  requestAccessToken: (opts?: { prompt?: string }) => void
}

type GsiOauth2 = {
  initTokenClient: (config: {
    client_id: string
    scope: string
    callback: (resp: TokenResponse) => void
    error_callback?: (err: { type?: string; message?: string }) => void
  }) => TokenClient
  revoke: (token: string, done?: () => void) => void
}

declare global {
  interface Window {
    google?: { accounts?: { oauth2?: GsiOauth2 } }
  }
}

export function getClientId(): string {
  return (
    (import.meta.env.VITE_GOOGLE_CLIENT_ID as string | undefined)?.trim() ||
    localStorage.getItem(CLIENT_ID_KEY)?.trim() ||
    ''
  )
}

export function saveClientId(id: string): void {
  localStorage.setItem(CLIENT_ID_KEY, id.trim())
}

let gsiPromise: Promise<GsiOauth2> | null = null

function loadGsi(): Promise<GsiOauth2> {
  if (gsiPromise) return gsiPromise
  gsiPromise = new Promise((resolve, reject) => {
    const existing = window.google?.accounts?.oauth2
    if (existing) return resolve(existing)
    const script = document.createElement('script')
    script.src = GSI_SRC
    script.async = true
    script.onload = () => {
      const oauth2 = window.google?.accounts?.oauth2
      if (oauth2) resolve(oauth2)
      else reject(new Error('Google 登入元件載入失敗'))
    }
    script.onerror = () => {
      gsiPromise = null
      reject(new Error('無法載入 Google 登入元件,請檢查網路'))
    }
    document.head.appendChild(script)
  })
  return gsiPromise
}

let tokenState: { token: string; expiresAt: number } | null = null

async function requestToken(prompt: '' | 'consent'): Promise<string> {
  const clientId = getClientId()
  if (!clientId) throw new Error('尚未設定 Google Client ID')
  const oauth2 = await loadGsi()
  return new Promise((resolve, reject) => {
    const client = oauth2.initTokenClient({
      client_id: clientId,
      scope: SCOPES,
      callback: (resp) => {
        if (resp.error || !resp.access_token) {
          reject(new Error(resp.error_description || resp.error || 'Google 授權失敗'))
          return
        }
        tokenState = {
          token: resp.access_token,
          // 提前 60 秒視為過期,避免請求途中失效
          expiresAt: Date.now() + (Number(resp.expires_in ?? 3600) - 60) * 1000,
        }
        resolve(resp.access_token)
      },
      error_callback: (err) => {
        reject(
          new Error(
            err.type === 'popup_closed'
              ? '登入視窗被關閉,請重試'
              : err.message || 'Google 登入失敗',
          ),
        )
      },
    })
    client.requestAccessToken({ prompt })
  })
}

/** 互動式登入(使用者按下按鈕時呼叫) */
export async function signInWithGoogle(): Promise<GoogleUser> {
  await requestToken('')
  return fetchUserInfo()
}

/** 取得有效 access token;過期時靜默續取(Google 端已授權則不會跳視窗) */
export async function getAccessToken(): Promise<string> {
  if (tokenState && Date.now() < tokenState.expiresAt) return tokenState.token
  return requestToken('')
}

export function signOutGoogle(): void {
  const token = tokenState?.token
  tokenState = null
  if (token) {
    loadGsi()
      .then((oauth2) => oauth2.revoke(token))
      .catch(() => {
        // 網路失敗時本地登出即可
      })
  }
}

async function fetchUserInfo(): Promise<GoogleUser> {
  const token = await getAccessToken()
  const res = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
    headers: { Authorization: `Bearer ${token}` },
  })
  if (!res.ok) throw new Error(`無法取得使用者資訊(${res.status})`)
  const data = (await res.json()) as { email?: string; name?: string; picture?: string }
  if (!data.email) throw new Error('Google 帳號未提供 email')
  return { email: data.email.toLowerCase(), name: data.name ?? data.email, picture: data.picture ?? '' }
}
