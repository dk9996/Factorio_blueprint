import { useEffect, useMemo, useRef, useState } from 'react'
import { useUiStore } from '../../store/uiStore'
import { useCanvasStore } from '../../store/canvasStore'
import type { PlacingGroupItem, PlacingState } from '../../store/canvasStore'
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
import { InserterInfoPanel } from './InserterInfoPanel'
import { LoaderInfoPanel } from './LoaderInfoPanel'
import { BulkInserterConfigPanel } from './BulkInserterConfigPanel'
import { MiningDrillInfoPanel } from './MiningDrillInfoPanel'
import { LabInfoPanel } from './LabInfoPanel'
import { RocketSiloInfoPanel } from './RocketSiloInfoPanel'
import { RoboportInfoPanel } from './RoboportInfoPanel'
import { useEntityCatalogStore } from '../../store/entityCatalogStore'
import { useAnimationStore } from '../../store/animationStore'
import { useNetworksStore } from '../../store/networksStore'
import { computeNetworks, EMPTY_NETWORKS } from '../../lib/networks'
import { GroupStatsPanel } from './GroupStatsPanel'
import { UndergroundRange } from './UndergroundRange'
import {
  autoDetectUndergroundType,
  findUndergroundPartner,
  isUndergroundGhostConnected,
  undergroundAxisDistanceToPoint,
  undergroundDirectionTo,
  undergroundPairAnchor,
  undergroundTileDistance,
} from '../../lib/underground'

const GRID = 32

// Поворот (R) одного элемента призрака перед постановкой — свап width/height
// (см. rotateEntities в canvasStore — та же логика для уже размещённых
// сущностей) + цикл direction по кругу. offsetX/offsetY группы (несколько
// items — вставка блюпринта Ctrl+V) сознательно НЕ поворачиваются вокруг
// общего центра группы — для одиночной сущности из палитры/хотбара/Q
// (offset всегда 0,0) разницы нет, а полный поворот многосоставной группы —
// отдельная, более объёмная геометрическая задача.
function rotatePlacingItem(item: PlacingGroupItem, deltaSteps: 1 | -1): PlacingGroupItem {
  return {
    ...item,
    width: item.height,
    height: item.width,
    direction: ((((item.direction ?? 0) + deltaSteps * 90) % 360) + 360) % 360 as PlacingGroupItem['direction'],
  }
}

const TYPE_PANEL_MAP: Record<string, 'inserter' | 'loader' | 'mining-drill' | 'lab' | 'rocket-silo' | 'roboport'> = {
  'inserter': 'inserter',
  'loader': 'loader',
  'loader-1x1': 'loader',
  'mining-drill': 'mining-drill',
  'lab': 'lab',
  'rocket-silo': 'rocket-silo',
  'roboport': 'roboport',
}

export function BlueprintCanvas() {
  const offsetX = useViewportStore((s) => s.offsetX)
  const offsetY = useViewportStore((s) => s.offsetY)
  const scale = useViewportStore((s) => s.scale)
  const setOffset = useViewportStore((s) => s.setOffset)
  const setScale = useViewportStore((s) => s.setScale)

  const panRef = useRef<{ startX: number; startY: number; origOffsetX: number; origOffsetY: number } | null>(null)
  const selectedEntityIds = useUiStore((s) => s.selectedEntityIds)
  const lastSelectionSource = useUiStore((s) => s.lastSelectionSource)
  const selectionToolActive = useUiStore((s) => s.selectionToolActive)
  const selectOnly = useUiStore((s) => s.selectOnly)
  const toggleSelection = useUiStore((s) => s.toggleSelection)
  const setSelection = useUiStore((s) => s.setSelection)
  const addToSelection = useUiStore((s) => s.addToSelection)
  const clearSelection = useUiStore((s) => s.clearSelection)
  const setHoveredGroupId = useUiStore((s) => s.setHoveredGroupId)
  const hoveredEntityId = useUiStore((s) => s.hoveredEntityId)

  const entities = useCanvasStore((s) => s.entities)
  const catalogEntities = useEntityCatalogStore((s) => s.entities)
  const placing = useCanvasStore((s) => s.placing)
  const setPlacing = useCanvasStore((s) => s.setPlacing)
  const addEntity = useCanvasStore((s) => s.addEntity)
  const addEntities = useCanvasStore((s) => s.addEntities)
  const canPlaceAt = useCanvasStore((s) => s.canPlaceAt)
  const removeEntities = useCanvasStore((s) => s.removeEntities)
  const rotateEntities = useCanvasStore((s) => s.rotateEntities)
  const flipUndergroundPair = useCanvasStore((s) => s.flipUndergroundPair)
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
  const selectedCatalogEntry = selectedEntity
    ? catalogEntities.find((e) => e.typeId === selectedEntity.typeId)
    : undefined

  // Автоматические группы (сети) конвейеров/труб — см. lib/networks.ts.
  // В режиме выделения рамкой группы полностью отключены (пустой
  // результат, computeNetworks вообще не вызывается — экономит время).
  // Во время живого перетаскивания (isDraggingAny) пересчёт откладывается:
  // entities меняются на каждый mousemove, но тяжёлая функция не
  // вызывается — переиспользуем предыдущий результат через ref, иначе
  // пересчёт всей сети на каждый пиксель движения будет тормозить.
  const isDraggingAny = useUiStore((s) => s.isDraggingAny)
  const catalogByTypeId = useMemo(
    () => new Map(catalogEntities.map((e) => [e.typeId, e])),
    [catalogEntities],
  )
  const networksRef = useRef(EMPTY_NETWORKS)
  const networks = useMemo(() => {
    if (selectionToolActive) return EMPTY_NETWORKS
    if (isDraggingAny) return networksRef.current
    const result = computeNetworks(entities, catalogByTypeId)
    networksRef.current = result
    return result
  }, [entities, catalogByTypeId, selectionToolActive, isDraggingAny])

  useEffect(() => {
    useNetworksStore.getState().setNetworks(networks)
  }, [networks])

  // Панель статистики группы (GroupStatsPanel) показывается по НАВЕДЕНИЮ
  // (hoveredGroupId, см. EntityNode.tsx/uiStore.ts), а не по факту
  // выделения — выделение остаётся нужным только для перетаскивания/
  // удаления/поворота группы.
  const hoveredGroupId = useUiStore((s) => s.hoveredGroupId)
  const hoveredNetwork = hoveredGroupId ? (networks.groups.get(hoveredGroupId) ?? null) : null

  const [ghostPos, setGhostPos] = useState<{ x: number; y: number } | null>(null)

  // Размер видимой области канваса — нужен, чтобы понять, какие сущности
  // реально попадают в кадр. Держим в стейте (не читаем напрямую из DOM
  // в рендере), чтобы React пересчитал видимые сущности при ресайзе окна.
  const [viewportSize, setViewportSize] = useState({ width: window.innerWidth, height: window.innerHeight })
  useEffect(() => {
    if (!wrapRef.current) return
    const observer = new ResizeObserver((entries) => {
      const { width, height } = entries[0].contentRect
      setViewportSize({ width, height })
    })
    observer.observe(wrapRef.current)
    return () => observer.disconnect()
  }, [])

  // Рендерим DOM/картинку только для сущностей, реально попадающих в кадр
  // (+ запас в PAN_MARGIN мировых пикселей, чтобы соседние при панорамировании
  // не появлялись "внезапно" через кадр). При тысячах сущностей на чертеже
  // (см. кнопку "Все" — кладёт весь каталог сеткой) монтирование ВСЕХ сразу
  // заставляло браузер декодировать сотни спрайтов одновременно, включая
  // огромные многокадровые полосы анимации (некоторые больше 4000×5000px —
  // это под 100МБ на файл в раскодированном виде) — память вылетала почти
  // мгновенно. Сама сущность остаётся в entities (стор) всегда — считается
  // в балансе завода и т.п., меняется только то, что физически монтируется
  // в DOM. Анимация при этом не страдает: то, что реально видно на экране,
  // рендерится и анимируется как обычно, урезается только то, что за кадром.
  const PAN_MARGIN = 600
  const visibleEntities = useMemo(() => {
    const worldLeft = -offsetX / scale - PAN_MARGIN
    const worldTop = -offsetY / scale - PAN_MARGIN
    const worldRight = worldLeft + viewportSize.width / scale + PAN_MARGIN * 2
    const worldBottom = worldTop + viewportSize.height / scale + PAN_MARGIN * 2
    return entities.filter(
      (e) =>
        e.x + e.width > worldLeft &&
        e.x < worldRight &&
        e.y + e.height > worldTop &&
        e.y < worldBottom,
    )
  }, [entities, offsetX, offsetY, scale, viewportSize])

  // Общий тик анимации спрайтов — один интервал на всё приложение,
  // читается всеми EntityNode через useAnimationStore.
  useEffect(() => {
    const id = window.setInterval(() => useAnimationStore.getState().advance(), 125)
    return () => window.clearInterval(id)
  }, [])

  function handleCanvasMouseDownForPan(e: React.MouseEvent) {
    if (e.button !== 2) return // только правая кнопка
    e.preventDefault()
    // ПКМ во время постановки (в т.ч. двухшаговой подземной — см.
    // src/lib/underground.ts) отменяет её вместо панорамирования, как
    // Escape — реальная игра ведёт себя так же (ПКМ с предметом в
    // курсоре убирает его, не двигает камеру).
    if (placing) {
      setPlacing(null)
      return
    }
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
  const marqueeRef = useRef<{ startX: number; startY: number; x: number; y: number } | null>(null)
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
    if (!selectionToolActive) {
      // Обычный режим — рамки множественного выделения тут нет, клик по
      // пустому месту просто снимает текущее выделение (единственный
      // способ закрыть инфо-панель станка, не трогая клавиатуру и не
      // кликая по другой сущности).
      clearSelection()
      return
    }

    const { x, y } = getLocalPoint(e)
    marqueeShiftRef.current = e.shiftKey
    const initial = { startX: x, startY: y, x, y }
    marqueeRef.current = initial
    setMarquee(initial)
    window.addEventListener('mousemove', handleMarqueeMove)
    window.addEventListener('mouseup', handleMarqueeUp)
  }

  function handleMarqueeMove(e: MouseEvent) {
    if (!marqueeRef.current || !wrapRef.current) return
    const rect = wrapRef.current.getBoundingClientRect()
    const screenX = e.clientX - rect.left
    const screenY = e.clientY - rect.top
    const next = {
      ...marqueeRef.current,
      x: (screenX - offsetX) / scale,
      y: (screenY - offsetY) / scale,
    }
    marqueeRef.current = next
    setMarquee(next)
  }

  function handleMarqueeUp() {
    // Читаем/чистим состояние через ref, а не через функциональный
    // setMarquee(prev => ...) — вызывать сеттеры ДРУГИХ сторов (setSelection
    // и т.п.) внутри апдейтера React-состояния нельзя, это и вызывало
    // "Maximum update depth exceeded".
    const prev = marqueeRef.current
    marqueeRef.current = null
    setMarquee(null)
    window.removeEventListener('mousemove', handleMarqueeMove)
    window.removeEventListener('mouseup', handleMarqueeUp)

    if (!prev) return

    const minX = Math.min(prev.startX, prev.x)
    const maxX = Math.max(prev.startX, prev.x)
    const minY = Math.min(prev.startY, prev.y)
    const maxY = Math.max(prev.startY, prev.y)

    const isClick = maxX - minX < 3 && maxY - minY < 3

    if (isClick) {
      if (!marqueeShiftRef.current) clearSelection()
      return
    }

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
      type: item.type,
      icon: item.icon,
      label: item.label,
      x: baseX + item.offsetX,
      y: baseY + item.offsetY,
      width: item.width,
      height: item.height,
      direction: item.direction,
      craftingCategories: item.craftingCategories,
      moduleSlots: item.moduleSlots,
      recipe: item.recipe,
      modules: item.modules,
      extra: item.extra,
    }))

    const allFit = toPlace.every((p) =>
      canPlaceAt({ x: p.x, y: p.y, width: p.width, height: p.height }),
    )
    if (!allFit) return

    if (toPlace.length === 1) {
      const item = toPlace[0]
      const ghostBase = placing.items[0]
      const catalogEntry = catalogByTypeId.get(item.typeId)
      const maxDistance = catalogEntry?.ioHints?.undergroundMaxDistance
      const isUndergroundCapable = maxDistance != null
      const isBeltKind = catalogEntry?.ioHints?.kind === 'underground-belt'

      let finalItem = item
      // Двухшаговая постановка подземных конвейеров/труб (см.
      // src/lib/underground.ts) — только когда сущность выбрана заново
      // из хотбара/палитры (undergroundAutoCycle, см. Hotbar.tsx/
      // EntityPalette.tsx). Тип (вход/выход) пишем ТОЛЬКО конвейерам
      // (extra.type) — у труб такого поля в формате чертежа нет, связь
      // определяется чисто геометрически (см. findUndergroundPartner).
      let nextPlacing: PlacingState | null = null

      if (isUndergroundCapable && placing.undergroundAutoCycle) {
        if (placing.undergroundPhase === 'exit') {
          // форсированный выход — после него возвращаемся к "входу" тем
          // же направлением, что было у только что поставленного выхода
          if (isBeltKind) finalItem = { ...item, extra: { ...item.extra, type: 'output' } }
          nextPlacing = {
            items: [ghostBase],
            undergroundAutoCycle: true,
            undergroundPhase: undefined,
            undergroundEntranceAnchor: undefined,
          }
        } else {
          // форсированный вход — переключаем призрак на "выход": для
          // конвейеров то же направление (оба смотрят по ходу движения),
          // для труб — противоположное (подземные стороны навстречу)
          if (isBeltKind) finalItem = { ...item, extra: { ...item.extra, type: 'input' } }
          const entranceDir = (ghostBase.direction ?? 0) as PlacingGroupItem['direction'] & number
          const exitDirection = (isBeltKind ? entranceDir : ((entranceDir + 180) % 360)) as 0 | 90 | 180 | 270
          nextPlacing = {
            items: [{ ...ghostBase, direction: exitDirection }],
            undergroundAutoCycle: true,
            undergroundPhase: 'exit',
            undergroundEntranceAnchor: { x: baseX, y: baseY, direction: entranceDir as 0 | 90 | 180 | 270, typeId: item.typeId },
          }
        }
      } else if (isUndergroundCapable && isBeltKind) {
        // Обычный режим (Q-подбор/вставка из буфера — undergroundAutoCycle
        // не включён) — тип определяется автоматически по соседям.
        const detectedType = autoDetectUndergroundType(
          { x: item.x, y: item.y, direction: item.direction, typeId: item.typeId },
          entities,
          catalogByTypeId,
        )
        finalItem = { ...item, extra: { ...item.extra, type: detectedType } }
      }

      const added = addEntity(finalItem)
      if (added && nextPlacing) setPlacing(nextPlacing)
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

      if (e.code === 'KeyR' && !ctrl) {
        e.preventDefault()
        const delta: 1 | -1 = e.shiftKey ? -1 : 1
        if (placing) {
          // ...placing сохраняет undergroundAutoCycle/undergroundPhase/
          // undergroundEntranceAnchor — R в фазе выхода просто крутит
          // направление ОДНОЙ выходной части, как обычный призрак (см.
          // src/lib/underground.ts), якорь входа не трогаем.
          setPlacing({ ...placing, items: placing.items.map((item) => rotatePlacingItem(item, delta)) })
          return
        }
        // Наведение + R — поворот ОДНОЙ сущности под курсором, работает в
        // любом режиме (включая режим выделения рамкой) и не требует
        // предварительного выделения. Если сущность состоит в сети
        // конвейеров/труб (lib/networks.ts), поворачивается только она —
        // rotateEntities всегда получает набор ровно из одного id, соседи
        // по группе не трогаются. Приоритет над поворотом по выделению
        // (запасной способ ниже), чтобы можно было навести на другую
        // сущность и повернуть именно её, не снимая текущее выделение.
        const hoveredEl = (document.elementFromPoint(lastMouse.current.x, lastMouse.current.y) as HTMLElement | null)
          ?.closest('[data-entity-id]') as HTMLElement | null
        if (hoveredEl) {
          const hoveredId = Number(hoveredEl.dataset.entityId)
          if (!Number.isNaN(hoveredId)) {
            // Уже СВЯЗАННАЯ пара подземных конвейеров/труб — R разворачивает
            // весь пролёт на 180° сразу у обеих частей (не обычный шаг
            // ±90° у одной: это увело бы вторую половину с оси связи и
            // разорвало бы пару). См. canvasStore.flipUndergroundPair.
            const hoveredEntity = entities.find((en) => en.id === hoveredId)
            const partner = hoveredEntity
              ? findUndergroundPartner(hoveredEntity, entities, catalogByTypeId)
              : null
            if (hoveredEntity && partner) {
              flipUndergroundPair(hoveredEntity.id, partner.id)
            } else {
              rotateEntities(new Set([hoveredId]), delta)
            }
            return
          }
        }
        if (selectedEntityIds.size > 0) {
          rotateEntities(selectedEntityIds, delta)
        }
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
                type: entity.type,
                icon: entity.icon,
                label: entity.label,
                width: entity.width,
                height: entity.height,
                offsetX: 0,
                offsetY: 0,
                direction: entity.direction,
                craftingCategories: entity.craftingCategories,
                moduleSlots: entity.moduleSlots,
                recipe: entity.recipe,
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
    catalogByTypeId,
    selectedEntityIds,
    clipboardBuffer,
    placing,
    setPlacing,
    removeEntities,
    rotateEntities,
    flipUndergroundPair,
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

  // Подсказка дальности подземного конвейера/трубы (см.
  // src/lib/underground.ts, UndergroundRange.tsx) — в фазе выхода
  // двухшаговой постановки показываем от уже поставленного входа
  // (приоритет), иначе — от сущности под курсором (hoveredEntityId;
  // подавляем, пока вообще что-то ставится, чтобы не путать с фазовым
  // оверлеем/не мешать обычной постановке).
  //
  // Длина полосы во время постановки — РЕАЛЬНОЕ расстояние от входа до
  // ТЕКУЩЕЙ позиции призрака (растёт вместе с курсором, как в игре), а
  // не сразу максимум каталога — иначе полоса показывает шевроны ДАЛЬШЕ
  // призрака, что и не нужно, и вводит в заблуждение. Если призрак не на
  // оси входа вообще (null) — полосы не показываем вовсе.
  const undergroundAnchor = placing?.undergroundPhase === 'exit' ? (placing.undergroundEntranceAnchor ?? null) : null
  const undergroundAnchorCatalogMax = undergroundAnchor
    ? (catalogByTypeId.get(undergroundAnchor.typeId)?.ioHints?.undergroundMaxDistance ?? null)
    : null
  const undergroundAnchorDistance = (() => {
    if (!undergroundAnchor || undergroundAnchorCatalogMax == null || !ghostItemsWithPos[0]) return null
    const toGhostDistance = undergroundAxisDistanceToPoint(undergroundAnchor, ghostItemsWithPos[0], catalogByTypeId)
    if (toGhostDistance === null || toGhostDistance < 1) return null
    return Math.min(toGhostDistance, undergroundAnchorCatalogMax)
  })()

  const hoveredUndergroundEntity =
    !placing && hoveredEntityId ? (entities.find((e) => e.id === hoveredEntityId) ?? null) : null
  // Подсказка по наведению на уже стоящую сущность — ТОЛЬКО если у неё
  // реально есть партнёр (findUndergroundPartner). Одиночная, ни с кем
  // не связанная подземная часть никакой подсказки не показывает вовсе —
  // в игре зона максимальной досягаемости по наведению не рисуется,
  // только фактическая связь.
  const hoveredUndergroundPartner = hoveredUndergroundEntity
    ? findUndergroundPartner(hoveredUndergroundEntity, entities, catalogByTypeId)
    : null
  // Канонический якорь пары (undergroundPairAnchor) — оверлей строится
  // ВСЕГДА от одной и той же из двух сущностей, независимо от того, на
  // какой конец пары навели курсором: иначе сторона/направление шевронов
  // "прыгали" бы между противоположными при переключении наведения между
  // концами одной и той же связи, хотя это один и тот же физический
  // пролёт и должен выглядеть одинаково.
  const [undergroundHoverAnchor, undergroundHoverPartner] = hoveredUndergroundPartner
    ? undergroundPairAnchor(hoveredUndergroundEntity!, hoveredUndergroundPartner)
    : [null, null]
  const hoveredUndergroundDirection = undergroundHoverPartner
    ? undergroundDirectionTo(undergroundHoverAnchor!, undergroundHoverPartner)
    : undefined
  // Куда физически тянется полоса (к партнёру) — может не совпадать с
  // тем, куда "смотрит" сама связь. У конвейеров обе части пары делят
  // ОДИН И ТОТ ЖЕ entity.direction (правило связи) — именно его и
  // показываем шевронами, а не геометрическое направление к партнёру
  // (которое зависит от того, какая из двух физически лежит "сзади").
  const hoveredUndergroundChevronDirection = undergroundHoverAnchor?.direction
  const hoveredUndergroundMaxDistance = undergroundHoverPartner
    ? undergroundTileDistance(undergroundHoverAnchor!, undergroundHoverPartner)
    : null

  // Призрак (вторая/выходная часть) стоит в зоне связи с якорем входа —
  // подсветка зелёной рамкой (см. PlacementGhost.tsx).
  const ghostConnects =
    undergroundAnchor && ghostItemsWithPos[0]
      ? isUndergroundGhostConnected(
          undergroundAnchor,
          { x: ghostItemsWithPos[0].x, y: ghostItemsWithPos[0].y, direction: ghostItemsWithPos[0].direction },
          catalogByTypeId,
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

  // Инфо-панель (рецепт станка, инсертер и т.п.) открывается только от
  // клика в ОБЫЧНОМ режиме (как и до сетей/группировки) — режим
  // выделения рамкой нужен для построения набора на пакетные операции
  // (удаление/копирование/перенос), а не для настройки одной сущности,
  // поэтому там клик выделяет (см. EntityNode.handleMouseUp), но панель
  // показывать не должен.
  const canShowEntityPanel = Boolean(selectedEntity) && lastSelectionSource === 'click' && !selectionToolActive
  type PanelKind = 'inserter' | 'loader' | 'mining-drill' | 'lab' | 'rocket-silo' | 'roboport' | 'machine' | 'stat' | null
  const panelKind: PanelKind = !canShowEntityPanel || !selectedEntity
    ? null
    : TYPE_PANEL_MAP[selectedEntity.type ?? ''] ??
      (selectedEntity.craftingCategories && selectedEntity.craftingCategories.length > 0 ? 'machine' : 'stat')

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
        {visibleEntities.map((entity) => (
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
            typeId={item.typeId}
            icon={item.icon}
            label={item.label}
            x={item.x}
            y={item.y}
            width={item.width}
            height={item.height}
            direction={item.direction}
            blocked={ghostBlocked}
            connects={ghostConnects}
          />
        ))}

        {undergroundAnchor && undergroundAnchorDistance != null && (
          <UndergroundRange
            key={`anchor-${undergroundAnchor.x}-${undergroundAnchor.y}-${undergroundAnchor.direction}`}
            x={undergroundAnchor.x}
            y={undergroundAnchor.y}
            direction={undergroundAnchor.direction}
            maxDistance={undergroundAnchorDistance}
          />
        )}
        {!undergroundAnchor && undergroundHoverAnchor && hoveredUndergroundMaxDistance != null && (
          <UndergroundRange
            key={`hover-${undergroundHoverAnchor.id}-${hoveredUndergroundDirection}-${hoveredUndergroundMaxDistance}`}
            x={undergroundHoverAnchor.x}
            y={undergroundHoverAnchor.y}
            direction={hoveredUndergroundDirection}
            chevronDirection={hoveredUndergroundChevronDirection}
            maxDistance={hoveredUndergroundMaxDistance}
          />
        )}

        {marqueeRect && <div className="marquee-box" style={marqueeRect} />}
      </div>

      {panelKind === 'inserter' && selectedEntity && (
        <InserterInfoPanel
          entity={selectedEntity}
          filterCount={selectedCatalogEntry?.filterCount ?? 0}
          onClose={clearSelection}
          extra={
            selectedCatalogEntry?.bulkInserterConfig
              ? <BulkInserterConfigPanel entity={selectedEntity} />
              : undefined
          }
        />
      )}
      {panelKind === 'loader' && selectedEntity && (
        <LoaderInfoPanel
          entity={selectedEntity}
          filterCount={selectedCatalogEntry?.filterCount ?? 0}
          onClose={clearSelection}
        />
      )}
      {panelKind === 'mining-drill' && selectedEntity && (
        <MiningDrillInfoPanel
          entity={selectedEntity}
          catalogEntry={selectedCatalogEntry}
          onClose={clearSelection}
        />
      )}
      {panelKind === 'lab' && selectedEntity && (
        <LabInfoPanel
          entity={selectedEntity}
          catalogEntry={selectedCatalogEntry}
          onClose={clearSelection}
        />
      )}
      {panelKind === 'rocket-silo' && selectedEntity && (
        <RocketSiloInfoPanel
          entity={selectedEntity}
          catalogEntry={selectedCatalogEntry}
          onClose={clearSelection}
        />
      )}
      {panelKind === 'roboport' && selectedEntity && (
        <RoboportInfoPanel
          entity={selectedEntity}
          catalogEntry={selectedCatalogEntry}
          onClose={clearSelection}
        />
      )}
      {panelKind === 'machine' && selectedEntity && (
        !selectedEntity.recipe
          ? (
            <RecipePickerModal
              craftingCategories={selectedEntity.craftingCategories!}
              onPick={(recipeName) => setEntityRecipe(selectedEntity.id, recipeName)}
              onClose={clearSelection}
            />
          )
          : <MachineInfoPanel entity={selectedEntity} onClose={clearSelection} />
      )}
      {panelKind === 'stat' && selectedEntity && (
        <StatPopover entity={selectedEntity} />
      )}
      {hoveredNetwork && (
        <GroupStatsPanel
          network={hoveredNetwork}
          catalogByTypeId={catalogByTypeId}
          connectedPorts={networks.connectedPorts}
          onClose={() => setHoveredGroupId(null)}
        />
      )}

      <ImportExportPanel />
      <BalancePanel />
    </div>
  )
}