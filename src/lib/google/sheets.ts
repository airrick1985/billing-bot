/** Google Sheets REST v4 輕量封裝,全部走使用者本人的 OAuth token。 */
import { getAccessToken } from './auth'

const BASE = 'https://sheets.googleapis.com/v4/spreadsheets'

export type CellValue = string | number

async function sheetsFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const token = await getAccessToken()
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...(init?.headers ?? {}),
    },
  })
  if (!res.ok) {
    let message = `Google Sheets API 錯誤(${res.status})`
    try {
      const body = (await res.json()) as { error?: { message?: string } }
      if (body.error?.message) message = body.error.message
    } catch {
      // 保留預設訊息
    }
    if (res.status === 403) message = `沒有這份試算表的存取權限:${message}`
    if (res.status === 404) message = '找不到試算表,請確認 ID 是否正確'
    throw new Error(message)
  }
  return (await res.json()) as T
}

function encodeRange(range: string): string {
  return encodeURIComponent(range)
}

export async function getValues(spreadsheetId: string, range: string): Promise<CellValue[][]> {
  const data = await sheetsFetch<{ values?: CellValue[][] }>(
    `/${spreadsheetId}/values/${encodeRange(range)}`,
  )
  return data.values ?? []
}

export async function setValues(
  spreadsheetId: string,
  range: string,
  values: CellValue[][],
): Promise<void> {
  await sheetsFetch(
    `/${spreadsheetId}/values/${encodeRange(range)}?valueInputOption=RAW`,
    { method: 'PUT', body: JSON.stringify({ values }) },
  )
}

export async function appendValues(
  spreadsheetId: string,
  range: string,
  values: CellValue[][],
): Promise<void> {
  await sheetsFetch(
    `/${spreadsheetId}/values/${encodeRange(range)}:append?valueInputOption=RAW&insertDataOption=INSERT_ROWS`,
    { method: 'POST', body: JSON.stringify({ values }) },
  )
}

export async function clearValues(spreadsheetId: string, range: string): Promise<void> {
  await sheetsFetch(`/${spreadsheetId}/values/${encodeRange(range)}:clear`, {
    method: 'POST',
    body: JSON.stringify({}),
  })
}

export type SheetMeta = {
  sheetId: number
  title: string
}

export async function getSpreadsheetMeta(
  spreadsheetId: string,
): Promise<{ title: string; sheets: SheetMeta[] }> {
  const data = await sheetsFetch<{
    properties: { title: string }
    sheets: { properties: { sheetId: number; title: string } }[]
  }>(`/${spreadsheetId}?fields=properties.title,sheets.properties(sheetId,title)`)
  return {
    title: data.properties.title,
    sheets: data.sheets.map((s) => s.properties),
  }
}

export async function batchUpdate(spreadsheetId: string, requests: unknown[]): Promise<void> {
  await sheetsFetch(`/${spreadsheetId}:batchUpdate`, {
    method: 'POST',
    body: JSON.stringify({ requests }),
  })
}

/** 建立新試算表(含指定分頁),回傳 spreadsheetId 與網址 */
export async function createSpreadsheet(
  title: string,
  sheetTitles: string[],
): Promise<{ spreadsheetId: string; url: string }> {
  const data = await sheetsFetch<{ spreadsheetId: string; spreadsheetUrl: string }>('', {
    method: 'POST',
    body: JSON.stringify({
      properties: { title },
      sheets: sheetTitles.map((t) => ({
        properties: { title: t, gridProperties: { frozenRowCount: 1 } },
      })),
    }),
  })
  return { spreadsheetId: data.spreadsheetId, url: data.spreadsheetUrl }
}

export function spreadsheetUrl(spreadsheetId: string): string {
  return `https://docs.google.com/spreadsheets/d/${spreadsheetId}/edit`
}

/** 從使用者貼上的網址或純 ID 中解析 spreadsheetId */
export function parseSpreadsheetId(input: string): string {
  const trimmed = input.trim()
  const m = trimmed.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/)
  if (m) return m[1]
  return trimmed
}
