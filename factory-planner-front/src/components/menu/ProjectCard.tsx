import { useRef, useState } from 'react'
import type { ProjectListItem } from '../../lib/api/projects'
import { projectsRepository } from '../../lib/api/projects'
import { entitiesApi } from '../../lib/api/entities'
import { openProjectInEditor } from '../../lib/projects/projectSession'
import { exportProjectDataAsString } from '../../lib/projects/bookExport'
import { computeProfileChangeImpact, type ProfileChangeImpact } from '../../lib/content/profileImpact'
import { paksFromProfileId, profileHasQuality } from '../../lib/content/profile'
import { useProjectsStore, friendlyError } from '../../store/projectsStore'
import { useEntityCatalogStore } from '../../store/entityCatalogStore'
import type { CatalogEntity } from '../../store/entityCatalogStore'
import { ProjectCardMenu } from './ProjectCardMenu'
import { ConfirmDialog } from '../common/ConfirmDialog'
import { ContentProfileModal } from './ContentProfileModal'

interface Props {
  project: ProjectListItem
}

function formatDate(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${pad(d.getDate())}.${pad(d.getMonth() + 1)}.${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

function downloadTextFile(name: string, text: string) {
  const blob = new Blob([text], { type: 'text/plain;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  const safeName = name.replace(/[^\p{L}\p{N}_-]+/gu, '_')
  a.href = url
  a.download = `${safeName || 'blueprint'}.txt`
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}

export function ProjectCard({ project }: Props) {
  const menuBtnRef = useRef<HTMLButtonElement>(null)
  const [menuAnchor, setMenuAnchor] = useState<DOMRect | null>(null)
  const [editingName, setEditingName] = useState(false)
  const [nameDraft, setNameDraft] = useState(project.name)
  const [busy, setBusy] = useState(false)
  const [confirmingDelete, setConfirmingDelete] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [pendingProfileChange, setPendingProfileChange] = useState<
    { profileId: string; impact: ProfileChangeImpact } | null
  >(null)

  const renameProject = useProjectsStore((s) => s.renameProject)
  const duplicateProject = useProjectsStore((s) => s.duplicateProject)
  const deleteProject = useProjectsStore((s) => s.deleteProject)
  const changeContentProfile = useProjectsStore((s) => s.changeContentProfile)

  function handleOpen() {
    openProjectInEditor(project.id).catch((err) => alert(friendlyError(err)))
  }

  function startRename() {
    setNameDraft(project.name)
    setEditingName(true)
  }

  async function commitRename() {
    setEditingName(false)
    const trimmed = nameDraft.trim()
    if (!trimmed || trimmed === project.name) return
    try {
      await renameProject(project.id, trimmed)
    } catch (err) {
      alert(friendlyError(err))
    }
  }

  async function handleDuplicate() {
    setBusy(true)
    try {
      await duplicateProject(project.id)
    } catch (err) {
      alert(friendlyError(err))
    } finally {
      setBusy(false)
    }
  }

  async function handleExport() {
    setBusy(true)
    try {
      const detail = await projectsRepository.get(project.id)
      const catalog = useEntityCatalogStore.getState().entities
      const catalogByTypeId = new Map<string, CatalogEntity>(catalog.map((c) => [c.typeId, c]))
      const text = exportProjectDataAsString(detail.data, catalogByTypeId, detail.name, profileHasQuality(detail.content_profile))
      try {
        await navigator.clipboard.writeText(text)
      } catch {
        // буфер может быть недоступен (разрешения/контекст) — скачивание
        // ниже всё равно сработает, это не критичная ошибка
      }
      downloadTextFile(detail.name, text)
    } catch (err) {
      alert(friendlyError(err))
    } finally {
      setBusy(false)
    }
  }

  async function confirmDelete() {
    setConfirmingDelete(false)
    setBusy(true)
    try {
      await deleteProject(project.id)
    } catch (err) {
      alert(friendlyError(err))
      setBusy(false)
    }
  }

  // Смена профиля контента — отдельный путь от remane/duplicate: считаем
  // "ущерб" (сколько сущностей станет невидимо в новом профиле) ПЕРЕД
  // применением и явно предупреждаем, если он не нулевой (см. отчёт по
  // задаче "никогда не удалять молча"). Данные проекта при этом не трогаем
  // вовсе — PATCH меняет только content_profile.
  async function handleProfileChange(newProfileId: string) {
    setSettingsOpen(false)
    if (newProfileId === project.content_profile) return
    setBusy(true)
    try {
      const [detail, newCatalog] = await Promise.all([
        projectsRepository.get(project.id),
        entitiesApi.list(newProfileId),
      ])
      const impact = computeProfileChangeImpact(detail.data, newCatalog)
      if (impact.removedCount === 0) {
        await changeContentProfile(project.id, newProfileId)
        setBusy(false)
        return
      }
      setPendingProfileChange({ profileId: newProfileId, impact })
      setBusy(false)
    } catch (err) {
      alert(friendlyError(err))
      setBusy(false)
    }
  }

  async function confirmProfileChange() {
    if (!pendingProfileChange) return
    const { profileId } = pendingProfileChange
    setPendingProfileChange(null)
    setBusy(true)
    try {
      await changeContentProfile(project.id, profileId)
    } catch (err) {
      alert(friendlyError(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className={`proj-card${busy ? ' busy' : ''}`} onClick={editingName ? undefined : handleOpen}>
      <div className="proj-card-thumb">
        {project.thumbnail ? <img src={project.thumbnail} alt="" /> : <div className="proj-card-thumb-empty" />}
      </div>
      <div className="proj-card-meta">
        {editingName ? (
          <input
            className="proj-card-name-input"
            value={nameDraft}
            autoFocus
            onClick={(e) => e.stopPropagation()}
            onChange={(e) => setNameDraft(e.target.value)}
            onBlur={commitRename}
            onKeyDown={(e) => {
              if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
              if (e.key === 'Escape') setEditingName(false)
            }}
          />
        ) : (
          <div className="proj-card-name">{project.name}</div>
        )}
        <div className="proj-card-sub">
          {formatDate(project.updated_at)} · {project.entity_count} сущностей
        </div>
      </div>
      <button
        ref={menuBtnRef}
        className="gm-icon-btn proj-card-menu-btn"
        onClick={(e) => {
          e.stopPropagation()
          setMenuAnchor(menuBtnRef.current?.getBoundingClientRect() ?? null)
        }}
      >
        ⋯
      </button>
      {menuAnchor && (
        <ProjectCardMenu
          anchorRect={menuAnchor}
          onClose={() => setMenuAnchor(null)}
          onOpen={() => {
            setMenuAnchor(null)
            handleOpen()
          }}
          onRename={() => {
            setMenuAnchor(null)
            startRename()
          }}
          onDuplicate={() => {
            setMenuAnchor(null)
            handleDuplicate()
          }}
          onExport={() => {
            setMenuAnchor(null)
            handleExport()
          }}
          onSettings={() => {
            setMenuAnchor(null)
            setSettingsOpen(true)
          }}
          onDelete={() => {
            setMenuAnchor(null)
            setConfirmingDelete(true)
          }}
        />
      )}
      {confirmingDelete && (
        <ConfirmDialog
          title="Удаление проекта"
          message={`Удалить проект «${project.name}»? Это необратимо.`}
          confirmLabel="Удалить"
          danger
          onConfirm={confirmDelete}
          onCancel={() => setConfirmingDelete(false)}
        />
      )}
      {settingsOpen && (
        <ContentProfileModal
          title="Настройки — профиль контента"
          confirmLabel="Сохранить"
          initial={paksFromProfileId(project.content_profile)}
          onConfirm={handleProfileChange}
          onClose={() => setSettingsOpen(false)}
        />
      )}
      {pendingProfileChange && (
        <ConfirmDialog
          title="Смена профиля контента"
          message={
            `${pendingProfileChange.impact.removedCount} сущностей (` +
            `${pendingProfileChange.impact.removedTypeLabels.slice(0, 5).join(', ')}` +
            `${pendingProfileChange.impact.removedTypeLabels.length > 5 ? '…' : ''}) ` +
            `станут недоступны в новом профиле и перестанут отображаться в редакторе. ` +
            `Данные не удаляются — вернёте прежний профиль, и они снова появятся. Продолжить?`
          }
          confirmLabel="Сменить профиль"
          danger
          onConfirm={confirmProfileChange}
          onCancel={() => setPendingProfileChange(null)}
        />
      )}
    </div>
  )
}
