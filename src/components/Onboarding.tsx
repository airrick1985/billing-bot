import { useEffect, useState } from 'react'

const STORAGE_KEY = 'billing-bot:onboarded:v1'

type TourStep = {
  title: string
  body: React.ReactNode
  emoji: string
}

const STEPS: TourStep[] = [
  {
    emoji: '👋',
    title: '歡迎使用 Billing Bot',
    body: (
      <>
        把廠商請款的 <b>發票 + 報價單照片</b> 丟進來,AI 幫你辨識並產出 Excel 總表。
        整個流程只需 <b>3 個步驟</b>,第一次大約 2 分鐘熟悉。
      </>
    ),
  },
  {
    emoji: '🔑',
    title: '① 設定:API Key 與 SPEC',
    body: (
      <>
        首先選一家 AI 供應商(Google / OpenAI / Anthropic / OpenRouter),貼上 API Key 並選擇模型。
        <br />
        <span className="text-slate-500">
          Key 只存在你的瀏覽器(localStorage),不會上傳到任何伺服器。
        </span>
      </>
    ),
  },
  {
    emoji: '📁',
    title: '② 上傳:廠商資料夾',
    body: (
      <>
        拖曳或選擇一個<b>請款月份資料夾</b>,結構如下:
        <pre className="mt-2 rounded-md bg-slate-900 px-3 py-2 text-[11px] leading-5 text-slate-100">
{`2026年4月/
├── 安熙智慧有限公司/
│   ├── 發票.jpg
│   └── 報價單.jpg
└── 其他廠商/ ...`}
        </pre>
        每個子資料夾 = Excel 一列。
      </>
    ),
  },
  {
    emoji: '✨',
    title: '③ 辨識、檢視、匯出',
    body: (
      <>
        點「開始辨識」後會並行跑 OCR,結果可<b>直接在畫面上編輯</b>。
        異常欄位(金額對不上、重複發票號等)會以紅底提示,修好就按「匯出 Excel」下載 .xlsx。
      </>
    ),
  },
  {
    emoji: '🔒',
    title: '隱私與資料',
    body: (
      <>
        除了辨識當下會把照片傳給你選的 AI 供應商外,<b>所有資料都留在你的瀏覽器</b>。
        不登入、不上傳伺服器、不追蹤。關掉分頁 = 資料仍在 localStorage,換電腦就要重設。
        <br />
        <span className="mt-2 block text-slate-500">準備好了嗎?按「開始使用」進入第一步。</span>
      </>
    ),
  },
]

export default function Onboarding() {
  const [open, setOpen] = useState(false)
  const [index, setIndex] = useState(0)

  useEffect(() => {
    try {
      if (localStorage.getItem(STORAGE_KEY) !== 'true') setOpen(true)
    } catch {
      // ignore storage errors
    }
  }, [])

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') finish()
      else if (e.key === 'ArrowRight') setIndex((i) => Math.min(i + 1, STEPS.length - 1))
      else if (e.key === 'ArrowLeft') setIndex((i) => Math.max(i - 1, 0))
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open])

  const finish = () => {
    try {
      localStorage.setItem(STORAGE_KEY, 'true')
    } catch {
      // ignore
    }
    setOpen(false)
  }

  if (!open) return null

  const step = STEPS[index]
  const isLast = index === STEPS.length - 1

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div
        className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm"
        onClick={finish}
        aria-hidden
      />
      <div className="relative w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
        <button
          type="button"
          onClick={finish}
          className="absolute right-3 top-3 rounded-md p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
          aria-label="關閉教學"
        >
          ✕
        </button>

        <div className="flex items-start gap-3">
          <div className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-indigo-50 text-2xl">
            {step.emoji}
          </div>
          <div className="min-w-0 pt-1">
            <h3 className="text-base font-semibold text-slate-900">{step.title}</h3>
          </div>
        </div>

        <div className="mt-3 text-sm leading-relaxed text-slate-700">{step.body}</div>

        <div className="mt-6 flex items-center justify-between">
          <div className="flex gap-1.5">
            {STEPS.map((_, i) => (
              <button
                key={i}
                type="button"
                onClick={() => setIndex(i)}
                className={`h-1.5 rounded-full transition-all ${
                  i === index ? 'w-6 bg-indigo-600' : 'w-1.5 bg-slate-300 hover:bg-slate-400'
                }`}
                aria-label={`第 ${i + 1} 步`}
              />
            ))}
          </div>
          <div className="flex gap-2">
            {index > 0 && (
              <button
                type="button"
                onClick={() => setIndex(index - 1)}
                className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
              >
                上一步
              </button>
            )}
            {!isLast ? (
              <button
                type="button"
                onClick={() => setIndex(index + 1)}
                className="rounded-lg bg-indigo-600 px-4 py-1.5 text-sm font-medium text-white shadow-sm hover:bg-indigo-700"
              >
                下一步
              </button>
            ) : (
              <button
                type="button"
                onClick={finish}
                className="rounded-lg bg-emerald-600 px-4 py-1.5 text-sm font-medium text-white shadow-sm hover:bg-emerald-700"
              >
                開始使用
              </button>
            )}
          </div>
        </div>

        <button
          type="button"
          onClick={finish}
          className="mt-3 w-full text-center text-xs text-slate-400 hover:text-slate-600"
        >
          略過教學
        </button>
      </div>
    </div>
  )
}

export function resetOnboarding(): void {
  try {
    localStorage.removeItem(STORAGE_KEY)
  } catch {
    // ignore
  }
}
