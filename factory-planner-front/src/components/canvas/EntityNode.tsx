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
  // кадра в пикселях (нужен для честного cover-масштабирования ниже).
  // Иначе — обычная статичная картинка, как раньше. Подписка на тик
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

  // Настоящий "cover" для спрайт-листа: масштабируем кадр с сохранением
  // пропорций, чтобы он гарантированно закрыл весь бокс сущности, а
  // лишнее (если кадр после обрезки полей стал не квадратным — так
  // бывает у некоторых модов) обрезаем через background-position, а не
  // растягиваем как раньше (растяжение "в проценты" искажало пропорции,
  // если кадр не совпадал по форме с квадратной клеткой тайла).
  // entity.width/height — это невписанные "1×" пиксели (весь канвас
  // масштабируется общим transform:scale на родителе), так что здесь
  // можно спокойно считать в абсолютных пикселях без учёта текущего зума.
  let bgSize = ''
  let bgPos = ''
  if (isAnimated) {
    const coverScale = Math.max(entity.width / frameW!, entity.height / frameH!)
    const frameDispW = frameW! * coverScale
    const frameDispH = frameH! * coverScale
    const sheetW = frameDispW * cols
    const sheetH = frameDispH * rows
    // Компенсация несимметричной обрезки полей на бэкенде — центр
    // обрезанного кадра может не совпадать с центром исходного кадра,
    // без этой поправки картинка визуально "съезжает" в сторону.
    const shiftX = (catalogEntry?.spriteShiftX ?? 0) * coverScale
    const shiftY = (catalogEntry?.spriteShiftY ?? 0) * coverScale
    const posX = -(col * frameDispW) - (frameDispW - entity.width) / 2 + shiftX
    const posY = -(row * frameDispH) - (frameDispH - entity.height) / 2 + shiftY
    bgSize = `${sheetW}px ${sheetH}px`
    bgPos = `${posX}px ${posY}px`
  }

  return (
    <div
      className={classNames}
      data-entity-id={entity.id}
      style={{
        left: entity.x,
        top: entity.y,
        width: entity.width,
        height: entity.height,
      }}
      onMouseDown={handleMouseDown}
      onClick={(e) => e.stopPropagation()}
    >
      {isAnimated ? (
        <div
          className="entity-sprite entity-sprite-anim"
          style={{
            backgroundImage: `url(${catalogEntry!.entitySprite})`,
            backgroundSize: bgSize,
            backgroundPosition: bgPos,
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