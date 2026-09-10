import { useEffect, useRef } from 'react'
import { useFactoryStore } from '../store/factoryStore'
import { useCanvasStore } from '../store/canvasStore'

/**
 * Следит за activeId в factoryStore. Когда пользователь выбирает
 * другой завод в списке — подгружает его entities в canvasStore.
 */
export function useSyncActiveFactory() {
  const activeId = useFactoryStore((s) => s.activeId)
  const factories = useFactoryStore((s) => s.factories)
  const loadEntities = useCanvasStore((s) => s.loadEntities)

  const lastLoadedId = useRef<string | null>(null)

  useEffect(() => {
    if (!activeId) return
    if (lastLoadedId.current === activeId) return // уже загружен, не дублируем

    const factory = factories.find((f) => f.id === activeId)
    if (!factory) return

    loadEntities(factory.entities)
    lastLoadedId.current = activeId
  }, [activeId, factories, loadEntities])
}