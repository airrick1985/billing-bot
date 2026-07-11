import { useState } from 'react'
import Stepper from './components/Stepper'
import Onboarding, { resetOnboarding } from './components/Onboarding'
import ApiKeyBar from './components/ApiKeyBar'
import LoginGate from './components/LoginGate'
import ProjectSwitcher from './components/ProjectSwitcher'
import BatchPage from './pages/BatchPage'
import ResultsPage from './pages/ResultsPage'
import AdminPage from './pages/AdminPage'
import { AuthProvider, useAuth } from './hooks/useAuth'
import type { OcrResult } from './lib/runOcr'
import type { ParsedUpload } from './lib/upload'
import botPhoto from './assets/bot-photo.png'

type Step = 1 | 2
type View = 'wizard' | 'admin'

function App() {
  return (
    <AuthProvider>
      <AppShell />
    </AuthProvider>
  )
}

function AppShell() {
  const { status, user, role, signOut } = useAuth()
  const [step, setStep] = useState<Step>(1)
  const [view, setView] = useState<View>('wizard')
  const [parsed, setParsed] = useState<ParsedUpload | null>(null)
  const [results, setResults] = useState<OcrResult[]>([])
  const [tourKey, setTourKey] = useState(0)

  if (status !== 'ready') {
    return <LoginGate />
  }

  const replayTour = () => {
    resetOnboarding()
    setTourKey((k) => k + 1)
  }

  const readyVendors = parsed?.vendors.filter((v) => v.files.length > 0).length ?? 0
  const canProceed = readyVendors > 0

  return (
    <div className="min-h-screen bg-slate-50">
      <Onboarding key={tourKey} />
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-3 px-6 py-4">
          <div className="flex items-center gap-3">
            <img
              src={botPhoto}
              alt="請款機器人"
              className="h-10 w-10 rounded-full shadow-sm ring-1 ring-slate-200"
            />
            <div>
              <h1 className="text-lg font-semibold text-slate-900">廠商請款助理</h1>
              <p className="text-xs text-slate-500">AI 辨識・自動彙整到 Google Sheet</p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <ProjectSwitcher />
            {role === 'admin' && (
              <button
                type="button"
                onClick={() => setView((v) => (v === 'admin' ? 'wizard' : 'admin'))}
                className={`rounded-lg px-3 py-1.5 text-sm font-medium shadow-sm ${
                  view === 'admin'
                    ? 'bg-indigo-600 text-white hover:bg-indigo-700'
                    : 'border border-slate-300 bg-white text-slate-700 hover:bg-slate-50'
                }`}
              >
                {view === 'admin' ? '← 回請款流程' : '管理後台'}
              </button>
            )}
            <button
              type="button"
              onClick={replayTour}
              className="text-sm text-slate-500 hover:text-slate-900"
            >
              教學
            </button>
            <div className="flex items-center gap-2 border-l border-slate-200 pl-3">
              {user?.picture ? (
                <img
                  src={user.picture}
                  alt=""
                  referrerPolicy="no-referrer"
                  className="h-7 w-7 rounded-full"
                />
              ) : (
                <div className="grid h-7 w-7 place-items-center rounded-full bg-slate-200 text-xs text-slate-600">
                  {user?.name?.slice(0, 1) ?? '?'}
                </div>
              )}
              <div className="hidden sm:block">
                <p className="max-w-32 truncate text-xs font-medium text-slate-700">
                  {user?.name}
                </p>
                <button
                  type="button"
                  onClick={signOut}
                  className="text-[11px] text-slate-400 hover:text-slate-700"
                >
                  登出
                </button>
              </div>
            </div>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-5xl space-y-6 px-6 py-8">
        {view === 'admin' ? (
          <AdminPage />
        ) : (
          <>
            <ApiKeyBar />
            <Stepper currentStep={step} onStepClick={setStep} />

            <div>
              {step === 1 && <BatchPage parsed={parsed} setParsed={setParsed} />}
              {step === 2 && (
                <ResultsPage parsed={parsed} results={results} setResults={setResults} />
              )}
            </div>

            <div className="flex items-center justify-between">
              {step === 2 ? (
                <button
                  type="button"
                  onClick={() => setStep(1)}
                  className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 shadow-sm transition hover:bg-slate-50"
                >
                  ← 回上一步調整批次
                </button>
              ) : (
                <span />
              )}
              {step === 1 && (
                <button
                  type="button"
                  onClick={() => setStep(2)}
                  disabled={!canProceed}
                  title={
                    canProceed
                      ? `${readyVendors} 筆廠商已備妥照片`
                      : '請先加入廠商並上傳照片'
                  }
                  className="rounded-lg bg-indigo-600 px-5 py-2.5 text-sm font-medium text-white shadow-sm transition hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  下一步:辨識與校對({readyVendors} 筆)→
                </button>
              )}
            </div>
          </>
        )}
      </main>
    </div>
  )
}

export default App
