import { useEffect, useMemo, useState } from 'react'
import { useProjectsStore } from '../../store/projectsStore'
import { useAuthStore } from '../../store/authStore'
import { useUiStore } from '../../store/uiStore'
import { createAndOpenProject } from '../../lib/projects/projectSession'
import { ProjectCard } from './ProjectCard'
import { MenuImportDialog } from './MenuImportDialog'
import { ContentProfileModal } from './ContentProfileModal'
import { ChangelogModal } from './ChangelogModal'
import { LATEST_CHANGELOG_ID } from '../../lib/changelog'

const CHANGELOG_SEEN_KEY = 'fp.changelogSeen'

function hasUnseenChangelog(): boolean {
  try {
    return localStorage.getItem(CHANGELOG_SEEN_KEY) !== LATEST_CHANGELOG_ID
  } catch {
    return false
  }
}

function GithubIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
      <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82a7.5 7.5 0 0 1 4 0c1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0 0 16 8c0-4.42-3.58-8-8-8Z" />
    </svg>
  )
}

export function MainMenu() {
  const projects = useProjectsStore((s) => s.projects)
  const loading = useProjectsStore((s) => s.loading)
  const error = useProjectsStore((s) => s.error)
  const fetchProjects = useProjectsStore((s) => s.fetchProjects)
  const user = useAuthStore((s) => s.user)
  const logout = useAuthStore((s) => s.logout)
  const designTheme = useUiStore((s) => s.designTheme)
  const toggleDesignTheme = useUiStore((s) => s.toggleDesignTheme)

  const [query, setQuery] = useState('')
  const [importOpen, setImportOpen] = useState(false)
  const [creating, setCreating] = useState(false)
  const [profileModalOpen, setProfileModalOpen] = useState(false)
  const [changelogOpen, setChangelogOpen] = useState(false)
  const [unseenUpdates, setUnseenUpdates] = useState(hasUnseenChangelog)

  useEffect(() => {
    fetchProjects()
  }, [fetchProjects])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    const list = q ? projects.filter((p) => p.name.toLowerCase().includes(q)) : projects
    return [...list].sort((a, b) => (a.updated_at < b.updated_at ? 1 : a.updated_at > b.updated_at ? -1 : 0))
  }, [projects, query])

  function openChangelog() {
    setChangelogOpen(true)
    setUnseenUpdates(false)
    try {
      localStorage.setItem(CHANGELOG_SEEN_KEY, LATEST_CHANGELOG_ID)
    } catch {
      // localStorage недоступен — просто не запомним, что прочитано
    }
  }

  function handleCreate() {
    setProfileModalOpen(true)
  }

  async function handleProfileConfirm(profileId: string) {
    setProfileModalOpen(false)
    setCreating(true)
    try {
      await createAndOpenProject(profileId)
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Не удалось создать проект')
      setCreating(false)
    }
  }

  return (
    <div className="main-menu">
      <div className="mm-header">
        <div className="mm-logo">⛭ FACTORY PLANNER</div>
        <a
          className="mm-github"
          href="https://github.com/dk9996/Factorio_blueprint"
          target="_blank"
          rel="noopener noreferrer"
          title="Репозиторий на GitHub"
        >
          <GithubIcon />
        </a>
        <div className="spacer" />
        <input
          className="gm-search-input mm-search"
          placeholder="Поиск по названию…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <button
          className="ie-btn"
          onClick={toggleDesignTheme}
          title="Переключить оформление сайта: новое (как в игре) или старое"
        >
          🎨 Дизайн: {designTheme === 'game' ? 'новый' : 'старый'}
        </button>
        <button className="ie-btn mm-updates-btn" onClick={openChangelog} title="Что нового">
          ✨ Обновления
          {unseenUpdates && <span className="mm-updates-dot" />}
        </button>
        <button className="ie-btn" onClick={() => setImportOpen(true)}>⬇ Импортировать</button>
        {/* Этап 2 (не реализовано): дропдаун "сменить пароль" вместо
        плоского имя+выйти — см. отчёт по задаче "регистрация/вход
        пользователей". */}
        <div className="mm-user-menu">
          <span className="mm-user-name">{user?.username}</span>
          <button className="mm-logout-btn" onClick={() => logout()}>
            Выйти
          </button>
        </div>
      </div>

      <div className="mm-body">
        {loading && <div className="fl-status-msg">Загрузка…</div>}
        {error && <div className="fl-status-msg fl-error">Ошибка: {error}</div>}
        {!loading && !error && (
          <div className="mm-grid">
            <button className="proj-card-create" onClick={handleCreate} disabled={creating}>
              <span className="proj-card-create-plus">+</span>
              <span>{creating ? 'Создаю…' : 'Создать'}</span>
            </button>
            {filtered.map((p) => (
              <ProjectCard key={p.id} project={p} />
            ))}
          </div>
        )}
        {!loading && !error && filtered.length === 0 && (
          <div className="mm-empty">
            {projects.length === 0
              ? 'Пока нет ни одного чертежа — создай или импортируй его'
              : 'Ничего не найдено по этому запросу'}
          </div>
        )}
      </div>

      {importOpen && <MenuImportDialog onClose={() => setImportOpen(false)} />}
      {changelogOpen && <ChangelogModal onClose={() => setChangelogOpen(false)} />}
      {profileModalOpen && (
        <ContentProfileModal
          title="Новый чертёж — выбор контента"
          confirmLabel="Создать"
          onConfirm={handleProfileConfirm}
          onClose={() => setProfileModalOpen(false)}
        />
      )}
    </div>
  )
}
