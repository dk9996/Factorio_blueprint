import { useEffect, useRef } from 'react'
import { useUiStore } from '../store/uiStore'
import { useTabsStore } from '../store/tabsStore'
import { useCanvasStore } from '../store/canvasStore'
import { saveActiveProject } from '../lib/projects/projectSession'

const DEBOUNCE_MS = 1500

/**
 * Автосохранение открытого проекта — дебаунс после последней правки
 * canvasStore (сущности/история) ИЛИ tabsStore (вкладки: переименование,
 * новая/закрытая вкладка, переключение). Активно только пока открыт
 * редактор конкретного проекта (см. uiStore.view/activeProjectId) — при
 * возврате в меню (returnToMenu) сохранение уже выполняется явно и сразу,
 * без ожидания дебаунса.
 */
export function useProjectAutosave() {
  const view = useUiStore((s) => s.view)
  const activeProjectId = useUiStore((s) => s.activeProjectId)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (view !== 'editor' || !activeProjectId) return

    function scheduleSave() {
      if (timerRef.current) clearTimeout(timerRef.current)
      timerRef.current = setTimeout(() => {
        saveActiveProject(activeProjectId as string).catch(() => {
          // Сетевая ошибка — тихо, следующее изменение запланирует новую
          // попытку; явный выход в меню тоже пытается сохранить.
        })
      }, DEBOUNCE_MS)
    }

    const unsubCanvas = useCanvasStore.subscribe(scheduleSave)
    const unsubTabs = useTabsStore.subscribe(scheduleSave)

    return () => {
      unsubCanvas()
      unsubTabs()
      if (timerRef.current) clearTimeout(timerRef.current)
    }
  }, [view, activeProjectId])
}
