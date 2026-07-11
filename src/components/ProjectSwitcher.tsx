import { useAuth } from '../hooks/useAuth'

export default function ProjectSwitcher() {
  const { projects, activeProject, setActiveProjectName } = useAuth()

  if (projects.length === 0) {
    return (
      <span className="rounded-lg bg-amber-50 px-3 py-1.5 text-xs text-amber-800 ring-1 ring-amber-200">
        尚無建案,請到管理後台新增
      </span>
    )
  }

  return (
    <label className="flex items-center gap-2 text-sm">
      <span className="text-xs text-slate-500">建案</span>
      <select
        value={activeProject?.name ?? ''}
        onChange={(e) => setActiveProjectName(e.target.value)}
        className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-800 shadow-sm focus:border-indigo-400 focus:outline-none focus:ring-1 focus:ring-indigo-200"
      >
        {projects.map((p) => (
          <option key={p.name} value={p.name}>
            {p.name}
          </option>
        ))}
      </select>
    </label>
  )
}
