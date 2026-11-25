import { useEffect, useState } from 'react'
import { useProjectsStore, friendlyError } from '../../store/projectsStore'

interface Props {
  projectId: string
  name: string
}

/** Имя открытого проекта в TopBar — клик превращает его в инлайн-поле. */
export function ProjectNameField({ projectId, name }: Props) {
  const renameProject = useProjectsStore((s) => s.renameProject)
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(name)

  useEffect(() => {
    if (!editing) setDraft(name)
  }, [name, editing])

  async function commit() {
    setEditing(false)
    const trimmed = draft.trim()
    if (!trimmed || trimmed === name) return
    try {
      await renameProject(projectId, trimmed)
    } catch (err) {
      alert(friendlyError(err))
    }
  }

  if (editing) {
    return (
      <input
        className="topbar-project-name-input"
        value={draft}
        autoFocus
        onChange={(e) => setDraft(e.target.value)}
        onFocus={(e) => e.currentTarget.select()}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
          if (e.key === 'Escape') setEditing(false)
        }}
      />
    )
  }

  return (
    <button className="topbar-project-name" onClick={() => setEditing(true)} title="Переименовать проект">
      {name || '…'}
    </button>
  )
}
