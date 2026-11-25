import { useEffect, useMemo, useState } from 'react'
import type { MouseEvent as ReactMouseEvent, RefObject } from 'react'
import { useCanvasStore } from '../store/canvasStore'
import { useEntityCatalogStore } from '../store/entityCatalogStore'
import { useUiStore } from '../store/uiStore'
import { useViewportStore } from '../store/viewportStore'
import { checkWire, connectorPoint, GRID, nearestConnector, type WireCheck } from '../lib/circuit/connectors'

// Инструмент «провод» (красный/зелёный): клик по сущности с коннектором
// закрепляет первый конец (у комбинатора — ближайший к курсору input/output),
// второй клик по другой сущности создаёт провод (или удаляет уже
// существующий того же цвета между теми же коннекторами). После этого
// инструмент остаётся активным без закреплённого конца. Esc / ПКМ отменяют
// незавершённый провод (повторный Esc выключает инструмент).
export function useWireTool(wrapRef: RefObject<HTMLDivElement | null>) {
  const wireTool = useUiStore((s) => s.wireTool)
  const wireStart = useUiStore((s) => s.wireStart)
  const catalog = useEntityCatalogStore((s) => s.entities)
  const catalogByTypeId = useMemo(() => new Map(catalog.map((c) => [c.typeId, c])), [catalog])
  const [cursor, setCursor] = useState<{ x: number; y: number } | null>(null)
  const [hoverEntityId, setHoverEntityId] = useState<number | null>(null)
  const [hoverConnector, setHoverConnector] = useState<string | null>(null)
  // проверка для подсказки «слишком далеко» (пока провод тянется)
  const [pendingCheck, setPendingCheck] = useState<WireCheck | null>(null)

  function toWorld(point: { clientX: number; clientY: number }) {
    const bounds = wrapRef.current!.getBoundingClientRect()
    const { offsetX, offsetY, scale } = useViewportStore.getState()
    return { x: (point.clientX - bounds.left - offsetX) / scale, y: (point.clientY - bounds.top - offsetY) / scale }
  }

  // Сущность с коннекторами под точкой (с запасом в пол-тайла) — ближайшая по центру.
  function entityAt(point: { x: number; y: number }) {
    const { entities } = useCanvasStore.getState()
    const margin = GRID / 2
    let best: { id: number; dist: number } | null = null
    for (const e of entities) {
      if (!catalogByTypeId.get(e.typeId)?.connectors) continue
      if (point.x < e.x - margin || point.x > e.x + e.width + margin) continue
      if (point.y < e.y - margin || point.y > e.y + e.height + margin) continue
      const d = Math.hypot(point.x - (e.x + e.width / 2), point.y - (e.y + e.height / 2))
      if (!best || d < best.dist) best = { id: e.id, dist: d }
    }
    return best?.id ?? null
  }

  function computeCheck(color: 'red' | 'green', entityId: number, connector: string): WireCheck | null {
    const start = useUiStore.getState().wireStart
    if (!start) return null
    const { entities } = useCanvasStore.getState()
    const a = entities.find((e) => e.id === start.entityId)
    const b = entities.find((e) => e.id === entityId)
    if (!a || !b) return null
    return checkWire(
      { entity: a, catalog: catalogByTypeId.get(a.typeId), connector: start.connector },
      { entity: b, catalog: catalogByTypeId.get(b.typeId), connector },
      color,
      a.id === b.id,
    )
  }

  function onMouseMove(e: ReactMouseEvent) {
    if (!wireTool || !wrapRef.current) return
    const w = toWorld(e)
    setCursor(w)
    const id = entityAt(w)
    setHoverEntityId(id)
    if (id === null) {
      setHoverConnector(null)
      setPendingCheck(null)
      return
    }
    const ent = useCanvasStore.getState().entities.find((x) => x.id === id)!
    const conn = nearestConnector(ent, catalogByTypeId.get(ent.typeId), w)
    setHoverConnector(conn?.id ?? null)
    setPendingCheck(conn ? computeCheck(wireTool, id, conn.id) : null)
  }

  function onMouseDownCapture(e: ReactMouseEvent) {
    if (!wireTool || !wrapRef.current) return
    if (e.button !== 0 && e.button !== 2) return
    const target = e.target as HTMLElement
    if (target !== wrapRef.current && !target.closest('.canvas-viewport')) return
    e.preventDefault()
    e.stopPropagation()

    const ui = useUiStore.getState()
    if (e.button === 2) {
      // ПКМ: отменить незавершённый провод
      if (ui.wireStart) ui.setWireStart(null)
      return
    }
    const w = toWorld(e)
    const id = entityAt(w)
    if (id === null) return
    const store = useCanvasStore.getState()
    const ent = store.entities.find((x) => x.id === id)
    if (!ent) return
    const conn = nearestConnector(ent, catalogByTypeId.get(ent.typeId), w)
    if (!conn) return

    if (!ui.wireStart) {
      ui.setWireStart({ entityId: id, connector: conn.id })
      return
    }
    const check = computeCheck(wireTool, id, conn.id)
    if (!check?.ok) return // запрет: подсказка уже показана, начало остаётся
    store.toggleWire(wireTool, ui.wireStart, { entityId: id, connector: conn.id })
    ui.setWireStart(null)
  }

  function onMouseLeave() {
    setHoverEntityId(null)
    setHoverConnector(null)
  }

  useEffect(() => {
    if (!wireTool) {
      setCursor(null)
      setHoverEntityId(null)
      setHoverConnector(null)
      setPendingCheck(null)
      return
    }
    function onKey(e: KeyboardEvent) {
      if (e.key !== 'Escape') return
      e.stopImmediatePropagation()
      const ui = useUiStore.getState()
      if (ui.wireStart) ui.setWireStart(null)
      else ui.setWireTool(null)
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [wireTool])

  // отменить закреплённый конец, если сущность удалили (undo и т.п.)
  useEffect(() => {
    if (!wireStart) return
    return useCanvasStore.subscribe((s) => {
      if (!s.entities.some((x) => x.id === wireStart.entityId)) useUiStore.getState().setWireStart(null)
    })
  }, [wireStart])

  return { wireTool, wireStart, cursor, hoverEntityId, hoverConnector, pendingCheck, onMouseDownCapture, onMouseMove, onMouseLeave, connectorPoint }
}
