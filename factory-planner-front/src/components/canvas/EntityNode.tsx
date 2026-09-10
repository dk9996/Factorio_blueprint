import { useEffect, useRef } from 'react'
import type { PlacedEntity } from '../../store/canvasStore'
import { useCanvasStore } from '../../store/canvasStore'
import { useUiStore } from '../../store/uiStore'
import { useRecipeClipboardStore } from '../../store/recipeClipboardStore'
import { useEntityCatalogStore } from '../../store/entityCatalogStore'
import { useAnimationStore } from '../../store/animationStore'

interface Props {
  entity: PlacedEntity
  selected: boolean
  onSelect: (shiftKey: boolean) => void
}

const DELETE_HOLD_MS = 1500

export function EntityNode({ entity, selected, onSelect }: Props) {
  const moveEntityLive = useCanvasStore((s) => s.moveEntityLive)
  const commitMove = useCanvasStore((s) => s.commitMove)
  const removeEntity = useCanvasStore((s) => s.removeEntity)
  const removeEntities = useCanvasStore((s) => s.removeEntities)
  const setEntityRecipe = useCanvasStore((s) => s.setEntityRecipe)
  const selectedEntityIds = useUiStore((s) => s.selectedEntityIds)
  const clearSelection = useUiStore((s) => s.clearSelection)
  const setDeleteHoldProgress = useUiStore((s) => s.setDeleteHoldProgress)
  const copyRecipeToClipboard = useRecipeClipboardStore((s) => s.copy)
  const recipeClipboardEntry = useRecipeClipboardStore((s) => s.entry)
  const catalogEntry = useEntityCatalogStore((s) => s.entities.find((e) => e.typeId === entity.typeId))

  // Реальная покадровая анимация — только если у сущности реально нарезана
  // полоса из нескольких кадров (spriteFrameCount > 1) и известен размер
  // кадра в пикселях. Иначе — обычная статичная картинка. Подписка на тик
  // условная по значению: если кадр всего один, всегда выбираем 0 —
  // zustand не перерендерит компонент на каждый тик впустую.
  const frameCount = catalogEntry?.spriteFrameCount ?? 1
  const lineLength = catalogEntry?.spriteLineLength ?? 1
  const frameW = catalogEntry?.spriteFrameWidth ?? null
  const frameH = catalogEntry?.spriteFrameHeight ?? null
  const isAnimated = frameCount > 1 && !!catalogEntry?.entitySprite && !!frameW && !!frameH
  const tick = useAnimationStore((s) => (isAnimated ? s.tick : 0))

  const dragRef = useRef<{ startX: number; startY: number; origX: number; origY: number; moved: boolean } | null>(null)
  const deleteHoldRef = useRef<{ raf: number } | null>(null)
  const pasteDragCleanupRef = useRef<(() => void) | null>(null)

  function cleanupDeleteHold() {
    if (deleteHoldRef.current) {
      cancelAnimationFrame(deleteHoldRef.current.raf)
      deleteHoldRef.current = null
    }
    setDeleteHoldProgress(null)
    window.removeEventListener('mouseup', handleDeleteHoldMouseUp)
  }

  function handleDeleteHoldMouseUp(e: MouseEvent) {
    if (e.button !== 2) return
    cleanupDeleteHold()
  }

  function finishDeleteHold() {
    if (selectedEntityIds.has(entity.id) && selectedEntityIds.size > 1) {
      removeEntities(selectedEntityIds)
      clearSelection()
    } else {
      removeEntity(entity.id)
    }
    cleanupDeleteHold()
  }

  function startDeleteHold() {
    const startedAt = performance.now()
    const tick = () => {
      const progress = Math.min(1, (performance.now() - startedAt) / DELETE_HOLD_MS)
      setDeleteHoldProgress(progress)
      if (progress >= 1) {
        finishDeleteHold()
        return
      }
      deleteHoldRef.current = { raf: requestAnimationFrame(tick) }
    }
    deleteHoldRef.current = { raf: requestAnimationFrame(tick) }
    window.addEventListener('mouseup', handleDeleteHoldMouseUp)
  }

  // Shift+ЛКМ протаскиванием по нескольким станкам подряд — вставляет скопированный
  // рецепт на каждый совместимый станок под курсором, как в оригинальной игре.
  function startPasteDrag(firstEntityId: number) {
    const pastedIds = new Set<number>([firstEntityId])

    function tryPasteAt(id: number) {
      if (pastedIds.has(id)) return
      const clip = useRecipeClipboardStore.getState().entry
      if (!clip) {
        cleanup()
        return
      }
      const target = useCanvasStore.getState().entities.find((en) => en.id === id)
      if (!target) return
      if (target.craftingCategories?.some((c) => clip.craftingCategories.includes(c))) {
        useCanvasStore.getState().setEntityRecipe(id, clip.recipe)
      }
      pastedIds.add(id)
    }

    function handleMove(e: MouseEvent) {
      if (!e.shiftKey) {
        cleanup()
        return
      }
      const el = (document.elementFromPoint(e.clientX, e.clientY) as HTMLElement | null)?.closest(
        '[data-entity-id]',
      ) as HTMLElement | null
      if (!el) return
      tryPasteAt(Number(el.dataset.entityId))
    }

    function handleUp() {
      cleanup()
    }

    function cleanup() {
      window.removeEventListener('mousemove', handleMove)
      window.removeEventListener('mouseup', handleUp)
      pasteDragCleanupRef.current = null
    }

    window.addEventListener('mousemove', handleMove)
    window.addEventListener('mouseup', handleUp)
    pasteDragCleanupRef.current = cleanup
  }

  useEffect(
    () => () => {
      cleanupDeleteHold()
      pasteDragCleanupRef.current?.()
    },
    [],
  )

  function handleMouseDown(e: React.MouseEvent) {
    e.stopPropagation()

    if (e.button === 2) {
      if (e.shiftKey) {
        if (entity.craftingCategories && entity.craftingCategories.length > 0) {
          copyRecipeToClipboard(entity.recipe, entity.craftingCategories)
        }
        return
      }
      startDeleteHold()
      return
    }
    if (e.button !== 0) return

    if (
      e.shiftKey &&
      recipeClipboardEntry &&
      entity.craftingCategories?.some((c) => recipeClipboardEntry.craftingCategories.includes(c))
    ) {
      setEntityRecipe(entity.id, recipeClipboardEntry.recipe)
      startPasteDrag(entity.id)
      return
    }

    dragRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      origX: entity.x,
      origY: entity.y,
      moved: false,
    }
    window.addEventListener('mousemove', handleMouseMove)
    window.addEventListener('mouseup', handleMouseUp)
  }

  function handleMouseMove(e: MouseEvent) {
    if (!dragRef.current) return
    const dx = e.clientX - dragRef.current.startX
    const dy = e.clientY - dragRef.current.startY
    if (Math.abs(dx) > 2 || Math.abs(dy) > 2) dragRef.current.moved = true
    moveEntityLive(entity.id, dragRef.current.origX + dx, dragRef.current.origY + dy)
  }

  function handleMouseUp(e: MouseEvent) {
    if (dragRef.current) {
      if (dragRef.current.moved) {
        commitMove(entity.id, dragRef.current.origX, dragRef.current.origY)
      } else {
        onSelect(e.shiftKey)
      }
    }
    dragRef.current = null
    window.removeEventListener('mousemove', handleMouseMove)
    window.removeEventListener('mouseup', handleMouseUp)
  }

  const classNames = [
    'entity',
    selected ? 'e-selected' : '',
    entity.bottleneck ? 'e-bottleneck' : '',
  ]
    .filter(Boolean)
    .join(' ')

  const cols = isAnimated ? Math.min(lineLength, frameCount) : 1
  const rows = isAnimated ? Math.ceil(frameCount / cols) : 1
  const frameIndex = isAnimated ? tick % frameCount : 0
  const col = frameIndex % cols
  const row = Math.floor(frameIndex / cols)

  // Настоящий игровой масштаб, а не "подгонка под клетку": в Factorio
  // спрайт сущности рисуется своим естественным размером
  // (frameWidth × scale, frameHeight × scale — 1 тайл = 32px при scale=1)
  // и МОЖЕТ выступать за пределы хитбокса на соседние клетки (сундуки,
  // печи и т.п. так всегда и выглядят в самой игре). Хитбокс/клик-зона
  // (entity.width/height) при этом не меняется — выступ чисто визуальный.
  const scale = catalogEntry?.spriteScale ?? 1
  const hasSpriteDims = !!frameW && !!frameH
  const dispW = hasSpriteDims ? frameW! * scale : entity.width
  const dispH = hasSpriteDims ? frameH! * scale : entity.height

  // Суммарное смещение спрайта относительно центра хитбокса:
  // игровой shift (в тайлах, из данных Factorio) + наша компенсация
  // несимметричной обрезки полей (в исходных пикселях кадра, тоже
  // домноженная на scale, чтобы быть в одних единицах с dispW/dispH).
  const offsetX = (catalogEntry?.spriteGameShiftX ?? 0) * 32 + (catalogEntry?.spriteShiftX ?? 0) * scale
  const offsetY = (catalogEntry?.spriteGameShiftY ?? 0) * 32 + (catalogEntry?.spriteShiftY ?? 0) * scale

  const spriteLeft = entity.width / 2 - dispW / 2 + offsetX
  const spriteTop = entity.height / 2 - dispH / 2 + offsetY

  return (
    <div
      className={classNames}
      data-entity-id={entity.id}
      style={{
        left: entity.x,
        top: entity.y,
        width: entity.width,
        height: entity.height,
        // Сущности ниже на канвасе рисуются поверх тех, что выше — как
        // в игре, когда выступающий верх сундука/машины выглядывает
        // из-за соседа сверху, а не наоборот.
        zIndex: Math.round(entity.y),
      }}
      onMouseDown={handleMouseDown}
      onClick={(e) => e.stopPropagation()}
    >
      {isAnimated ? (
        <div
          className="entity-sprite entity-sprite-anim"
          style={{
            position: 'absolute',
            left: spriteLeft,
            top: spriteTop,
            width: dispW,
            height: dispH,
            backgroundImage: `url(${catalogEntry!.entitySprite})`,
            backgroundSize: `${dispW * cols}px ${dispH * rows}px`,
            backgroundPosition: `${-col * dispW}px ${-row * dispH}px`,
          }}
        />
      ) : (
        // Берём картинку из свежего каталога, а не из entity.icon —
        // у сущностей, размещённых до появления/обновления спрайта, это
        // поле "запечено" в момент установки и не подтягивает новые данные.
        <img
          src={catalogEntry?.entitySprite ?? catalogEntry?.icon ?? entity.icon}
          alt={entity.label}
          className="entity-sprite"
          style={{
            position: 'absolute',
            left: spriteLeft,
            top: spriteTop,
            width: dispW,
            height: dispH,
          }}
        />
      )}
      {selected && (
        <div className="dim-tag" style={{ top: -24, left: 0 }}>
          {entity.width / 32} × {entity.height / 32}
        </div>
      )}
    </div>
  )
}