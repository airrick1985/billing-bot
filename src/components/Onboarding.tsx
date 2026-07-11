import { useCallback, useEffect, useState } from 'react'
import botPhoto from '../assets/bot-photo.png'

const STORAGE_KEY = 'billing-bot:onboarded:v1'

type TourStep = {
  title: string
  body: React.ReactNode
  emoji: string
}

const STEPS: TourStep[] = [
  {
    emoji: '👋',
    title: '歡迎使用 廠商請款助理',
    body: (
      <>
        <img
          src={botPhoto}
          alt="請款機器人"
          className="mx-auto mb-3 h-32 w-32 rounded-full shadow-md ring-2 ring-indigo-100"
        />
        把廠商請款的<b>發票、請款單、介紹費申請單照片</b>丟進來,AI
        幫你辨識、校對,直接寫入建案的 Google Sheet 並自動歸檔照片。
        流程只有 <b>2 個步驟</b>,第一次大約 2 分鐘熟悉。
      </>
    ),
  },
  {
    emoji: '📁',
    title: '① 建立請款批次',
    body: (
      <>
        先在右上角<b>切換建案</b>,選擇<b>請款月份</b>,然後從該建案總表的
        <b>歷史廠商</b>挑選(可搜尋)或新增廠商,再為每個廠商上傳本月的請款照片
        (種類判錯可手動改)。備妥後按右下角「下一步」。
      </>
    ),
  },
  {
    emoji: '✨',
    title: '② 辨識、校對、寫入',
    body: (
      <>
        點「開始辨識」後會並行跑 OCR,結果可<b>直接在畫面上編輯</b>。
        異常欄位(金額對不上、重複發票號等)會以紅底提示,修好按「寫入 Google
        Sheet」即存入總表與月份分頁(自動跨月查重),照片同時歸檔到雲端硬碟。
      </>
    ),
  },
  {
    emoji: '🛠️',
    title: '管理者專區',
    body: (
      <>
        <b>建案清單、Google Sheet、使用者白名單、AI 模型與 SPEC Prompt</b>
        都集中在右上角「管理後台」,由管理者維護;一般使用者登入即用,不需任何設定。
        <br />
        <span className="mt-2 block text-slate-500">準備好了嗎?按「開始使用」進入第一步。</span>
      </>
    ),
  },
]

export default function Onboarding() {
  // 以 key 重掛載重播教學,所以初始值用 lazy initializer 讀 localStorage 即可
  const [open, setOpen] = useState(() => {
    try {
      return localStorage.getItem(STORAGE_KEY) !== 'true'
    } catch {
      return false
    }
  })
  const [index, setIndex] = useState(0)

  const finish = useCallback(() => {
    try {
      localStorage.setItem(STORAGE_KEY, 'true')
    } catch {
      // ignore
    }
    setOpen(false)
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
  }, [open, finish])

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

// eslint-disable-next-line react-refresh/only-export-components -- 與教學元件同檔最直觀,HMR 影響可接受
export function resetOnboarding(): void {
  try {
    localStorage.removeItem(STORAGE_KEY)
  } catch {
    // ignore
  }
}
