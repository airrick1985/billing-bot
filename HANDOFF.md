# Billing Bot — 專案交接說明

> 這份文件給 Claude Code / 新 session 讀，用來無縫接手專案。
> 若你是 Claude，切換工作目錄到本資料夾後，**請先讀完這份**再動作。

---

## 一、一句話目標
把「富宇學森建案 廠商請款 Excel 彙整」從本機 IDE 流程，
**做成一個純前端靜態網站**，讓業務/會計人員能用瀏覽器自助完成：
上傳照片 → Gemini OCR → 自動填 Excel 總表。

---

## 二、使用者背景
- **使用者**：airrick1985@gmail.com
- **負責建案**：富宇學森（正式名：富宇長春段(學森)）
- **語言**：繁體中文為主
- **原始工作資料夾**：`C:\Users\user\Dropbox\一研九鼎\富宇長春段(學森)\廠商請款\`
  - 含已建立的 `彙整SPEC.md`（Excel 欄位規格）與 `富宇學森-廠商請款總表.xlsx`（手動彙整結果）
  - 這個網站就是要**把上面那套 SPEC + Excel 產出自動化**

---

## 三、已決定的技術選型

| 層 | 技術 | 備註 |
|----|------|------|
| 框架 | **Vite + React 18 + TypeScript** | scaffold 完成 |
| UI | **Tailwind CSS v4**（`@tailwindcss/vite`） | 已安裝，已接到 `index.css` |
| 元件 | **shadcn/ui**（規劃中，還沒加） | 之後建資料夾上傳、表單用 |
| AI SDK | **`@google/genai`** 官方 JS SDK | 規劃中 |
| Excel | **SheetJS (`xlsx`)** | 規劃中 |
| 資料夾上傳 | `<input webkitdirectory>` | 原生 |
| 儲存 | **localStorage** | API key、SPEC prompt、歷史彙整 |
| Repo | `https://github.com/airrick1985/billing-bot` | 尚未建立 |
| 部署 | **Cloudflare Pages**（`xxx.pages.dev` 免費子網域） | 尚未串接 |

---

## 四、進度狀態（2026-04-20 交接點）

### 已完成
- [x] 建立專案資料夾 `C:\Users\user\projects\billing-bot`
- [x] `npm create vite@latest` 建立 React + TS scaffold
- [x] `npm install` 安裝相依
- [x] 安裝 `tailwindcss` 與 `@tailwindcss/vite`
- [x] 修改 `vite.config.ts` 加入 `tailwindcss()` plugin
- [x] 改寫 `src/index.css` 為 Tailwind v4 `@import "tailwindcss"` 版本
- [x] 替換 `src/App.tsx` 為 Tailwind 版首頁占位（Header + 歡迎卡片）
- [x] `src/main.tsx` 維持預設（import `./index.css`）

### 尚未完成（按順序）
1. **驗證 Tailwind 跑起來**：`cd C:\Users\user\projects\billing-bot && npm run dev` 看 <http://localhost:5173>
2. **建立 GitHub Repo**：`gh repo create airrick1985/billing-bot --public --source . --push`
3. **Cloudflare Pages 串 GitHub**：到 Cloudflare 後台 → Pages → Connect to Git → 選 billing-bot → Build: `npm run build`、Output: `dist`
4. **首頁骨架**：3 步驟導航（① 設定 → ② 上傳 → ③ 彙整）
5. **設定頁**：API Key 輸入（密碼框）、模型下拉、SPEC prompt 可編輯（TextArea）
6. **上傳頁**：資料夾拖曳/選擇、檔案樹預覽、自動判讀「請款月份」
7. **Gemini OCR**：一組廠商（發票+報價單）→ `@google/genai` 多模態 → JSON 結構
8. **結果表格**：可編輯、去重（發票號碼）、異常紅底
9. **Excel 匯出**：依 SPEC 產出 `.xlsx`（總表 sheet + 各月份 sheet）
10. **Onboarding**：首次訪問 5 步驟氣泡教學

---

## 五、彙整 SPEC（原始業務規則，照抄自 `彙整SPEC.md`）

這是網站在「設定頁」要給使用者預設好、並可修改的 Prompt 雛型。
也是餵給 Gemini 的系統指令骨幹。

### 資料夾結構（使用者上傳時）
```
{請款期間}/                    例：2026年4月
├── {廠商名稱}/                例：安熙智慧有限公司
│   ├── 報價單.jpg（或 請款單.jpg）
│   └── 發票.jpg
├── {廠商名稱}-2/              同一廠商第 2 筆
└── {廠商名稱}-3/              第 3 筆
```
- 第一層資料夾 = 請款月份
- 第二層 = 廠商資料夾 = **1 筆請款 = Excel 1 列**
- 同廠商多筆以 `-2`、`-3` 區分

### Excel 欄位（9 欄）
| 欄 | 標頭 | 來源 |
|----|------|------|
| A | 請款月份 | 取自第一層資料夾名（例 `2026年4月`） |
| B | 建案名稱 | 固定「富宇學森」（之後可做成可設定） |
| C | 發票日期 | 發票照片 OCR，`YYYY/MM/DD`（民國轉西元） |
| D | 發票號碼 | 發票照片 OCR（2 字母 + 8 數字） |
| E | 發票金額(含稅) | 發票總計，純數字 |
| F | 廠商名稱 | 發票賣方 |
| G | 廠商統編 | 賣方統編 8 碼 |
| H | 請款內容 | 報價單摘要 |
| I | 備註 | 異常註記 |

### Excel 結構
- 檔名：`{建案}-廠商請款總表.xlsx`
- `總表` sheet（所有月份）+ 各月份 sheet（例 `2026年4月`）
- **唯一鍵 = 發票號碼**，重複者跳過並警示
- 發票號碼欄套條件式格式（重複值紅底）

### 驗證規則（寫入「備註」欄）
- 發票公司名 ≠ 資料夾廠商名
- 報價單金額 ≠ 發票含稅金額
- 缺發票或缺報價單
- 任一欄無法清楚辨識

---

## 六、Gemini OCR Prompt 草稿（之後改寫為 TS 常數）

```
你是台灣統一發票與報價單的資料抽取助手。
給你一組圖片（同一筆請款的「發票」與「報價單/請款單」），請輸出嚴格 JSON：

{
  "invoice_date": "YYYY/MM/DD",          // 發票開立日期，民國年轉西元
  "invoice_no": "XX12345678",            // 發票號碼，2 英文字母 + 8 數字
  "amount_with_tax": 0,                  // 發票總計（含稅），純整數
  "vendor_name": "xxx有限公司",          // 發票賣方名稱
  "vendor_tax_id": "12345678",           // 賣方統編 8 碼
  "billing_content": "項目摘要",         // 報價單/請款單主要品項，簡短
  "quoted_amount": 0,                    // 報價單寫的金額（若有）
  "notes": ""                            // 異常說明，無則留空
}

規則：
- 所有金額純整數，無千分位、無幣別符號
- 發票號碼不含 "-"
- 若資料無法辨識，該欄填空字串，並在 notes 說明
- 若報價單金額 ≠ 發票含稅金額，在 notes 填 "報價單金額不符：{值}"
- 只輸出 JSON，不要 markdown code block
```

---

## 七、使用者偏好（Feedback 摘要）
- 使用繁體中文
- 偏好逐步確認而非一口氣做完
- Excel 格式需嚴格遵守 `彙整SPEC.md`
- 重要：**不要放 `node_modules` 到 Dropbox**（所以專案放 `C:\Users\user\projects\`）

---

## 八、接手後的第一個動作建議

若你是剛切過來的 Claude：
1. 跟使用者打聲招呼：「已讀 HANDOFF.md，準備繼續第 X 步」
2. 先跑 `npm run dev` 驗證 Tailwind / 骨架沒壞
3. 確認後執行「建立 GitHub Repo」（步驟 2）

若使用者想「重新開始任務」：
- 刪掉這個資料夾重建也可以，但上面的 SPEC 與 OCR Prompt 值得保留
