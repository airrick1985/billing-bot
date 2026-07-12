import { useAuth } from '../hooks/useAuth'

export default function ProjectSwitcher() {
  const { projects, activeProject, setActiveProjectName, role } = useAuth()

  if (projects.length === 0) {
    return (
      <span className="nb-badge bg-[var(--nb-amber)] px-3 py-1.5 text-xs">
        {role === 'admin' ? '尚無建案,請到管理後台新增' : '無可用建案,請聯絡管理者授權'}
      </span>
    )
  }

  return (
    <label className="flex items-center gap-2 text-sm">
      <span className="text-xs font-bold">建案</span>
      <select
        value={activeProject?.name ?? ''}
        onChange={(e) => setActiveProjectName(e.target.value)}
        className="nb-select px-3 py-1.5 text-sm font-bold"
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
