import { useEffect, useRef, useState } from 'react'
import type { RefObject, MouseEvent as ReactMouseEvent } from 'react'
import { useCanvasStore, type PlacingGroupItem } from '../store/canvasStore'
import { useViewportStore } from '../store/viewportStore'
import { cellsInRect, cellsOnLine, TILE_GRID, worldToCell } from '../lib/tiles'

export interface TileRect {
  x0: number
  y0: number
  x1: number
  y1: number
  erase: boolean
}

// Рисование плитками на холсте (см. BlueprintCanvas.tsx):
//  * ЛКМ — поставить плитку, зажатая ЛКМ + движение — кисть по всем ячейкам
//    (между событиями мыши ячейки интерполируются по линии, без пропусков);
//  * Shift + ЛКМ-drag — заливка прямоугольника от точки нажатия до курсора
//    (превью), отпускание применяет;
//  * ПКМ / ПКМ-drag (плитка в курсоре) — стирание, Shift+ПКМ — стирание
//    прямоугольника;
//  * один штрих / одна заливка = ОДИН шаг undo (см. canvasStore.paintTiles).
// Обработчик нажатия — в capture-фазе: пока в курсоре плитка, мышь над
// сущностью тоже рисует (а не выделяет/удаляет сущность).
export function useTilePainting(wrapRef: RefObject<HTMLDivElement | null>, placing: { items: PlacingGroupItem[] } | null) {
  const item = placing && placing.items.length === 1 && placing.items[0].type === 'tile' ? placing.items[0] : null
  const itemRef = useRef(item)
  itemRef.current = item

  const [cursorCell, setCursorCell] = useState<{ x: number; y: number } | null>(null)
  const [rect, setRect] = useState<TileRect | null>(null)
  const strokeRef = useRef<{
    erase: boolean
    name: string
    rectStart: [number, number] | null
    last: [number, number]
    pushed: boolean
  } | null>(null)

  function cellOf(point: { clientX: number; clientY: number }): [number, number] {
    const bounds = wrapRef.current!.getBoundingClientRect()
    const { offsetX, offsetY, scale } = useViewportStore.getState()
    const wx = (point.clientX - bounds.left - offsetX) / scale
    const wy = (point.clientY - bounds.top - offsetY) / scale
    return [worldToCell(wx), worldToCell(wy)]
  }

  function apply(cells: [number, number][]) {
    const s = strokeRef.current
    if (!s) return
    const changed = useCanvasStore.getState().paintTiles(cells, s.erase ? null : s.name, !s.pushed)
    if (changed) s.pushed = true
  }

  function onWindowMove(e: MouseEvent) {
    const s = strokeRef.current
    if (!s || !wrapRef.current) return
    const cell = cellOf(e)
    setCursorCell({ x: cell[0], y: cell[1] })
    if (s.rectStart) {
      setRect({ x0: s.rectStart[0], y0: s.rectStart[1], x1: cell[0], y1: cell[1], erase: s.erase })
      return
    }
    if (cell[0] === s.last[0] && cell[1] === s.last[1]) return
    apply(cellsOnLine(s.last[0], s.last[1], cell[0], cell[1]))
    s.last = cell
  }

  function onWindowUp(e: MouseEvent) {
    const s = strokeRef.current
    window.removeEventListener('mousemove', onWindowMove)
    window.removeEventListener('mouseup', onWindowUp)
    if (!s) return
    if (s.rectStart && wrapRef.current) {
      const cell = cellOf(e)
      apply(cellsInRect(s.rectStart[0], s.rectStart[1], cell[0], cell[1]))
    }
    strokeRef.current = null
    setRect(null)
  }

  // Мышь над окнами/панелями (они тоже внутри дерева холста) рисовать не должна.
  function onMouseDownCapture(e: ReactMouseEvent) {
    const it = itemRef.current
    if (!it || !wrapRef.current) return
    if (e.button !== 0 && e.button !== 2) return
    const target = e.target as HTMLElement
    if (target !== wrapRef.current && !target.closest('.canvas-viewport')) return
    e.preventDefault()
    e.stopPropagation()
    const cell = cellOf(e)
    const erase = e.button === 2
    strokeRef.current = { erase, name: it.typeId, rectStart: e.shiftKey ? cell : null, last: cell, pushed: false }
    setCursorCell({ x: cell[0], y: cell[1] })
    if (e.shiftKey) setRect({ x0: cell[0], y0: cell[1], x1: cell[0], y1: cell[1], erase })
    else apply([cell])
    window.addEventListener('mousemove', onWindowMove)
    window.addEventListener('mouseup', onWindowUp)
  }

  function onMouseMove(e: ReactMouseEvent) {
    if (!itemRef.current || !wrapRef.current) {
      if (cursorCell) setCursorCell(null)
      return
    }
    const [x, y] = cellOf(e)
    setCursorCell((prev) => (prev?.x === x && prev?.y === y ? prev : { x, y }))
  }

  function onMouseLeave() {
    if (!strokeRef.current) setCursorCell(null)
  }

  // Плитку убрали из курсора (Esc и т.п.) — сбросить призрак/прерванный штрих.
  useEffect(() => {
    if (!item) {
      setCursorCell(null)
      setRect(null)
    }
  }, [item])

  useEffect(
    () => () => {
      window.removeEventListener('mousemove', onWindowMove)
      window.removeEventListener('mouseup', onWindowUp)
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  )

  return { tileItem: item, cursorCell, rect, onMouseDownCapture, onMouseMove, onMouseLeave, TILE_GRID }
}
