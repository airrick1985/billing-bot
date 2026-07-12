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
    <div className="min-h-screen">
      <Onboarding key={tourKey} />
      <header className="border-b-2 border-black bg-white">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-3 px-6 py-4">
          <div className="flex items-center gap-3">
            <img
              src={botPhoto}
              alt="請款機器人"
              className="nb-frame h-10 w-10 bg-[var(--nb-yellow)] object-cover"
            />
            <div>
              <h1 className="text-lg font-extrabold tracking-tight">廠商請款助理</h1>
              <p className="text-xs font-medium text-neutral-500">
                AI 辨識・自動彙整到 Google Sheet
              </p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <ProjectSwitcher />
            {role === 'admin' && (
              <button
                type="button"
                onClick={() => setView((v) => (v === 'admin' ? 'wizard' : 'admin'))}
                className={`nb-btn px-3 py-1.5 text-sm ${
                  view === 'admin' ? 'nb-btn-dark' : 'nb-btn-pink'
                }`}
              >
                {view === 'admin' ? '← 回請款流程' : '管理後台'}
              </button>
            )}
            <button
              type="button"
              onClick={replayTour}
              className="nb-link text-sm"
            >
              教學
            </button>
            <div className="flex items-center gap-2 border-l-2 border-black pl-3">
              {user?.picture ? (
                <img
                  src={user.picture}
                  alt=""
                  referrerPolicy="no-referrer"
                  className="nb-frame h-7 w-7"
                />
              ) : (
                <div className="nb-frame grid h-7 w-7 place-items-center bg-[var(--nb-blue)] text-xs font-bold">
                  {user?.name?.slice(0, 1) ?? '?'}
                </div>
              )}
              <div className="hidden sm:block">
                <p className="max-w-32 truncate text-xs font-bold">
                  {user?.name}
                </p>
                <button
                  type="button"
                  onClick={signOut}
                  className="text-[11px] font-medium text-neutral-500 underline decoration-2 underline-offset-2 hover:bg-[var(--nb-yellow)] hover:text-black"
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
                  className="nb-btn px-4 py-2 text-sm"
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
                  className="nb-btn nb-btn-primary px-5 py-2.5 text-sm"
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
