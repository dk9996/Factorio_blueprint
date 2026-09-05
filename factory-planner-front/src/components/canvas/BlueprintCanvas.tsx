import { useEffect, useRef, useState } from 'react'
import { useUiStore } from '../../store/uiStore'
import { useCanvasStore } from '../../store/canvasStore'
import { EntityNode } from './EntityNode'
import { StatPopover } from './StatPopover'
import { BalancePanel } from '../balance-panel/BalancePanel'
import { PlacementGhost } from './PlacementGhost'
import { useClipboardStore } from '../../store/clipboardStore'
import { ImportExportPanel } from './ImportExportPanel'
import { buildPlacingGroup } from '../../lib/clipboard/buildPlacingGroup'
import { useViewportStore } from '../../store/viewportStore'
import { MachineInfoPanel } from './MachineInfoPanel'
import { RecipePickerModal } from './RecipePickerModal'

const GRID = 32

export function BlueprintCanvas() {
  const offsetX = useViewportStore((s) => s.offsetX)
  const offsetY = useViewportStore((s) => s.offsetY)
  const scale = useViewportStore((s) => s.scale)
  const setOffset = useViewportStore((s) => s.setOffset)
  const setScale = useViewportStore((s) => s.setScale)

  const panRef = useRef<{ startX: number; startY: number; origOffsetX: number; origOffsetY: number } | null>(null)
  const selectedEntityIds = useUiStore((s) => s.selectedEntityIds)
  const selectOnly = useUiStore((s) => s.selectOnly)
  const toggleSelection = useUiStore((s) => s.toggleSelection)
  const setSelection = useUiStore((s) => s.setSelection)
  const addToSelection = useUiStore((s) => s.addToSelection)
  const clearSelection = useUiStore((s) => s.clearSelection)

  const entities = useCanvasStore((s) => s.entities)
  const placing = useCanvasStore((s) => s.placing)
  const setPlacing = useCanvasStore((s) => s.setPlacing)
  const addEntity = useCanvasStore((s) => s.addEntity)
  const addEntities = useCanvasStore((s) => s.addEntities)
  const canPlaceAt = useCanvasStore((s) => s.canPlaceAt)
  const removeEntities = useCanvasStore((s) => s.removeEntities)
  const setEntityRecipe = useCanvasStore((s) => s.setEntityRecipe)
  const undo = useCanvasStore((s) => s.undo)
  const redo = useCanvasStore((s) => s.redo)

  const clipboardBuffer = useClipboardStore((s) => s.buffer)
  const copyToClipboard = useClipboardStore((s) => s.copy)

  const wrapRef = useRef<HTMLDivElement>(null)
  const selectedEntity =
    selectedEntityIds.size === 1
      ? entities.find((e) => e.id === Array.from(selectedEntityIds)[0])
      : undefined

  const [ghostPos, setGhostPos] = useState<{ x: number; y: number } | null>(null)

  function handleCanvasMouseDownForPan(e: React.MouseEvent) {
    if (e.button !== 2) return // только правая кнопка
    e.preventDefault()
    panRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      origOffsetX: offsetX,
      origOffsetY: offsetY,
    }
    window.addEventListener('mousemove', handlePanMove)
    window.addEventListener('mouseup', handlePanUp)
  }

  function handleWheel(e: React.WheelEvent) {
    e.preventDefault()
    const rect = wrapRef.current!.getBoundingClientRect()
    const cursorX = e.clientX - rect.left
    const cursorY = e.clientY - rect.top

    const delta = e.deltaY < 0 ? 1.1 : 1 / 1.1
    const newScale = Math.min(3, Math.max(0.25, scale * delta))

    const worldX = (cursorX - offsetX) / scale
    const worldY = (cursorY - offsetY) / scale
    const newOffsetX = cursorX - worldX * newScale
    const newOffsetY = cursorY - worldY * newScale

    setScale(newScale)
    setOffset(newOffsetX, newOffsetY)
  }

  function handlePanMove(e: MouseEvent) {
    if (!panRef.current) return
    const dx = e.clientX - panRef.current.startX
    const dy = e.clientY - panRef.current.startY
    setOffset(panRef.current.origOffsetX + dx, panRef.current.origOffsetY + dy)
  }

  function handlePanUp() {
    panRef.current = null
    window.removeEventListener('mousemove', handlePanMove)
    window.removeEventListener('mouseup', handlePanUp)
  }

  const [marquee, setMarquee] = useState<{ startX: number; startY: number; x: number; y: number } | null>(null)
  const marqueeShiftRef = useRef(false)

  function getLocalPoint(e: React.MouseEvent) {
    const rect = wrapRef.current!.getBoundingClientRect()
    const screenX = e.clientX - rect.left
    const screenY = e.clientY - rect.top
    return {
      x: (screenX - offsetX) / scale,
      y: (screenY - offsetY) / scale,
    }
  }

  function handleCanvasMouseDown(e: React.MouseEvent) {
    if (e.button !== 0) return
    if (e.target !== wrapRef.current) return
    if (placing) return

    const { x, y } = getLocalPoint(e)
    marqueeShiftRef.current = e.shiftKey
    setMarquee({ startX: x, startY: y, x, y })
    window.addEventListener('mousemove', handleMarqueeMove)
    window.addEventListener('mouseup', handleMarqueeUp)
  }

  function handleMarqueeMove(e: MouseEvent) {
    setMarquee((prev) => {
      if (!prev || !wrapRef.current) return prev
      const rect = wrapRef.current.getBoundingClientRect()
      const screenX = e.clientX - rect.left
      const screenY = e.clientY - rect.top
      return {
        ...prev,
        x: (screenX - offsetX) / scale,
        y: (screenY - offsetY) / scale,
      }
    })
  }

  function handleMarqueeUp() {
    setMarquee((prev) => {
      if (prev) {
        const minX = Math.min(prev.startX, prev.x)
        const maxX = Math.max(prev.startX, prev.x)
        const minY = Math.min(prev.startY, prev.y)
        const maxY = Math.max(prev.startY, prev.y)

        const isClick = maxX - minX < 3 && maxY - minY < 3

        if (isClick) {
          if (!marqueeShiftRef.current) clearSelection()
        } else {
          const hitIds = entities
            .filter(
              (ent) =>
                ent.x < maxX &&
                ent.x + ent.width > minX &&
                ent.y < maxY &&
                ent.y + ent.height > minY,
            )
            .map((ent) => ent.id)

          if (marqueeShiftRef.current) addToSelection(hitIds)
          else setSelection(hitIds)
        }
      }
      return null
    })
    window.removeEventListener('mousemove', handleMarqueeMove)
    window.removeEventListener('mouseup', handleMarqueeUp)
  }

  function handleCanvasMouseMove(e: React.MouseEvent) {
    if (!placing || !wrapRef.current) {
      if (ghostPos) setGhostPos(null)
      return
    }
    const { x: rawX, y: rawY } = getLocalPoint(e)
    const x = Math.round(rawX / GRID) * GRID
    const y = Math.round(rawY / GRID) * GRID
    setGhostPos((prev) => (prev?.x === x && prev?.y === y ? prev : { x, y }))
  }

  function handleCanvasClick(e: React.MouseEvent) {
    if (e.target !== wrapRef.current) return
    if (!placing) return

    const { x: rawX, y: rawY } = getLocalPoint(e)
    const baseX = Math.round(rawX / GRID) * GRID
    const baseY = Math.round(rawY / GRID) * GRID

    const toPlace = placing.items.map((item) => ({
      typeId: item.typeId,
      icon: item.icon,
      label: item.label,
      x: baseX + item.offsetX,
      y: baseY + item.offsetY,
      width: item.width,
      height: item.height,
      craftingCategories: item.craftingCategories,
      moduleSlots: item.moduleSlots,
    }))

    const allFit = toPlace.every((p) =>
      canPlaceAt({ x: p.x, y: p.y, width: p.width, height: p.height }),
    )
    if (!allFit) return

    if (toPlace.length === 1) {
      addEntity(toPlace[0])
    } else {
      const newIds = addEntities(toPlace)
      setSelection(newIds)
    }
  }

  const lastMouse = useRef({ x: 0, y: 0 })
  useEffect(() => {
    function handleMouseMove(e: MouseEvent) {
      lastMouse.current = { x: e.clientX, y: e.clientY }
    }
    window.addEventListener('mousemove', handleMouseMove)
    return () => window.removeEventListener('mousemove', handleMouseMove)
  }, [])

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      const active = document.activeElement
      const isTyping =
        active instanceof HTMLInputElement ||
        active instanceof HTMLTextAreaElement ||
        active?.getAttribute('contenteditable') === 'true'
      if (isTyping) return

      const ctrl = e.ctrlKey || e.metaKey

      if (ctrl && !e.shiftKey && e.code === 'KeyZ') {
        e.preventDefault()
        undo()
        return
      }
      if ((ctrl && e.shiftKey && e.code === 'KeyZ') || (ctrl && e.code === 'KeyY')) {
        e.preventDefault()
        redo()
        return
      }

      if (ctrl && e.code === 'KeyC') {
        e.preventDefault()
        const selected = entities.filter((en) => selectedEntityIds.has(en.id))
        if (selected.length > 0) copyToClipboard(selected)
        return
      }

      if (ctrl && e.code === 'KeyX') {
        e.preventDefault()
        const selected = entities.filter((en) => selectedEntityIds.has(en.id))
        if (selected.length > 0) {
          copyToClipboard(selected)
          removeEntities(selectedEntityIds)
          clearSelection()
        }
        return
      }

      if (ctrl && e.code === 'KeyV') {
        e.preventDefault()
        if (clipboardBuffer.length === 0) return
        const group = buildPlacingGroup(clipboardBuffer)
        setPlacing({ items: group })
        return
      }

      if (e.code === 'KeyQ' && !e.repeat) {
        const target = document.elementFromPoint(lastMouse.current.x, lastMouse.current.y)
        const entityEl = target?.closest('[data-entity-id]') as HTMLElement | null

        if (entityEl) {
          const id = Number(entityEl.dataset.entityId)
          const entity = entities.find((en) => en.id === id)
          if (entity) {
            setPlacing({
              items: [{
                typeId: entity.typeId,
                icon: entity.icon,
                label: entity.label,
                width: entity.width,
                height: entity.height,
                offsetX: 0,
                offsetY: 0,
              }],
            })
            return
          }
        }
        setPlacing(null)
        return
      }

      if (e.code === 'Delete' || e.code === 'Backspace') {
        if (selectedEntityIds.size > 0) {
          e.preventDefault()
          removeEntities(selectedEntityIds)
          clearSelection()
        }
        return
      }

      if (e.code === 'Escape') {
        if (placing) setPlacing(null)
        else clearSelection()
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [
    entities,
    selectedEntityIds,
    clipboardBuffer,
    placing,
    setPlacing,
    removeEntities,
    clearSelection,
    copyToClipboard,
    addEntities,
    setSelection,
    undo,
    redo,
  ])

  const ghostItemsWithPos =
    placing && ghostPos
      ? placing.items.map((item) => ({
          ...item,
          x: ghostPos.x + item.offsetX,
          y: ghostPos.y + item.offsetY,
        }))
      : []

  const ghostBlocked =
    ghostItemsWithPos.length > 0
      ? !ghostItemsWithPos.every((item) =>
          canPlaceAt({ x: item.x, y: item.y, width: item.width, height: item.height }),
        )
      : false

  const marqueeRect = marquee
    ? {
        left: Math.min(marquee.startX, marquee.x),
        top: Math.min(marquee.startY, marquee.y),
        width: Math.abs(marquee.x - marquee.startX),
        height: Math.abs(marquee.y - marquee.startY),
      }
    : null

  return (
    <div
      className="canvas-wrap"
      ref={wrapRef}
      onClick={handleCanvasClick}
      onMouseDown={(e) => {
        handleCanvasMouseDown(e)
        handleCanvasMouseDownForPan(e)
      }}
      onMouseMove={handleCanvasMouseMove}
      onMouseLeave={() => setGhostPos(null)}
      onWheel={handleWheel}
      onContextMenu={(e) => e.preventDefault()}
      style={{
        cursor: placing ? 'none' : 'default',
        backgroundPosition: `${offsetX}px ${offsetY}px`,
        backgroundSize: `${GRID * scale}px ${GRID * scale}px`,
      }}
    >
      <div
        className="canvas-viewport"
        style={{
          transform: `translate(${offsetX}px, ${offsetY}px) scale(${scale})`,
          transformOrigin: '0 0',
        }}
      >
        {entities.map((entity) => (
          <EntityNode
            key={entity.id}
            entity={entity}
            selected={selectedEntityIds.has(entity.id)}
            onSelect={(shiftKey) => {
              if (shiftKey) toggleSelection(entity.id)
              else selectOnly(entity.id)
            }}
          />
        ))}

        {ghostItemsWithPos.map((item, i) => (
          <PlacementGhost
            key={i}
            icon={item.icon}
            label={item.label}
            x={item.x}
            y={item.y}
            width={item.width}
            height={item.height}
            blocked={ghostBlocked}
          />
        ))}

        {marqueeRect && <div className="marquee-box" style={marqueeRect} />}
      </div>

      {selectedEntity && selectedEntity.craftingCategories && selectedEntity.craftingCategories.length > 0 && (
        selectedEntity.recipe
          ? <MachineInfoPanel entity={selectedEntity} onClose={clearSelection} />
          : (
            <RecipePickerModal
              craftingCategories={selectedEntity.craftingCategories}
              onPick={(recipeName) => setEntityRecipe(selectedEntity.id, recipeName)}
              onClose={clearSelection}
            />
          )
      )}
      {selectedEntity && (!selectedEntity.craftingCategories || selectedEntity.craftingCategories.length === 0) && (
        <StatPopover entity={selectedEntity} />
      )}

      <ImportExportPanel />
      <BalancePanel />
    </div>
  )
}