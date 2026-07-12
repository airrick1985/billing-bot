import { useState } from 'react'
import { useAuth } from '../hooks/useAuth'
import botPhoto from '../assets/bot-photo.png'

/** 依登入狀態顯示對應閘門畫面;status === 'ready' 時不會用到這個元件 */
export default function LoginGate() {
  const { status } = useAuth()

  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <div className="nb-card w-full max-w-md p-8">
        <div className="flex flex-col items-center text-center">
          <img
            src={botPhoto}
            alt="請款機器人"
            className="nb-frame h-28 w-28 bg-[var(--nb-yellow)] object-cover shadow-[4px_4px_0_0_#111]"
          />
          <h1 className="mt-4 text-xl font-extrabold tracking-tight">廠商請款助理</h1>
          <p className="text-xs font-medium text-neutral-500">
            AI 辨識・自動彙整到 Google Sheet
          </p>
        </div>

        <div className="mt-6">
          {status === 'no-client-id' && <ClientIdSetup />}
          {status === 'signed-out' && <SignInPanel />}
          {status === 'busy' && <BusyPanel />}
          {status === 'need-master' && <MasterSetup />}
          {status === 'unauthorized' && <UnauthorizedPanel />}
        </div>
      </div>
    </div>
  )
}

function ErrorNote() {
  const { error } = useAuth()
  if (!error) return null
  return (
    <p className="nb-frame mt-3 bg-[var(--nb-red-soft)] p-3 text-sm font-medium">
      ⚠ {error}
    </p>
  )
}

function ClientIdSetup() {
  const { setupClientId } = useAuth()
  const [value, setValue] = useState('')

  return (
    <div>
      <h2 className="text-base font-extrabold">初次設定:Google Client ID</h2>
      <p className="mt-2 text-sm leading-6 text-neutral-700">
        本系統透過你的 Google 帳號存取 Google Sheet。請依照專案內的{' '}
        <code className="nb-frame bg-[var(--nb-bg)] px-1 text-xs">SETUP.md</code>{' '}
        建立 Google Cloud OAuth Client ID 後,貼在下方。
      </p>
      <input
        type="text"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder="xxxxxxxx.apps.googleusercontent.com"
        className="nb-input mt-4 w-full px-3 py-2 font-mono text-xs"
      />
      <button
        type="button"
        disabled={!value.trim().endsWith('.apps.googleusercontent.com')}
        onClick={() => setupClientId(value)}
        className="nb-btn nb-btn-primary mt-4 w-full px-4 py-2 text-sm"
      >
        儲存並繼續
      </button>
      <ErrorNote />
    </div>
  )
}

function SignInPanel() {
  const { signIn } = useAuth()
  return (
    <div>
      <h2 className="text-base font-extrabold">登入</h2>
      <p className="mt-2 text-sm text-neutral-700">
        使用公司 Google 帳號登入。資料直接存取你的 Google Sheet,不經過第三方伺服器。
      </p>
      <button
        type="button"
        onClick={() => void signIn()}
        className="nb-btn mt-4 w-full px-4 py-2.5 text-sm"
      >
        <GoogleIcon />
        使用 Google 帳號登入
      </button>
      <ErrorNote />
    </div>
  )
}

function BusyPanel() {
  return (
    <div className="py-6 text-center">
      <div className="nb-frame mx-auto h-8 w-8 animate-spin border-t-[var(--nb-yellow)]" />
      <p className="mt-3 text-sm font-bold">處理中…</p>
    </div>
  )
}

function MasterSetup() {
  const { user, createNewMaster, linkExistingMaster, signOut } = useAuth()
  const [existing, setExisting] = useState('')

  return (
    <div>
      <h2 className="text-base font-extrabold">設定系統主檔</h2>
      <p className="mt-2 text-sm leading-6 text-neutral-700">
        已登入 <b>{user?.email}</b>。系統主檔是一份 Google
        Sheet,存放建案清單與使用者白名單。這台裝置尚未設定,請選擇:
      </p>

      <button
        type="button"
        onClick={() => void createNewMaster()}
        className="nb-btn nb-btn-primary mt-4 w-full px-4 py-2 text-sm"
      >
        建立新的系統主檔(第一次使用)
      </button>

      <div className="mt-4 border-t-2 border-black pt-4">
        <p className="text-xs font-bold">或貼上既有系統主檔的網址 / ID:</p>
        <div className="mt-2 flex gap-2">
          <input
            type="text"
            value={existing}
            onChange={(e) => setExisting(e.target.value)}
            placeholder="https://docs.google.com/spreadsheets/d/…"
            className="nb-input min-w-0 flex-1 px-3 py-2 font-mono text-xs"
          />
          <button
            type="button"
            disabled={!existing.trim()}
            onClick={() => void linkExistingMaster(existing)}
            className="nb-btn nb-btn-blue px-3 py-2 text-sm"
          >
            連結
          </button>
        </div>
      </div>

      <button
        type="button"
        onClick={signOut}
        className="nb-link mt-4 text-xs"
      >
        改用其他帳號登入
      </button>
      <ErrorNote />
    </div>
  )
}

function UnauthorizedPanel() {
  const { user, signOut, refreshMaster } = useAuth()
  return (
    <div>
      <h2 className="text-base font-extrabold">尚未開通權限</h2>
      <p className="mt-2 text-sm leading-6 text-neutral-700">
        <b>{user?.email}</b> 不在系統白名單中。請聯絡管理者將此 email
        加入「系統主檔 → 使用者」分頁後,再按重新檢查。
      </p>
      <div className="mt-4 flex gap-2">
        <button
          type="button"
          onClick={() => void refreshMaster()}
          className="nb-btn nb-btn-primary flex-1 px-4 py-2 text-sm"
        >
          重新檢查
        </button>
        <button
          type="button"
          onClick={signOut}
          className="nb-btn px-4 py-2 text-sm"
        >
          登出
        </button>
      </div>
    </div>
  )
}

function GoogleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden>
      <path
        fill="#4285F4"
        d="M23.5 12.27c0-.85-.08-1.66-.22-2.45H12v4.64h6.45a5.52 5.52 0 0 1-2.39 3.62v3h3.87c2.26-2.09 3.57-5.17 3.57-8.81Z"
      />
      <path
        fill="#34A853"
        d="M12 24c3.24 0 5.96-1.07 7.94-2.91l-3.87-3c-1.07.72-2.45 1.15-4.07 1.15-3.13 0-5.78-2.11-6.73-4.96H1.29v3.09A12 12 0 0 0 12 24Z"
      />
      <path
        fill="#FBBC05"
        d="M5.27 14.28a7.2 7.2 0 0 1 0-4.56V6.63H1.29a12 12 0 0 0 0 10.74l3.98-3.09Z"
      />
      <path
        fill="#EA4335"
        d="M12 4.76c1.76 0 3.35.6 4.6 1.8l3.44-3.44A11.97 11.97 0 0 0 12 0 12 12 0 0 0 1.29 6.63l3.98 3.09C6.22 6.87 8.87 4.76 12 4.76Z"
      />
    </svg>
  )
}
