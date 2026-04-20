function App() {
  return (
    <div className="min-h-screen bg-slate-50">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto max-w-5xl px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-indigo-600 text-white grid place-items-center font-bold">B</div>
            <div>
              <h1 className="text-lg font-semibold text-slate-900">Billing Bot</h1>
              <p className="text-xs text-slate-500">廠商請款自動彙整</p>
            </div>
          </div>
          <a href="https://github.com/airrick1985/billing-bot" target="_blank" rel="noreferrer"
             className="text-sm text-slate-500 hover:text-slate-900">GitHub ↗</a>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-6 py-10">
        <div className="rounded-2xl border border-slate-200 bg-white p-10 text-center shadow-sm">
          <h2 className="text-2xl font-semibold text-slate-900">歡迎使用 Billing Bot</h2>
          <p className="mt-2 text-slate-600">上傳廠商請款資料夾，由 Gemini 自動辨識並產出 Excel 總表。</p>
          <p className="mt-6 text-sm text-slate-400">🛠 專案骨架已就緒（Tailwind v4 運作中）— 後續將逐步加入設定、上傳、彙整三大功能。</p>
        </div>
      </main>
    </div>
  )
}

export default App
