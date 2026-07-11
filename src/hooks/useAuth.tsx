import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import {
  getClientId,
  saveClientId,
  signInWithGoogle,
  signOutGoogle,
  type GoogleUser,
} from '../lib/google/auth'
import {
  createMasterSheet,
  getMasterSheetId,
  loadMasterData,
  saveMasterSheetId,
  saveOcrConfig,
  saveProjects,
  type MasterData,
  type OcrConfig,
  type Project,
  type Role,
} from '../lib/google/masterSheet'
import { parseSpreadsheetId } from '../lib/google/sheets'

const ACTIVE_PROJECT_KEY = 'billing-bot:active-project'

export type AuthStatus =
  | 'no-client-id' // 尚未設定 Google Client ID
  | 'signed-out'
  | 'busy' // 登入或載入主檔中
  | 'need-master' // 已登入但尚未設定系統主檔
  | 'unauthorized' // 已登入但不在白名單
  | 'ready'

type AuthContextValue = {
  status: AuthStatus
  error: string | null
  user: GoogleUser | null
  role: Role
  master: MasterData | null
  masterSheetId: string
  projects: Project[]
  activeProject: Project | null
  setActiveProjectName: (name: string) => void
  signIn: () => Promise<void>
  signOut: () => void
  setupClientId: (id: string) => void
  createNewMaster: () => Promise<void>
  linkExistingMaster: (idOrUrl: string) => Promise<void>
  refreshMaster: () => Promise<void>
  updateProjectDriveFolder: (projectName: string, folderId: string) => Promise<void>
  ocrConfig: OcrConfig | null
  saveGlobalOcrConfig: (config: OcrConfig) => Promise<void>
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<AuthStatus>(() =>
    getClientId() ? 'signed-out' : 'no-client-id',
  )
  const [error, setError] = useState<string | null>(null)
  const [user, setUser] = useState<GoogleUser | null>(null)
  const [master, setMaster] = useState<MasterData | null>(null)
  const [masterSheetId, setMasterSheetId] = useState(getMasterSheetId())
  const [activeProjectName, setActiveProjectNameState] = useState(
    () => localStorage.getItem(ACTIVE_PROJECT_KEY) ?? '',
  )

  const loadMasterFor = useCallback(async (u: GoogleUser, masterId: string) => {
    const data = await loadMasterData(masterId)
    setMaster(data)
    const me = data.users.find((x) => x.email === u.email)
    setStatus(me ? 'ready' : 'unauthorized')
  }, [])

  const signIn = useCallback(async () => {
    setError(null)
    setStatus('busy')
    try {
      const u = await signInWithGoogle()
      setUser(u)
      const masterId = getMasterSheetId()
      if (!masterId) {
        setStatus('need-master')
        return
      }
      await loadMasterFor(u, masterId)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
      setStatus(getClientId() ? 'signed-out' : 'no-client-id')
    }
  }, [loadMasterFor])

  const signOut = useCallback(() => {
    signOutGoogle()
    setUser(null)
    setMaster(null)
    setError(null)
    setStatus(getClientId() ? 'signed-out' : 'no-client-id')
  }, [])

  const setupClientId = useCallback((id: string) => {
    saveClientId(id)
    setError(null)
    setStatus('signed-out')
  }, [])

  const createNewMaster = useCallback(async () => {
    if (!user) return
    setError(null)
    setStatus('busy')
    try {
      const id = await createMasterSheet(user.email)
      saveMasterSheetId(id)
      setMasterSheetId(id)
      await loadMasterFor(user, id)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
      setStatus('need-master')
    }
  }, [user, loadMasterFor])

  const linkExistingMaster = useCallback(
    async (idOrUrl: string) => {
      if (!user) return
      setError(null)
      setStatus('busy')
      try {
        const id = parseSpreadsheetId(idOrUrl)
        // 先驗證讀得到再儲存
        await loadMasterData(id)
        saveMasterSheetId(id)
        setMasterSheetId(id)
        await loadMasterFor(user, id)
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err))
        setStatus('need-master')
      }
    },
    [user, loadMasterFor],
  )

  const refreshMaster = useCallback(async () => {
    if (!user) return
    const masterId = getMasterSheetId()
    if (!masterId) return
    await loadMasterFor(user, masterId)
  }, [user, loadMasterFor])

  /** admin 儲存全域 OCR 設定(provider/model/specPrompt) */
  const saveGlobalOcrConfig = useCallback(
    async (config: OcrConfig) => {
      const masterId = getMasterSheetId()
      if (!masterId || !master) return
      await saveOcrConfig(masterId, config)
      setMaster({ ...master, ocrConfig: config })
    },
    [master],
  )

  /** 首次歸檔照片時自動建立的 Drive 資料夾,回寫到系統主檔 */
  const updateProjectDriveFolder = useCallback(
    async (projectName: string, folderId: string) => {
      const masterId = getMasterSheetId()
      if (!masterId || !master) return
      const updated = master.projects.map((p) =>
        p.name === projectName ? { ...p, driveFolderId: folderId } : p,
      )
      await saveProjects(masterId, updated)
      setMaster({ ...master, projects: updated })
    },
    [master],
  )

  const projects = useMemo(
    () => (master?.projects ?? []).filter((p) => p.active),
    [master],
  )

  const activeProject = useMemo(() => {
    if (projects.length === 0) return null
    return projects.find((p) => p.name === activeProjectName) ?? projects[0]
  }, [projects, activeProjectName])

  const setActiveProjectName = useCallback((name: string) => {
    setActiveProjectNameState(name)
    localStorage.setItem(ACTIVE_PROJECT_KEY, name)
  }, [])

  const role: Role =
    master?.users.find((x) => x.email === user?.email)?.role ?? 'user'

  const value: AuthContextValue = {
    status,
    error,
    user,
    role,
    master,
    masterSheetId,
    projects,
    activeProject,
    setActiveProjectName,
    signIn,
    signOut,
    setupClientId,
    createNewMaster,
    linkExistingMaster,
    refreshMaster,
    updateProjectDriveFolder,
    ocrConfig: master?.ocrConfig ?? null,
    saveGlobalOcrConfig,
  }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

// eslint-disable-next-line react-refresh/only-export-components
export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth 必須在 AuthProvider 內使用')
  return ctx
}
