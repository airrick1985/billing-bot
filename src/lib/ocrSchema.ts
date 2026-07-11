import { z } from 'zod'

export const invoiceSchema = z.object({
  doc_type: z
    .enum(['invoice', 'referral_fee'])
    .describe(
      '單據類型:一般發票請款填 invoice;介紹費申請單(付給個人的介紹費,無發票)填 referral_fee',
    ),
  invoice_date: z
    .string()
    .describe(
      '發票開立日期,格式 YYYY/MM/DD,民國年轉西元;介紹費填申請單上的日期,若無則填簽約日期',
    ),
  invoice_no: z
    .string()
    .describe('發票號碼,2 英文字母 + 8 數字,不含連字號;介紹費無發票,留空字串'),
  amount_with_tax: z
    .number()
    .int()
    .describe('發票總計(含稅),純整數,無千分位;介紹費填介紹費總額(未扣稅前)'),
  vendor_name: z
    .string()
    .describe('發票賣方公司名稱;介紹費填介紹人姓名(領款人)'),
  vendor_tax_id: z.string().describe('賣方統編 8 碼;介紹費無統編,留空字串'),
  vendor_contact: z
    .string()
    .describe('廠商聯絡人姓名(報價單/請款單上的聯絡人、業務或負責人);介紹費填介紹人姓名;無法辨識留空'),
  vendor_phone: z
    .string()
    .describe('廠商連絡電話(市話或手機,含區碼,數字與連字號);介紹費填介紹人連絡電話;無法辨識留空'),
  payee_id_number: z
    .string()
    .describe('介紹費申請單上介紹人的身分證字號(1 英文字母 + 9 數字);非介紹費留空字串'),
  billing_content: z
    .string()
    .describe(
      '報價單或請款單的主要品項摘要,簡短。必須包含期間(例:租期 2026/03/01~2026/04/30、廣告檔期 3 個月)與數量(例:10 座、x2 檔);不要列出尺寸、體積、容量等規格參數。介紹費則寫「介紹費 - 棟別 + 客戶姓名」(例:介紹費 - A5-10F 客戶張郁杰)',
    ),
  quoted_amount: z.number().int().describe('報價單寫的金額,若無則填 0;介紹費填 0'),
  withholding_tax: z
    .number()
    .int()
    .describe('介紹費:代扣所得稅(通常為 10%),純整數;非介紹費填 0'),
  nhi_premium: z
    .number()
    .int()
    .describe('介紹費:代扣二代健保補充保費(通常為 2.11%),純整數;非介紹費填 0'),
  net_amount: z
    .number()
    .int()
    .describe('介紹費:實領金額(總額 - 代扣所得稅 - 健保補充保費),純整數;非介紹費填 0'),
  notes: z.string().describe('異常說明,無則留空字串'),
})

export type Invoice = z.infer<typeof invoiceSchema>
