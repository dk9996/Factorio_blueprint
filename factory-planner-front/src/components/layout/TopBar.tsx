import { useState } from 'react'
import { useFactoryStore } from '../../store/factoryStore'
import { useUiStore } from '../../store/uiStore'
import { useProjectsStore, friendlyError } from '../../store/projectsStore'
import { returnToMenu } from '../../lib/projects/projectSession'
import { SettingsPanel } from './SettingsPanel'
import { ProjectNameField } from './ProjectNameField'
import { SimButton } from '../circuit/SimPanel'

export function TopBar() {
  const activeId = useFactoryStore((s) => s.activeId)
  const factories = useFactoryStore((s) => s.factories)
  const active = factories.find((f) => f.id === activeId)
  const selectionToolActive = useUiStore((s) => s.selectionToolActive)
  const toggleSelectionTool = useUiStore((s) => s.toggleSelectionTool)
  const activeProjectId = useUiStore((s) => s.activeProjectId)
  const activeProject = useProjectsStore((s) => s.projects.find((p) => p.id === activeProjectId))
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [leaving, setLeaving] = useState(false)

  async function handleBackToMenu() {
    setLeaving(true)
    try {
      await returnToMenu()
    } catch (err) {
      alert(friendlyError(err))
      setLeaving(false)
    }
  }

  return (
    <div className="topbar">
      <button className="select-tool-btn" onClick={handleBackToMenu} disabled={leaving} title="Сохранить и вернуться к списку проектов">
        {leaving ? '…' : '← В меню'}
      </button>
      <div className="logo">⛭ FACTORY PLANNER</div>
      {activeProjectId && <ProjectNameField projectId={activeProjectId} name={activeProject?.name ?? ''} />}
      <div className="breadcrumb">
        Заводы / <b>{active ? active.name : 'не выбрано'}</b>
      </div>
      <div className="spacer" />
      <button
        className={`select-tool-btn${selectionToolActive ? ' active' : ''}`}
        onClick={toggleSelectionTool}
        title="Инструмент выделения: клик и рамка выделяют сущности; Ctrl+рамка (или Ctrl+клик по плитке) — только плитки, Delete удаляет выделенные плитки. Перемещение, ПКМ-удержание-удаление и Shift-копирование/вставка рецепта работают вне зависимости от него."
      >
        ⬚ Выделение
      </button>
      <SimButton />
      <button
        className={`select-tool-btn${settingsOpen ? ' active' : ''}`}
        onClick={() => setSettingsOpen((v) => !v)}
        title="Настройки"
      >
        ⚙ Настройки
      </button>
      <div className="sim-status">
        <span className="dot" /> симуляция актуальна · 60 тик/с
      </div>
      {settingsOpen && <SettingsPanel onClose={() => setSettingsOpen(false)} />}
    </div>
  )
}