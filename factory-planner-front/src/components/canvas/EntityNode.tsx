import { useEffect, useMemo, useRef } from 'react'
import type { PlacedEntity } from '../../store/canvasStore'
import { useCanvasStore } from '../../store/canvasStore'
import { useUiStore } from '../../store/uiStore'
import { useRecipeClipboardStore } from '../../store/recipeClipboardStore'
import type { CatalogEntity } from '../../store/entityCatalogStore'
import { useEntityCatalogStore } from '../../store/entityCatalogStore'
import { useRecipeCatalogStore } from '../../store/recipeCatalogStore'
import type { Recipe } from '../../lib/api/recipes'
import { useAnimationStore } from '../../store/animationStore'
import { computePipeVariantKey } from '../../lib/pipeConnections'
import { computeIoHints, type IoHintPrimitive, type NetworkRenderInfo } from '../../lib/ioHints'
import { IoHints } from './IoHints'
import { useNetworksStore } from '../../store/networksStore'

const EMPTY_ENTITIES: PlacedEntity[] = []
const EMPTY_CATALOG: CatalogEntity[] = []
const EMPTY_RECIPES: Recipe[] = []
const EMPTY_IO_HINTS: IoHintPrimitive[] = []

interface Props {
  entity: PlacedEntity
  selected: boolean
  onSelect: (shiftKey: boolean) => void
}

const DELETE_HOLD_MS = 1500

export function EntityNode({ entity, selected, onSelect }: Props) {
  const moveEntitiesLive = useCanvasStore((s) => s.moveEntitiesLive)
  const commitEntitiesMove = useCanvasStore((s) => s.commitEntitiesMove)
  const removeEntity = useCanvasStore((s) => s.removeEntity)
  const removeEntities = useCanvasStore((s) => s.removeEntities)
  const setEntityRecipe = useCanvasStore((s) => s.setEntityRecipe)
  const selectedEntityIds = useUiStore((s) => s.selectedEntityIds)
  const clearSelection = useUiStore((s) => s.clearSelection)
  const setDeleteHoldProgress = useUiStore((s) => s.setDeleteHoldProgress)
  const useRealSprites = useUiStore((s) => s.useRealSprites)
  const showDirectionArrow = useUiStore((s) => s.showDirectionArrow)
  const selectionToolActive = useUiStore((s) => s.selectionToolActive)
  const setDraggingAny = useUiStore((s) => s.setDraggingAny)
  const hoveredGroupId = useUiStore((s) => s.hoveredGroupId)
  const setHoveredGroupId = useUiStore((s) => s.setHoveredGroupId)
  const setHoveredEntityId = useUiStore((s) => s.setHoveredEntityId)
  const copyRecipeToClipboard = useRecipeClipboardStore((s) => s.copy)
  const recipeClipboardEntry = useRecipeClipboardStore((s) => s.entry)
  const catalogEntry = useEntityCatalogStore((s) => s.entities.find((e) => e.typeId === entity.typeId))

  // Автоматическая группа (сеть конвейеров/труб, см. lib/networks.ts) —
  // в режиме выделения рамкой networksStore всегда пуст (BlueprintCanvas
  // не вызывает computeNetworks вовсе), так что groupIds там естественным
  // образом всегда undefined — отдельной проверки на selectionToolActive
  // в выборках ниже не нужно.
  const networkGroupId = useNetworksStore((s) => s.groupOf.get(entity.id))
  const networkGroup = useNetworksStore((s) => (networkGroupId ? s.groups.get(networkGroupId) : undefined))
  const networkConnectedPorts = useNetworksStore((s) => s.connectedPorts)
  const groupIds = networkGroup && networkGroup.ids.length > 1 ? networkGroup.ids : null
  // Подсветка группы целиком по наведению (не по клику) — см. GroupStatsPanel.
  // !selectionToolActive — доп. подстраховка на случай, если режим выделения
  // включили, пока курсор уже стоял над сущностью (hoveredGroupId мог не
  // успеть сброситься естественным mouseleave).
  const isGroupHovered = !selectionToolActive && !!groupIds && hoveredGroupId === networkGroupId

  // Подсказка дальности подземного конвейера/трубы по наведению (см.
  // src/lib/underground.ts, UndergroundRange.tsx) — отдельно от
  // hoveredGroupId, не связано с группировкой лент/труб.
  const isUndergroundCapable = catalogEntry?.ioHints?.undergroundMaxDistance != null

  function handleMouseEnter() {
    if (!selectionToolActive && groupIds) setHoveredGroupId(networkGroupId!)
    if (isUndergroundCapable) setHoveredEntityId(entity.id)
  }
  function handleMouseLeave() {
    if (hoveredGroupId === networkGroupId) setHoveredGroupId(null)
    if (isUndergroundCapable) setHoveredEntityId(null)
  }

  // Инфо для IoHints (см. lib/ioHints.ts, NetworkRenderInfo) — какую роль
  // ИМЕННО эта сущность играет в своей сети (конец/середина) и какие её
  // собственные жидкостные порты заняты подключённой трубой. Отдельно от
  // groupIds выше: connectedPortIndexes нужен ЛЮБОЙ сущности с fluidPorts
  // (насосам, котлам, машинам), а не только лентам/трубам, у которых есть
  // полноценная запись в groupOf.
  const networkInfo = useMemo((): NetworkRenderInfo => {
    const endpoints = networkGroup
      ? networkGroup.endpoints
          .filter((ep) => ep.entityId === entity.id)
          .map((ep) => ({ role: ep.role, direction: ep.direction }))
      : []
    const connectedPortIndexes = new Set<number>()
    const ports = catalogEntry?.ioHints?.fluidPorts
    if (ports) {
      for (const port of ports) {
        if (networkConnectedPorts.has(`${entity.id}:${port.index}`)) connectedPortIndexes.add(port.index)
      }
    }
    return { isTracked: !!networkGroupId, endpoints, connectedPortIndexes }
  }, [networkGroup, networkGroupId, entity.id, catalogEntry, networkConnectedPorts])

  // Для труб/трубоподобных сущностей (есть pipeSpriteVariants в каталоге)
  // картинка зависит от того, с какой стороны стоит соседняя труба —
  // пересчитываем при каждом изменении списка сущностей на канвасе.
  // Подписка на entities/catalog условная (как и на tick анимации выше) —
  // обычные (не-трубные) сущности не должны перерендериваться на каждое
  // перемещение чего угодно по канвасу.
  const isPipeLike = !!catalogEntry?.pipeSpriteVariants
  const allEntitiesForPipes = useCanvasStore((s) => (isPipeLike ? s.entities : EMPTY_ENTITIES))
  const catalogListForPipes = useEntityCatalogStore((s) => (isPipeLike ? s.entities : EMPTY_CATALOG))
  const pipeVariant = useMemo(() => {
    if (!isPipeLike || !catalogEntry?.pipeSpriteVariants) return null
    const catalogByTypeId = new Map(catalogListForPipes.map((e) => [e.typeId, e]))
    const key = computePipeVariantKey(entity, allEntitiesForPipes, catalogByTypeId)
    return catalogEntry.pipeSpriteVariants[key] ?? null
  }, [isPipeLike, catalogEntry, allEntitiesForPipes, catalogListForPipes, entity])

  // Направленная графика (поворот R) — картинка меняется по entity.direction
  // (0/90/180/270 -> north/east/south/west). Бэкенд уже гарантирует, что
  // directionalSprites никогда не сосуществует с pipeSpriteVariants на одной
  // сущности (трубы исключены явно при сборке карты направлений — у них
  // свой, отдельный механизм выбора картинки по соседям) — проверка
  // "!pipeVariant" здесь просто защитный дубль на случай будущих изменений
  // данных, а не то, от чего реально зависит текущее поведение.
  const directionalSprite = useMemo(() => {
    if (!catalogEntry?.directionalSprites || pipeVariant) return null
    const dirKey =
      entity.direction === 90 ? 'east' : entity.direction === 180 ? 'south' : entity.direction === 270 ? 'west' : 'north'
    return catalogEntry.directionalSprites[dirKey]
  }, [catalogEntry, pipeVariant, entity.direction])

  // Патрубок жидкостного fluid_box у сборочных машин — виден только пока
  // у ВЫБРАННОГО рецепта есть жидкостный ingredient (для входного
  // патрубка) или result (для выходного) — как fluid_boxes_off_when_no_
  // fluid_recipe в самой игре. Подсказки входов/выходов (IoHints) для
  // sущностей с рецептом (kind==='crafting') тоже нуждаются в объекте
  // рецепта — раскладка предметных стрелок и сопоставление жидкостных
  // портов без фиксированного filter. Подписка на каталог рецептов
  // ОДНА общая и условная — не подписываемся вовсе, если ни то, ни
  // другое сущности не нужно.
  const hasFluidOverlays = !!catalogEntry?.fluidPipeOverlays?.length
  const showIoHints = useUiStore((s) => s.showIoHints)
  const needsCraftingRecipe = !useRealSprites && showIoHints && catalogEntry?.ioHints?.kind === 'crafting'
  const needsRecipeCatalog = hasFluidOverlays || needsCraftingRecipe
  const recipeCatalog = useRecipeCatalogStore((s) => (needsRecipeCatalog ? s.recipes : EMPTY_RECIPES))
  const selectedRecipe = useMemo(() => {
    if (!entity.recipe) return null
    return recipeCatalog.find((r) => r.name === entity.recipe) ?? null
  }, [entity.recipe, recipeCatalog])

  const fluidOverlays = useMemo(() => {
    if (!hasFluidOverlays || !selectedRecipe) return null
    const hasFluidIngredient = selectedRecipe.ingredients.some((i) => i.type === 'fluid')
    const hasFluidResult = selectedRecipe.results.some((r) => r.type === 'fluid')
    if (!hasFluidIngredient && !hasFluidResult) return null
    const list = catalogEntry!.fluidPipeOverlays!.filter((o) =>
      o.productionType === 'input'
        ? hasFluidIngredient
        : o.productionType === 'output'
          ? hasFluidResult
          : hasFluidIngredient || hasFluidResult,
    )
    return list.length ? list : null
  }, [hasFluidOverlays, selectedRecipe, catalogEntry])

  // Подсказки входов/выходов — только в режиме "квадрат с иконкой" (см.
  // EntityNode ниже) и когда включена галочка. Зависимости памоизации
  // сужены до конкретных полей entity (а не всего объекта), чтобы
  // перетаскивание (меняет entity.x/y на каждый пиксель) не пересчитывало
  // геометрию подсказок впустую.
  const hasIoHints = !useRealSprites && showIoHints && !!catalogEntry?.ioHints
  const ioHintPrimitives = useMemo(() => {
    if (!hasIoHints) return EMPTY_IO_HINTS
    return computeIoHints(entity, catalogEntry, selectedRecipe, networkInfo)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasIoHints, entity.width, entity.height, entity.direction, catalogEntry, selectedRecipe, networkInfo])

  // Реальная покадровая анимация — только если у сущности реально нарезана
  // полоса из нескольких кадров (spriteFrameCount > 1) и известен размер
  // кадра в пикселях. Иначе — обычная статичная картинка. Подписка на тик
  // условная по значению: если кадр всего один, всегда выбираем 0 —
  // zustand не перерендерит компонент на каждый тик впустую.
  const frameCount = catalogEntry?.spriteFrameCount ?? 1
  const lineLength = catalogEntry?.spriteLineLength ?? 1
  const frameW = catalogEntry?.spriteFrameWidth ?? null
  const frameH = catalogEntry?.spriteFrameHeight ?? null
  // directionalSprite — всегда один статичный лист (без полосы кадров),
  // поэтому при его активности анимацию основного entitySprite не показываем
  // (см. плоскую ветку <img> ниже — она и рисует directionalSprite).
  const isAnimated = frameCount > 1 && !!catalogEntry?.entitySprite && !!frameW && !!frameH && !directionalSprite
  const tick = useAnimationStore((s) => (isAnimated ? s.tick : 0))

  const dragRef = useRef<{
    ids: number[]
    origins: Map<number, { x: number; y: number }>
    startX: number
    startY: number
    moved: boolean
  } | null>(null)
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
    } else if (!selectionToolActive && groupIds) {
      // Обычный режим, сущность — часть сети конвейеров/труб: ПКМ-
      // удержание без предварительного выделения удаляет всю группу
      // целиком (как и перетаскивание/клик, см. handleMouseDown/Up).
      removeEntities(new Set(groupIds))
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

  // Сущность исчезает (удалена/перестала рендериться) или перегруппировалась
  // пока была под курсором — не оставляем "подвисшую" подсветку группы без
  // mouseleave, который в этом случае не успеет сработать. Отдельный эффект
  // от cleanupDeleteHold/paste-drag выше — те должны прерываться ТОЛЬКО на
  // реальном unmount, а не на каждой смене networkGroupId при перегруппировке.
  useEffect(
    () => () => {
      if (useUiStore.getState().hoveredGroupId === networkGroupId) {
        useUiStore.getState().setHoveredGroupId(null)
      }
    },
    [networkGroupId],
  )

  // Та же подстраховка для hoveredEntityId (подсказка дальности подземного
  // конвейера/трубы) — сущность может исчезнуть (удаление, undo) пока
  // стоит под курсором, mouseleave в этом случае не произойдёт.
  useEffect(
    () => () => {
      if (useUiStore.getState().hoveredEntityId === entity.id) {
        useUiStore.getState().setHoveredEntityId(null)
      }
    },
    [entity.id],
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

    // Группа (сеть конвейеров/труб, см. lib/networks.ts) двигается и
    // выделяется ЦЕЛИКОМ в обычном режиме; Alt — запасной способ достать
    // одну сущность из группы, не переключая режим выделения.
    const isGroupTarget = !selectionToolActive && !e.altKey && !!groupIds
    const dragIds = isGroupTarget ? groupIds! : [entity.id]
    const allEntities = useCanvasStore.getState().entities
    const origins = new Map<number, { x: number; y: number }>()
    for (const id of dragIds) {
      const en = allEntities.find((x) => x.id === id)
      origins.set(id, { x: en?.x ?? entity.x, y: en?.y ?? entity.y })
    }

    dragRef.current = {
      ids: dragIds,
      origins,
      startX: e.clientX,
      startY: e.clientY,
      moved: false,
    }
    window.addEventListener('mousemove', handleMouseMove)
    window.addEventListener('mouseup', handleMouseUp)
  }

  function handleMouseMove(e: MouseEvent) {
    if (!dragRef.current) return
    const dx = e.clientX - dragRef.current.startX
    const dy = e.clientY - dragRef.current.startY
    if (!dragRef.current.moved && (Math.abs(dx) > 2 || Math.abs(dy) > 2)) {
      dragRef.current.moved = true
      setDraggingAny(true)
    }
    moveEntitiesLive(dragRef.current.ids, dx, dy, dragRef.current.origins)
  }

  function handleMouseUp(e: MouseEvent) {
    if (dragRef.current) {
      if (dragRef.current.moved) {
        commitEntitiesMove(dragRef.current.ids, dragRef.current.origins)
        setDraggingAny(false)
      } else if (!selectionToolActive && groupIds && !e.altKey) {
        // Клик по СГРУППИРОВАННОЙ ленте/трубе в обычном режиме ничего не
        // выделяет (ни группу, ни её саму) — подсветка группы теперь
        // только по наведению (isGroupHovered), поворот — наведением + R
        // (см. KeyR в BlueprintCanvas). Alt+клик по-прежнему пробивается
        // в onSelect — запасной способ достать одну сущность из группы.
        // НЕгруппированные сущности (обычные станки, инсертеры и т.п.)
        // сюда не попадают — для них клик в обычном режиме выделяет и
        // открывает инфо-панель/подбор рецепта как раньше, это отдельная,
        // не связанная с сетями механика.
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
    useRealSprites ? '' : 'entity-simple',
    selected || isGroupHovered ? 'e-selected' : '',
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
  const scale = pipeVariant?.scale ?? directionalSprite?.scale ?? catalogEntry?.spriteScale ?? 1
  const effectiveFrameW = pipeVariant?.frameWidth ?? directionalSprite?.frameWidth ?? frameW
  const effectiveFrameH = pipeVariant?.frameHeight ?? directionalSprite?.frameHeight ?? frameH
  const hasSpriteDims = !!effectiveFrameW && !!effectiveFrameH
  const dispW = hasSpriteDims ? effectiveFrameW! * scale : entity.width
  const dispH = hasSpriteDims ? effectiveFrameH! * scale : entity.height

  // Суммарное смещение спрайта относительно центра хитбокса:
  // игровой shift (в тайлах, из данных Factorio) + наша компенсация
  // несимметричной обрезки полей (в исходных пикселях кадра, тоже
  // домноженная на scale, чтобы быть в одних единицах с dispW/dispH).
  const offsetX = (pipeVariant?.gameShiftX ?? directionalSprite?.gameShiftX ?? catalogEntry?.spriteGameShiftX ?? 0) * 32 + (pipeVariant?.shiftX ?? directionalSprite?.shiftX ?? catalogEntry?.spriteShiftX ?? 0) * scale
  const offsetY = (pipeVariant?.gameShiftY ?? directionalSprite?.gameShiftY ?? catalogEntry?.spriteGameShiftY ?? 0) * 32 + (pipeVariant?.shiftY ?? directionalSprite?.shiftY ?? catalogEntry?.spriteShiftY ?? 0) * scale

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
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      onClick={(e) => e.stopPropagation()}
    >
      {!useRealSprites ? (
        // Режим "Реальные спрайты" выключен — плейсхолдер-квадрат с
        // маленькой иконкой каталога (НЕ entitySprite) вместо настоящей
        // игровой графики; никаких pipeVariant/fluidOverlays/анимации.
        // Стрелка направления — только у обычных построек: у труб R не
        // меняет картинку вообще (свой механизм выбора по соседям), так
        // что показывать стрелку для них было бы вводящим в заблуждение.
        <>
          <img
            src={catalogEntry?.icon ?? entity.icon}
            alt={entity.label}
            className="entity-simple-icon"
          />
          {!isPipeLike && showDirectionArrow && <div className={`entity-direction-arrow dir-${entity.direction ?? 0}`} />}
          <IoHints width={entity.width} height={entity.height} hints={ioHintPrimitives} />
        </>
      ) : isAnimated ? (
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
          src={pipeVariant?.url ?? directionalSprite?.url ?? catalogEntry?.entitySprite ?? catalogEntry?.icon ?? entity.icon}
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
      {useRealSprites && fluidOverlays?.map((overlay, i) => {
        const oW = overlay.frameWidth * overlay.scale
        const oH = overlay.frameHeight * overlay.scale
        // connectionPositionX/Y — позиция самой точки подключения
        // fluid_box относительно центра сущности В ТАЙЛАХ. Перепробовано:
        // (1) центр картинки на connectionPosition — у маленького
        // (71×38) north-патрубка assembling-machine-2/3 картинка целиком
        // тонула ВНУТРИ хитбокса (даже дальний край не доставал до
        // настоящей границы корпуса) и сливалась с решёткой крыши;
        // (2)/(3) центр или ближний край картинки на настоящем краю
        // хитбокса ЛЮБОЙ ценой — чинило маленькую north-картинку, но
        // большую (88×61) south-картинку (у которой дальний край и так
        // почти доставал до края при обычном centering) утаскивало
        // заметно ЗА пределы корпуса — патрубок отрывался с зазором.
        // Итог — АДАПТИВНО: толкаем центр картинки наружу ТОЛЬКО на ту
        // дистанцию, которой дальнему краю не хватает, чтобы дотянуться
        // до настоящего края хитбокса (entity width/height); если он и
        // так уже достаёт (как у south) — не трогаем вообще. Ось, вдоль
        // которой действует край ("основная" — та, где |connectionPosition|
        // больше), получает эту адаптивную поправку; перпендикулярная
        // ось по-прежнему просто центрируется по connectionPosition
        // (нужна для смещения ВДОЛЬ края — например у
        // kr-atmospheric-condenser 2 патрубка на одной стороне на разном X).
        // Настройка выступа патрубка — отдельно на каждую из 4 сторон, а
        // не одной общей формулой: у assembling-machine-2/3 базовый
        // спрайт машины сам по себе НЕ симметричен относительно хитбокса
        // (крыша выступает за номинальный край, пол чуть не дотягивает
        // до него), так что верх и низ (и, вероятно, лево/право у других
        // сущностей) нужно тюнить независимо друг от друга. Для каждой
        // стороны:
        //   protrusionFactor — запас (доля от половины размера самой
        //     картинки-патрубка), на который дальний край должен не
        //     просто КАСАТЬСЯ настоящего края хитбокса, а чуть ЗАХОДИТЬ
        //     за него — компенсирует затухание альфы у обрезанного края.
        //   biasPx — доп. фиксированная поправка в пикселях именно под
        //     эту сторону (положительная — толкает патрубок ДАЛЬШЕ
        //     наружу, отрицательная — ЗАТЯГИВАЕТ его обратно внутрь).
        const OVERLAY_EDGE_TUNING = {
          north: { protrusionFactor: 1, biasPx: 0 },
          south: { protrusionFactor: 0, biasPx: 0 },
          west: { protrusionFactor: 1, biasPx: 0 },
          east: { protrusionFactor: 1, biasPx: 0 },
        }
        const primaryIsY = Math.abs(overlay.connectionPositionY) >= Math.abs(overlay.connectionPositionX)
        let oOffsetX: number
        let oOffsetY: number
        if (primaryIsY) {
          const sign = overlay.connectionPositionY >= 0 ? 1 : -1
          const { protrusionFactor, biasPx } = sign > 0 ? OVERLAY_EDGE_TUNING.south : OVERLAY_EDGE_TUNING.north
          const posCenter = overlay.connectionPositionY * 32
          const halfSize = oH / 2
          const farTipDistance = Math.abs(posCenter) + halfSize
          const target = entity.height / 2 + halfSize * protrusionFactor + biasPx
          const deficit = Math.max(0, target - farTipDistance)
          oOffsetY = posCenter + sign * deficit
          oOffsetX = overlay.connectionPositionX * 32
        } else {
          const sign = overlay.connectionPositionX >= 0 ? 1 : -1
          const { protrusionFactor, biasPx } = sign > 0 ? OVERLAY_EDGE_TUNING.east : OVERLAY_EDGE_TUNING.west
          const posCenter = overlay.connectionPositionX * 32
          const halfSize = oW / 2
          const farTipDistance = Math.abs(posCenter) + halfSize
          const target = entity.width / 2 + halfSize * protrusionFactor + biasPx
          const deficit = Math.max(0, target - farTipDistance)
          oOffsetX = posCenter + sign * deficit
          oOffsetY = overlay.connectionPositionY * 32
        }
        return (
          <img
            key={i}
            src={overlay.url}
            alt=""
            className="entity-sprite entity-fluid-overlay"
            style={{
              position: 'absolute',
              left: entity.width / 2 - oW / 2 + oOffsetX,
              top: entity.height / 2 - oH / 2 + oOffsetY,
              width: oW,
              height: oH,
            }}
          />
        )
      })}
      {selected && (
        <div className="dim-tag" style={{ top: -24, left: 0 }}>
          {entity.width / 32} × {entity.height / 32}
        </div>
      )}
    </div>
  )
}