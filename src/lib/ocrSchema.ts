import { z } from 'zod'

export const invoiceSchema = z.object({
  invoice_date: z.string().describe('發票開立日期,格式 YYYY/MM/DD,民國年轉西元'),
  invoice_no: z.string().describe('發票號碼,2 英文字母 + 8 數字,不含連字號'),
  amount_with_tax: z.number().int().describe('發票總計(含稅),純整數,無千分位'),
  vendor_name: z.string().describe('發票賣方公司名稱'),
  vendor_tax_id: z.string().describe('賣方統編 8 碼'),
  billing_content: z
    .string()
    .describe(
      '報價單或請款單的主要品項摘要,簡短。必須包含期間(例:租期 2026/03/01~2026/04/30、廣告檔期 3 個月)與數量(例:10 座、x2 檔);不要列出尺寸、體積、容量等規格參數',
    ),
  quoted_amount: z.number().int().describe('報價單寫的金額,若無則填 0'),
  notes: z.string().describe('異常說明,無則留空字串'),
})

export type Invoice = z.infer<typeof invoiceSchema>
