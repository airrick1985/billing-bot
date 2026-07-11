import { PROVIDERS, type ProviderId } from './providers'

export const STORAGE_KEY = 'billing-bot:settings:v2'
const OLD_STORAGE_KEY = 'billing-bot:settings:v1'

/** v1 預設 prompt:載入時若使用者仍存著舊版預設文字,自動升級成新版 DEFAULT_SPEC_PROMPT */
const LEGACY_SPEC_PROMPT_V1 = `你是台灣統一發票與報價單的資料抽取助手。
給你一組圖片(同一筆請款的「發票」與「報價單/請款單」),請輸出嚴格 JSON:

{
  "invoice_date": "YYYY/MM/DD",          // 發票開立日期,民國年轉西元
  "invoice_no": "XX12345678",            // 發票號碼,2 英文字母 + 8 數字
  "amount_with_tax": 0,                  // 發票總計(含稅),純整數
  "vendor_name": "xxx有限公司",          // 發票賣方名稱
  "vendor_tax_id": "12345678",           // 賣方統編 8 碼
  "billing_content": "項目摘要",         // 報價單/請款單主要品項,簡短
  "quoted_amount": 0,                    // 報價單寫的金額(若有)
  "notes": ""                            // 異常說明,無則留空
}

規則:
- 所有金額純整數,無千分位、無幣別符號
- 發票號碼不含 "-"
- 若資料無法辨識,該欄填空字串,並在 notes 說明
- 若報價單金額 ≠ 發票含稅金額,在 notes 填 "報價單金額不符:{值}"
- 只輸出 JSON,不要 markdown code block

billing_content 撰寫規範:
- 必須包含「期間」資訊:如租期、廣告檔期、服務期間(例:租期 2026/03/01~2026/04/30、廣告檔期 3 個月、服務期間 1 年)
- 必須包含「數量」資訊:如座數、檔次、單位數(例:10 座、x2 檔、共 5 件)
- 不要列出尺寸、體積、容量等規格參數(例:不要寫 30cm x 40cm、500ml、2L)
- 格式建議:「品項 + 期間 + 數量」簡潔一句,例:「T-Bar 廣告看板租賃 2026/03/01~2026/04/30 共 10 座」`

/** v2 預設 prompt(含介紹費、無聯絡人欄位),同樣支援自動升級 */
const LEGACY_SPEC_PROMPT_V2 = `你是台灣建設公司請款單據的資料抽取助手。
給你一組圖片(同一筆請款的單據),請先判斷單據類型再輸出嚴格 JSON:

單據類型判斷(doc_type):
- "invoice":一般廠商請款,有統一發票(通常搭配報價單/請款單)
- "referral_fee":介紹費申請單(付給個人的介紹費,「沒有」發票與統編,表格上有介紹人、身分證字號、代扣所得稅、健保補充保費、實領金額等欄位)

{
  "doc_type": "invoice",                 // 或 "referral_fee"
  "invoice_date": "YYYY/MM/DD",          // 發票開立日期,民國年轉西元;介紹費填申請單日期,無則填簽約日期
  "invoice_no": "XX12345678",            // 發票號碼,2 英文字母 + 8 數字;介紹費留空
  "amount_with_tax": 0,                  // 發票總計(含稅),純整數;介紹費填介紹費總額(未扣稅前)
  "vendor_name": "xxx有限公司",          // 發票賣方名稱;介紹費填介紹人姓名
  "vendor_tax_id": "12345678",           // 賣方統編 8 碼;介紹費留空
  "payee_id_number": "",                 // 介紹費:介紹人身分證字號(1 英文字母 + 9 數字);其他留空
  "billing_content": "項目摘要",         // 主要品項,簡短
  "quoted_amount": 0,                    // 報價單寫的金額(若有);介紹費填 0
  "withholding_tax": 0,                  // 介紹費:代扣所得稅(通常 10%);其他填 0
  "nhi_premium": 0,                      // 介紹費:代扣二代健保補充保費(通常 2.11%);其他填 0
  "net_amount": 0,                       // 介紹費:實領金額;其他填 0
  "notes": ""                            // 異常說明,無則留空
}

規則:
- 所有金額純整數,無千分位、無幣別符號
- 發票號碼不含 "-"
- 若資料無法辨識,該欄填空字串,並在 notes 說明
- 若報價單金額 ≠ 發票含稅金額,在 notes 填 "報價單金額不符:{值}"
- 介紹費:檢查「總額 - 代扣所得稅 - 健保補充保費 = 實領金額」,不符時在 notes 說明
- 只輸出 JSON,不要 markdown code block

billing_content 撰寫規範:
- 一般發票:必須包含「期間」(例:租期 2026/03/01~2026/04/30、廣告檔期 3 個月)與「數量」(例:10 座、x2 檔);不要列尺寸、體積、容量等規格
  格式建議:「品項 + 期間 + 數量」簡潔一句,例:「T-Bar 廣告看板租賃 2026/03/01~2026/04/30 共 10 座」
- 介紹費:寫「介紹費 - 棟別 + 客戶姓名」,例:「介紹費 - A5-10F 客戶張郁杰」`

export const DEFAULT_SPEC_PROMPT = `你是台灣建設公司請款單據的資料抽取助手。
給你一組圖片(同一筆請款的單據),請先判斷單據類型再輸出嚴格 JSON:

單據類型判斷(doc_type):
- "invoice":一般廠商請款,有統一發票(通常搭配報價單/請款單)
- "referral_fee":介紹費申請單(付給個人的介紹費,「沒有」發票與統編,表格上有介紹人、身分證字號、代扣所得稅、健保補充保費、實領金額等欄位)

{
  "doc_type": "invoice",                 // 或 "referral_fee"
  "invoice_date": "YYYY/MM/DD",          // 發票開立日期,民國年轉西元;介紹費填申請單日期,無則填簽約日期
  "invoice_no": "XX12345678",            // 發票號碼,2 英文字母 + 8 數字;介紹費留空
  "amount_with_tax": 0,                  // 發票總計(含稅),純整數;介紹費填介紹費總額(未扣稅前)
  "vendor_name": "xxx有限公司",          // 發票賣方名稱;介紹費填介紹人姓名
  "vendor_tax_id": "12345678",           // 賣方統編 8 碼;介紹費留空
  "vendor_contact": "",                  // 廠商聯絡人(報價單/請款單上的聯絡人或業務);介紹費填介紹人姓名
  "vendor_phone": "",                    // 廠商連絡電話;介紹費填介紹人連絡電話
  "payee_id_number": "",                 // 介紹費:介紹人身分證字號(1 英文字母 + 9 數字);其他留空
  "billing_content": "項目摘要",         // 主要品項,簡短
  "quoted_amount": 0,                    // 報價單寫的金額(若有);介紹費填 0
  "withholding_tax": 0,                  // 介紹費:代扣所得稅(通常 10%);其他填 0
  "nhi_premium": 0,                      // 介紹費:代扣二代健保補充保費(通常 2.11%);其他填 0
  "net_amount": 0,                       // 介紹費:實領金額;其他填 0
  "notes": ""                            // 異常說明,無則留空
}

規則:
- 所有金額純整數,無千分位、無幣別符號
- 發票號碼不含 "-"
- 若資料無法辨識,該欄填空字串,並在 notes 說明
- 若報價單金額 ≠ 發票含稅金額,在 notes 填 "報價單金額不符:{值}"
- 介紹費:檢查「總額 - 代扣所得稅 - 健保補充保費 = 實領金額」,不符時在 notes 說明
- 只輸出 JSON,不要 markdown code block

billing_content 撰寫規範:
- 一般發票:必須包含「期間」(例:租期 2026/03/01~2026/04/30、廣告檔期 3 個月)與「數量」(例:10 座、x2 檔);不要列尺寸、體積、容量等規格
  格式建議:「品項 + 期間 + 數量」簡潔一句,例:「T-Bar 廣告看板租賃 2026/03/01~2026/04/30 共 10 座」
- 介紹費:寫「介紹費 - 棟別 + 客戶姓名」,例:「介紹費 - A5-10F 客戶張郁杰」`

export type ProviderConfig = {
  apiKey: string
  model: string
}

export type Settings = {
  projectName: string
  specPrompt: string
  activeProvider: ProviderId
  providers: Record<ProviderId, ProviderConfig>
}

export const DEFAULT_SETTINGS: Settings = {
  projectName: '富宇學森',
  specPrompt: DEFAULT_SPEC_PROMPT,
  activeProvider: 'google',
  providers: {
    google: { apiKey: '', model: PROVIDERS.google.defaultModel },
    openai: { apiKey: '', model: PROVIDERS.openai.defaultModel },
    anthropic: { apiKey: '', model: PROVIDERS.anthropic.defaultModel },
    openrouter: { apiKey: '', model: PROVIDERS.openrouter.defaultModel },
  },
}

function mergeSettings(partial: Partial<Settings>): Settings {
  const merged: Settings = {
    ...DEFAULT_SETTINGS,
    ...partial,
    providers: {
      ...DEFAULT_SETTINGS.providers,
      ...(partial.providers ?? {}),
    },
  }
  // 使用者若沒改過 prompt(仍是舊版預設),自動升級到最新版
  const current = merged.specPrompt.trim()
  if (
    current === LEGACY_SPEC_PROMPT_V1.trim() ||
    current === LEGACY_SPEC_PROMPT_V2.trim()
  ) {
    merged.specPrompt = DEFAULT_SPEC_PROMPT
  }
  return merged
}

export function loadSettings(): Settings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) return mergeSettings(JSON.parse(raw) as Partial<Settings>)
  } catch {
    // fall through to migration
  }

  try {
    const rawV1 = localStorage.getItem(OLD_STORAGE_KEY)
    if (rawV1) {
      const v1 = JSON.parse(rawV1) as {
        projectName?: string
        specPrompt?: string
        apiKey?: string
        model?: string
      }
      const migrated: Settings = {
        ...DEFAULT_SETTINGS,
        projectName: v1.projectName ?? DEFAULT_SETTINGS.projectName,
        specPrompt: v1.specPrompt ?? DEFAULT_SETTINGS.specPrompt,
        activeProvider: 'google',
        providers: {
          ...DEFAULT_SETTINGS.providers,
          google: {
            apiKey: v1.apiKey ?? '',
            model: v1.model ?? DEFAULT_SETTINGS.providers.google.model,
          },
        },
      }
      localStorage.setItem(STORAGE_KEY, JSON.stringify(migrated))
      localStorage.removeItem(OLD_STORAGE_KEY)
      return migrated
    }
  } catch {
    // ignore
  }

  return DEFAULT_SETTINGS
}
