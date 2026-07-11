# Billing Bot 環境設定指南

## 一、建立 Google Cloud 專案(一次性,約 10 分鐘)

### 1. 建立專案
1. 打開 <https://console.cloud.google.com/>,用公司 Google 帳號登入
2. 上方專案下拉 →「新增專案」
3. 專案名稱填 `billing-bot`(或任意),按「建立」,建立後記得切到這個專案

### 2. 啟用 API
1. 左側選單 →「API 和服務」→「程式庫」
2. 搜尋 **Google Sheets API** → 點進去 → 按「啟用」
3. 回到程式庫,搜尋 **Google Drive API** → 按「啟用」

### 3. 設定 OAuth 同意畫面
1. 「API 和服務」→「OAuth 同意畫面」(新版介面叫「Google Auth Platform」→「品牌塑造」)
2. User Type 選 **外部(External)**(除非公司有 Google Workspace,可選內部)
3. 應用程式名稱填 `Billing Bot`,支援電子郵件填你的 email,其餘必填照實填,儲存
4. 「目標對象 / 測試使用者」:按「新增使用者」,把**所有會登入系統的 Gmail** 都加進來
   (外部 + 測試模式下,只有測試使用者能登入;正式發布需 Google 審查,內部團隊用測試模式即可,上限 100 人)
5. 「資料存取 / 範圍」不用特別設定(登入時會動態請求)

### 4. 建立 OAuth Client ID
1. 「API 和服務」→「憑證」→「建立憑證」→「OAuth 用戶端 ID」
2. 應用程式類型選 **網頁應用程式**,名稱填 `billing-bot-web`
3. 「已授權的 JavaScript 來源」加入:
   - `http://localhost:5173`(本機開發)
   - 部署後再回來加 `https://你的網域.vercel.app`
4. 「已授權的重新導向 URI」**留空**(本系統用 token 流程,不需要)
5. 按「建立」,複製 **用戶端 ID**(長得像 `xxxx.apps.googleusercontent.com`)

### 5. 交給系統
兩種方式擇一:
- **開發/單機**:啟動 app 後,初次設定畫面直接貼上 Client ID
- **部署(建議)**:設環境變數 `VITE_GOOGLE_CLIENT_ID`(見 `.env.example`)

## 二、初次使用流程

1. `npm run dev` 啟動 → 貼 Client ID → 用 Google 帳號登入
2. 選「建立新的系統主檔」→ 系統自動在你的雲端硬碟建立「Billing Bot 系統主檔」試算表,你自動成為 admin
3. 進「管理後台」→ 新增建案 → 按「建立試算表」→ 儲存變更
4. 要加同事:管理後台 → 使用者白名單加 email,**並且**:
   - 到 Google Cloud「OAuth 同意畫面 → 測試使用者」加同一個 email
   - 把「系統主檔」與各建案試算表用 Google 共用給該 email(編輯權限)

## 三、部署到 Vercel(含 OCR Proxy)

1. 專案推上 GitHub → Vercel 匯入該 repo(框架自動偵測 Vite;`api/ocr.ts` 會自動部署成 Serverless Function)
2. Vercel 專案 Settings → Environment Variables:

   | 變數 | 說明 |
   |---|---|
   | `VITE_GOOGLE_CLIENT_ID` | OAuth 用戶端 ID |
   | `VITE_MASTER_SHEET_ID` | 系統主檔試算表 ID(管理後台「系統資訊」可複製) |
   | `VITE_OCR_PROXY_URL` | 填 `/api/ocr`,啟用 OCR Proxy(前端就不再需要輸入 API Key) |
   | `GOOGLE_CLIENT_ID` | 同 VITE_GOOGLE_CLIENT_ID(Proxy 驗證登入 token 用) |
   | `GEMINI_API_KEY` | 使用 Google Gemini 時必填 |
   | `OPENAI_API_KEY` | 使用 OpenAI 時填 |
   | `ANTHROPIC_API_KEY` | 使用 Claude 時填 |
   | `OPENROUTER_API_KEY` | 使用 OpenRouter 時填 |

3. 部署完成後,把 `https://xxx.vercel.app` 加回 OAuth Client 的「已授權的 JavaScript 來源」

OCR Proxy 說明:設了 `VITE_OCR_PROXY_URL` 之後,OCR 請求改走你的 Vercel 後端,
AI 的 API Key 只存在 Vercel 環境變數;Proxy 會驗證請求帶的 Google 登入 token
是否屬於本系統(OAuth Client),陌生人拿不到你的額度。
本機開發(`npm run dev`)沒有 Proxy,仍可在設定頁輸入自己的 Key 直連。

## 四、照片歸檔(Google Drive)

- 第一次「寫入 Google Sheet」時,系統會自動在你的雲端硬碟建立
  「{建案名}-請款照片」資料夾並記錄到系統主檔;也可以在管理後台先按「建立資料夾」。
- 照片路徑:`建案資料夾 / 2026年7月 / 廠商名 /`,
  檔名:`請款日期-廠商-請款內容-種類.jpg`(發票/請款單/介紹費申請單/附件)。
- **注意**:資料夾必須「由本系統建立」才有權限上傳(OAuth 只授權 app 自建檔案,
  這是最小權限設計);手動貼別的資料夾 ID 會出現 404。
- 多人使用時,把建案照片資料夾共用給其他使用者(編輯者)。

## 常見問題

- **登入跳出「這個應用程式未經 Google 驗證」**:測試模式的正常警告,按「進階 → 前往 Billing Bot」即可
- **登入後顯示 403 / 沒有存取權限**:該帳號沒被共用試算表,或不在 OAuth 測試使用者名單
- **登入後顯示「尚未開通權限」**:帳號不在系統白名單(管理後台 → 使用者)
