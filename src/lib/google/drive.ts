/**
 * Google Drive 照片歸檔(drive.file scope:只能存取由本 app 建立的檔案/資料夾)。
 * 路徑結構:建案資料夾 / 年月 / 廠商名稱 / 照片
 */
import { getAccessToken } from './auth'

const FILES_URL = 'https://www.googleapis.com/drive/v3/files'
const UPLOAD_URL = 'https://www.googleapis.com/upload/drive/v3/files'

async function driveFetch<T>(url: string, init?: RequestInit): Promise<T> {
  const token = await getAccessToken()
  const res = await fetch(url, {
    ...init,
    headers: { Authorization: `Bearer ${token}`, ...(init?.headers ?? {}) },
  })
  if (!res.ok) {
    let message = `Google Drive API 錯誤(${res.status})`
    try {
      const body = (await res.json()) as { error?: { message?: string } }
      if (body.error?.message) message = body.error.message
    } catch {
      // 保留預設訊息
    }
    if (res.status === 404) {
      message = '找不到資料夾。注意:Drive 資料夾必須由本系統建立才有存取權(在管理後台按「建立資料夾」)'
    }
    throw new Error(message)
  }
  return (await res.json()) as T
}

export async function createFolder(name: string, parentId?: string): Promise<string> {
  const data = await driveFetch<{ id: string }>(FILES_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name,
      mimeType: 'application/vnd.google-apps.folder',
      ...(parentId ? { parents: [parentId] } : {}),
    }),
  })
  return data.id
}

async function findChildFolder(parentId: string, name: string): Promise<string | null> {
  const q = [
    `name = '${name.replace(/'/g, "\\'")}'`,
    `'${parentId}' in parents`,
    `mimeType = 'application/vnd.google-apps.folder'`,
    'trashed = false',
  ].join(' and ')
  const data = await driveFetch<{ files: { id: string }[] }>(
    `${FILES_URL}?q=${encodeURIComponent(q)}&fields=files(id)&pageSize=1`,
  )
  return data.files[0]?.id ?? null
}

/** 逐層找或建資料夾,回傳最深層的資料夾 ID */
export async function ensureFolderPath(rootId: string, segments: string[]): Promise<string> {
  let parent = rootId
  for (const seg of segments) {
    const name = sanitizeName(seg)
    parent = (await findChildFolder(parent, name)) ?? (await createFolder(name, parent))
  }
  return parent
}

/** multipart/related 上傳檔案到指定資料夾 */
export async function uploadFileToFolder(
  folderId: string,
  filename: string,
  file: File,
): Promise<string> {
  const boundary = 'billing_bot_upload_boundary'
  const metadata = { name: sanitizeName(filename), parents: [folderId] }
  const body = new Blob(
    [
      `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n`,
      JSON.stringify(metadata),
      `\r\n--${boundary}\r\nContent-Type: ${file.type || 'application/octet-stream'}\r\n\r\n`,
      file,
      `\r\n--${boundary}--`,
    ],
    { type: `multipart/related; boundary=${boundary}` },
  )
  const data = await driveFetch<{ id: string }>(`${UPLOAD_URL}?uploadType=multipart&fields=id`, {
    method: 'POST',
    headers: { 'Content-Type': `multipart/related; boundary=${boundary}` },
    body,
  })
  return data.id
}

/** 去除 Drive/檔案系統不允許或易出問題的字元 */
export function sanitizeName(name: string): string {
  return name.replace(/[\\/:*?"<>|]/g, '_').replace(/\s+/g, ' ').trim() || '未命名'
}

export function folderUrl(id: string): string {
  return `https://drive.google.com/drive/folders/${id}`
}
