type Step = 1 | 2

const STEPS: { id: Step; label: string; hint: string }[] = [
  { id: 1, label: '建立請款', hint: '選月份、廠商與照片' },
  { id: 2, label: '彙整寫入', hint: '辨識、校對、寫入 Sheet' },
]

type Props = {
  currentStep: Step
  onStepClick?: (step: Step) => void
}

export default function Stepper({ currentStep, onStepClick }: Props) {
  return (
    <ol className="flex items-stretch justify-between gap-3">
      {STEPS.map((s, i) => {
        const isActive = s.id === currentStep
        const isDone = s.id < currentStep
        const clickable = !!onStepClick && s.id <= currentStep
        return (
          <li key={s.id} className="flex flex-1 items-center gap-3">
            <button
              type="button"
              disabled={!clickable}
              onClick={() => clickable && onStepClick!(s.id)}
              className={`nb-card-sm flex flex-1 items-center gap-3 px-3 py-2 text-left ${
                isActive
                  ? 'bg-[var(--nb-yellow)]'
                  : isDone
                    ? 'bg-[var(--nb-green-soft)]'
                    : 'bg-white'
              } ${clickable ? 'cursor-pointer' : 'cursor-default'}`}
            >
              <span
                className={`nb-frame grid h-9 w-9 shrink-0 place-items-center text-sm font-extrabold ${
                  isActive
                    ? 'bg-black text-white'
                    : isDone
                      ? 'bg-[var(--nb-green)] text-black'
                      : 'bg-white text-neutral-400'
                }`}
              >
                {isDone ? '✓' : s.id}
              </span>
              <span className="flex flex-col leading-tight">
                <span
                  className={`text-sm font-bold ${
                    isActive || isDone ? 'text-black' : 'text-neutral-400'
                  }`}
                >
                  {s.label}
                </span>
                <span
                  className={`text-xs ${
                    isActive || isDone ? 'text-neutral-600' : 'text-neutral-400'
                  }`}
                >
                  {s.hint}
                </span>
              </span>
            </button>
            {i < STEPS.length - 1 && (
              <div
                className={`h-0.5 w-8 shrink-0 ${
                  s.id < currentStep ? 'bg-black' : 'bg-neutral-300'
                }`}
              />
            )}
          </li>
        )
      })}
    </ol>
  )
}
