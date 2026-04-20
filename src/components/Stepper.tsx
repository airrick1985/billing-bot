type Step = 1 | 2 | 3

const STEPS: { id: Step; label: string; hint: string }[] = [
  { id: 1, label: '設定', hint: 'API Key 與 SPEC' },
  { id: 2, label: '上傳', hint: '選擇廠商資料夾' },
  { id: 3, label: '彙整', hint: '檢視與匯出 Excel' },
]

type Props = {
  currentStep: Step
  onStepClick?: (step: Step) => void
}

export default function Stepper({ currentStep, onStepClick }: Props) {
  return (
    <ol className="flex items-center justify-between gap-2">
      {STEPS.map((s, i) => {
        const isActive = s.id === currentStep
        const isDone = s.id < currentStep
        const clickable = !!onStepClick && s.id <= currentStep
        return (
          <li key={s.id} className="flex flex-1 items-center">
            <button
              type="button"
              disabled={!clickable}
              onClick={() => clickable && onStepClick!(s.id)}
              className={`flex items-center gap-3 rounded-xl px-3 py-2 text-left transition ${
                clickable ? 'cursor-pointer hover:bg-slate-100' : 'cursor-default'
              }`}
            >
              <span
                className={`grid h-9 w-9 place-items-center rounded-full text-sm font-semibold ring-1 ${
                  isActive
                    ? 'bg-indigo-600 text-white ring-indigo-600'
                    : isDone
                      ? 'bg-indigo-100 text-indigo-700 ring-indigo-200'
                      : 'bg-white text-slate-400 ring-slate-200'
                }`}
              >
                {isDone ? '✓' : s.id}
              </span>
              <span className="flex flex-col leading-tight">
                <span
                  className={`text-sm font-medium ${
                    isActive ? 'text-slate-900' : isDone ? 'text-slate-700' : 'text-slate-400'
                  }`}
                >
                  {s.label}
                </span>
                <span className="text-xs text-slate-400">{s.hint}</span>
              </span>
            </button>
            {i < STEPS.length - 1 && (
              <div
                className={`mx-2 h-px flex-1 ${
                  s.id < currentStep ? 'bg-indigo-300' : 'bg-slate-200'
                }`}
              />
            )}
          </li>
        )
      })}
    </ol>
  )
}
