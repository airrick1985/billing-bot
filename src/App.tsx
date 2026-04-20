import { useState } from 'react'
import Stepper from './components/Stepper'
import SettingsPage from './pages/SettingsPage'
import UploadPage from './pages/UploadPage'
import ResultsPage from './pages/ResultsPage'

type Step = 1 | 2 | 3

function App() {
  const [step, setStep] = useState<Step>(1)

  const goPrev = () => setStep((s) => (s > 1 ? ((s - 1) as Step) : s))
  const goNext = () => setStep((s) => (s < 3 ? ((s + 1) as Step) : s))

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="grid h-9 w-9 place-items-center rounded-lg bg-indigo-600 font-bold text-white">
              B
            </div>
            <div>
              <h1 className="text-lg font-semibold text-slate-900">Billing Bot</h1>
              <p className="text-xs text-slate-500">廠商請款自動彙整</p>
            </div>
          </div>
          <a
            href="https://github.com/airrick1985/billing-bot"
            target="_blank"
            rel="noreferrer"
            className="text-sm text-slate-500 hover:text-slate-900"
          >
            GitHub ↗
          </a>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-6 py-10">
        <Stepper currentStep={step} onStepClick={setStep} />

        <div className="mt-8">
          {step === 1 && <SettingsPage />}
          {step === 2 && <UploadPage />}
          {step === 3 && <ResultsPage />}
        </div>

        <div className="mt-6 flex items-center justify-between">
          <button
            type="button"
            onClick={goPrev}
            disabled={step === 1}
            className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 shadow-sm transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
          >
            ← 上一步
          </button>
          <button
            type="button"
            onClick={goNext}
            disabled={step === 3}
            className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-40"
          >
            下一步 →
          </button>
        </div>
      </main>
    </div>
  )
}

export default App
