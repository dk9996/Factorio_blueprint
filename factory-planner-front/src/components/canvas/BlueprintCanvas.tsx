import { useEffect, useMemo, useRef, useState } from 'react'
import { useUiStore } from '../../store/uiStore'
import { useCanvasStore } from '../../store/canvasStore'
import type { EntityDirection, PlacingGroupItem, PlacingState } from '../../store/canvasStore'
import { EntityNode } from './EntityNode'
import { StatPopover } from './StatPopover'
import { BalancePanel } from '../balance-panel/BalancePanel'
import { PlacementGhost } from './PlacementGhost'
import { TileLayer } from './TileLayer'
import { TileGhost, TileRectPreview } from './TileGhost'
import { useTilePainting } from '../../hooks/useTilePainting'
import { useCanvasPointerGuard } from '../../hooks/useCanvasPointerGuard'
import { useWireTool } from '../../hooks/useWireTool'
import { WireLayer } from './WireLayer'
import { CombinatorConfigModal, CONFIGURABLE_TYPES } from '../circuit/CombinatorConfigModal'
import { parseTileKey } from '../../lib/tiles'
import { EntitySettingsPanel } from '../entitySettings/EntitySettingsPanel'
import { openSettingsFor } from '../../lib/entitySettings/open'
import { hasSettings } from '../../lib/entitySettings/registry'
import { useClipboardStore } from '../../store/clipboardStore'
import { ImportExportPanel } from './ImportExportPanel'
import { buildPlacingGroup } from '../../lib/clipboard/buildPlacingGroup'
import { useViewportStore } from '../../store/viewportStore'
import { MachineInfoPanel } from './MachineInfoPanel'
import { ModulesPanel } from './ModulesPanel'
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
  undergroundTunnelDirection,
} from '../../lib/underground'
import {
  appendPathTo,
  computeBeltDragPlacements,
  computeEffectiveBeltPath,
  computeRegularDragPlacements,
  computeUndergroundDragPlacements,
  directionBetween,
  rotateCardinal,
  type BeltCornerOverride,
  type DragPlacementResult,
  type DragTile,
} from '../../lib/dragPlacement'

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
  const clipboardWires = useClipboardStore((s) => s.wires)

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
  // Плитки (слой под сущностями): кисть/заливка/стирание — hooks/useTilePainting.ts
  const tilePaint = useTilePainting(wrapRef, placing)
  // Нет выделения текста и потери мыши за окном во время жестов на холсте
  useCanvasPointerGuard(wrapRef)
  // Инструмент провода (схемная сеть) — hooks/useWireTool.ts
  const wireToolApi = useWireTool(wrapRef)
  // постановка сущности/плитки из курсора выключает инструмент провода
  useEffect(() => {
    if (placing) useUiStore.getState().setWireTool(null)
  }, [placing])

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

  // Отмена активной протяжки (Escape/ПКМ) — ничего не ставится (см.
  // задачу). setPlacing(null) само по себе не чистит window-листенеры/
  // ref протяжки, поэтому вызывается ОТДЕЛЬНО везде, где раньше был
  // только setPlacing(null) для обычного выхода из постановки.
  function cancelDragPlacement() {
    dragPlaceRef.current = null
    cornerOverrideRef.current = null
    setDragPath(null)
    window.removeEventListener('mousemove', handleDragPlaceMove)
    window.removeEventListener('mouseup', handleDragPlaceUp)
  }

  function handleCanvasMouseDownForPan(e: React.MouseEvent) {
    // Правая кнопка и средняя: с плиткой в курсоре ПКМ стирает плитки (см.
    // hooks/useTilePainting.ts, сюда не доходит), поэтому панорамировать
    // можно и средней кнопкой.
    if (e.button !== 2 && e.button !== 1) return
    e.preventDefault()
    // ПКМ во время постановки (в т.ч. двухшаговой подземной — см.
    // src/lib/underground.ts) отменяет её вместо панорамирования, как
    // Escape — реальная игра ведёт себя так же (ПКМ с предметом в
    // курсоре убирает его, не двигает камеру).
    if (placing && e.button === 2) {
      cancelDragPlacement()
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
    // Колесо над открытым окном/поповером (панель сущности, выбор рецепта,
    // список модулей, плашка) не должно зумить холст за ним. React-события
    // идут по дереву компонентов, поэтому окна (и порталы) сюда долетают.
    if ((e.target as HTMLElement).closest('.machine-modal-overlay, .picker-overlay, .mod-popover, .stat-pop')) return
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
  // Ctrl при старте рамки — выделять только плитки
  const marqueeCtrlRef = useRef(false)
  const [marqueeTilesOnly, setMarqueeTilesOnly] = useState(false)

  // Протяжка постановки (зажал ЛКМ с предметом в курсоре, повёл, отпустил —
  // ставится линия) — см. handleCanvasMouseDown/handleDragPlaceMove/
  // handleDragPlaceUp. path — мутируемый через ref (как marqueeRef/panRef
  // выше, читается синхронно в нативных window-листенерах без лишних
  // замыканий), dragPath — его зеркало в состоянии ТОЛЬКО для перерисовки
  // призраков по пути.
  const dragPlaceRef = useRef<{ path: DragTile[] } | null>(null)
  const [dragPath, setDragPath] = useState<DragTile[] | null>(null)
  // Угол R во время протяжки ленты (см. lib/dragPlacement.ts
  // computeEffectiveBeltPath, задачу "R во время протяжки конвейеров") —
  // только у лент, чистое React-состояние не нужно: влияет лишь на то, как
  // dragPath превращается в эффективный путь при каждом вычислении
  // призраков/батча, само по себе не рендерится напрямую.
  const cornerOverrideRef = useRef<BeltCornerOverride | null>(null)

  // point — объект с clientX/clientY: подходит и React.MouseEvent (клик/
  // mousedown на канвасе), и нативный MouseEvent (window-листенеры
  // протяжки/панорамирования/marquee — см. ниже), т.к. оба содержат эти
  // два поля.
  function getLocalPoint(point: { clientX: number; clientY: number }) {
    const rect = wrapRef.current!.getBoundingClientRect()
    const screenX = point.clientX - rect.left
    const screenY = point.clientY - rect.top
    return {
      x: (screenX - offsetX) / scale,
      y: (screenY - offsetY) / scale,
    }
  }

  function handleCanvasMouseDown(e: React.MouseEvent) {
    if (e.button !== 0) return
    if (e.target !== wrapRef.current) return
    if (placing) {
      // Протяжка — см. handleDragPlaceMove/handleDragPlaceUp ниже. Не
      // ставим сразу: ждём mouseup, там же порог "клик vs протяжка"
      // (путь из одной клетки -> обычная постановка, как раньше).
      const { x: rawX, y: rawY } = getLocalPoint(e)
      const startTile: DragTile = { x: Math.round(rawX / GRID) * GRID, y: Math.round(rawY / GRID) * GRID }
      dragPlaceRef.current = { path: [startTile] }
      cornerOverrideRef.current = null
      setDragPath([startTile])
      window.addEventListener('mousemove', handleDragPlaceMove)
      window.addEventListener('mouseup', handleDragPlaceUp)
      return
    }
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
    marqueeCtrlRef.current = e.ctrlKey || e.metaKey
    setMarqueeTilesOnly(marqueeCtrlRef.current)
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

    if (marqueeCtrlRef.current) {
      // Ctrl+рамка: выделяются ТОЛЬКО плитки (сущности не трогаем)
      const tiles = useCanvasStore.getState().tiles
      const c0x = Math.floor(minX / GRID)
      const c1x = Math.floor((isClick ? minX : maxX - 0.001) / GRID)
      const c0y = Math.floor(minY / GRID)
      const c1y = Math.floor((isClick ? minY : maxY - 0.001) / GRID)
      const keys: string[] = []
      const area = (c1x - c0x + 1) * (c1y - c0y + 1)
      const all = Object.keys(tiles)
      if (all.length < area) {
        for (const key of all) {
          const [tx, ty] = parseTileKey(key)
          if (tx >= c0x && tx <= c1x && ty >= c0y && ty <= c1y) keys.push(key)
        }
      } else {
        for (let ty = c0y; ty <= c1y; ty++) for (let tx = c0x; tx <= c1x; tx++) if (tiles[`${tx},${ty}`]) keys.push(`${tx},${ty}`)
      }
      if (keys.length === 0 && !marqueeShiftRef.current) useUiStore.getState().clearSelection()
      else useUiStore.getState().setSelectedTiles(keys, marqueeShiftRef.current)
      return
    }

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
    tilePaint.onMouseMove(e)
    wireToolApi.onMouseMove(e)
    if (tilePaint.tileItem) return // призрак плитки рисуется отдельно
    if (!placing || !wrapRef.current) {
      if (ghostPos) setGhostPos(null)
      return
    }
    const { x: rawX, y: rawY } = getLocalPoint(e)
    const x = Math.round(rawX / GRID) * GRID
    const y = Math.round(rawY / GRID) * GRID
    setGhostPos((prev) => (prev?.x === x && prev?.y === y ? prev : { x, y }))
  }

  // Постановка в ТОЧНОЙ клетке (baseX/baseY — мировые px, уже снэппленные
  // к сетке) — обычный клик без протяжки (вынесено из бывшего onClick,
  // вызывается из handleDragPlaceUp по порогу "путь не вышел за пределы
  // первой клетки") И группа-призрак при протяжке (вставка чертежа,
  // протяжка для нескольких items отключена — см. задачу, там всегда
  // просто точка отпускания ЛКМ).
  function placeAtCursor(baseX: number, baseY: number) {
    if (!placing) return

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
      quality: item.quality,
      recipeQuality: item.recipeQuality,
      modules: item.modules,
      moduleExtra: item.moduleExtra,
      controlBehavior: item.controlBehavior,
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
      const newIds = addEntities(toPlace, placing.wires)
      setSelection(newIds)
    }
  }

  // Призраки протяжки по виду сущности (см. lib/dragPlacement.ts) — одна
  // функция и для превью во время протяжки (path = путь ДО текущего
  // курсора), и для финального батча на mouseup (path = путь ДО финального
  // курсора) — дальность/направление считаются идентично.
  function computeDragGhosts(path: DragTile[], item: PlacingGroupItem): DragPlacementResult[] {
    const catalogEntry = catalogByTypeId.get(item.typeId)
    const maxDistance = catalogEntry?.ioHints?.undergroundMaxDistance
    if (maxDistance != null) {
      const isBelt = catalogEntry?.ioHints?.kind === 'underground-belt'
      const pairs = computeUndergroundDragPlacements(
        path,
        { typeId: item.typeId, width: item.width, height: item.height, maxDistance, isBelt, baseExtra: item.extra },
        entities,
        catalogByTypeId,
      )
      const flat: DragPlacementResult[] = []
      for (const pair of pairs) {
        flat.push(pair.entrance)
        if (pair.exit) flat.push(pair.exit)
      }
      return flat
    }
    if (catalogEntry?.ioHints?.kind === 'belt') {
      // R-угол (см. lib/dragPlacement.ts computeEffectiveBeltPath,
      // cornerOverrideRef/KeyR ниже) — только у лент, эффективный путь
      // заменяет сырой органический, когда угол активен.
      const effectivePath = computeEffectiveBeltPath(path, cornerOverrideRef.current)
      return computeBeltDragPlacements(
        effectivePath,
        { width: item.width, height: item.height, extra: item.extra, fallbackDirection: item.direction },
        entities,
      )
    }
    return computeRegularDragPlacements(path, { width: item.width, height: item.height, direction: item.direction, extra: item.extra }, entities)
  }

  // Призрак протяжки -> полноценная PlacedEntity (минус id) — typeId/icon/
  // label/craftingCategories/moduleSlots/recipe/modules берутся из базового
  // item (не меняются в пределах одной протяжки), x/y/width/height/
  // direction/extra — из конкретного призрака (direction/extra как раз то,
  // что меняется по сущностям: направление лент по сегментам, вход/выход
  // подземных пар).
  function dragGhostToEntity(ghost: DragPlacementResult, base: PlacingGroupItem) {
    return {
      typeId: base.typeId,
      type: base.type,
      icon: base.icon,
      label: base.label,
      x: ghost.x,
      y: ghost.y,
      width: ghost.width,
      height: ghost.height,
      direction: ghost.direction,
      craftingCategories: base.craftingCategories,
      moduleSlots: base.moduleSlots,
      recipe: base.recipe,
      quality: base.quality,
      recipeQuality: base.recipeQuality,
      modules: base.modules,
      moduleExtra: base.moduleExtra,
      controlBehavior: base.controlBehavior,
      extra: ghost.extra,
    }
  }

  function handleDragPlaceMove(e: MouseEvent) {
    if (!dragPlaceRef.current || !wrapRef.current) return
    const { x: rawX, y: rawY } = getLocalPoint(e)
    const tile: DragTile = { x: Math.round(rawX / GRID) * GRID, y: Math.round(rawY / GRID) * GRID }
    const nextPath = appendPathTo(dragPlaceRef.current.path, tile)
    if (nextPath !== dragPlaceRef.current.path) {
      dragPlaceRef.current.path = nextPath
      setDragPath(nextPath)
    }
  }

  function handleDragPlaceUp() {
    const state = dragPlaceRef.current
    dragPlaceRef.current = null
    setDragPath(null)
    window.removeEventListener('mousemove', handleDragPlaceMove)
    window.removeEventListener('mouseup', handleDragPlaceUp)
    if (!state || !placing) {
      cornerOverrideRef.current = null
      return
    }

    // Группа-призрак (вставка чертежа) — протяжка отключена (см. задачу),
    // всегда ставим одной точкой там, где отпустили ЛКМ (как раньше клик).
    // Порог клик/протяжка (не вышли за пределы первой клетки) — туда же.
    const isGroup = placing.items.length > 1
    if (isGroup || state.path.length <= 1) {
      cornerOverrideRef.current = null
      const last = state.path[state.path.length - 1]
      placeAtCursor(last.x, last.y)
      return
    }

    const ghosts = computeDragGhosts(state.path, placing.items[0])
    cornerOverrideRef.current = null
    if (ghosts.length === 0) return
    addEntities(ghosts.map((g) => dragGhostToEntity(g, placing.items[0])))
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
        if (selected.length > 0) copyToClipboard(selected, useCanvasStore.getState().wires)
        return
      }

      if (ctrl && e.code === 'KeyX') {
        e.preventDefault()
        const selected = entities.filter((en) => selectedEntityIds.has(en.id))
        if (selected.length > 0) {
          copyToClipboard(selected, useCanvasStore.getState().wires)
          removeEntities(selectedEntityIds)
          clearSelection()
        }
        return
      }

      if (ctrl && e.code === 'KeyV') {
        e.preventDefault()
        if (clipboardBuffer.length === 0) return
        cancelDragPlacement()
        const group = buildPlacingGroup(clipboardBuffer)
        setPlacing({ items: group, wires: clipboardWires })
        return
      }

      if (e.code === 'KeyE' && !ctrl && !e.shiftKey && !e.altKey && !e.repeat) {
        // E — окно настроек сущности под курсором или выделенной
        const ui = useUiStore.getState()
        // сущность под курсором (hoveredEntityId заполняется не для всех типов)
        const underCursor = document.elementsFromPoint(lastMouse.current.x, lastMouse.current.y)
          .map((el) => (el as HTMLElement).closest?.('.entity') as HTMLElement | null)
          .find((el) => el?.dataset.entityId)
        const candidates = [
          underCursor ? Number(underCursor.dataset.entityId) : null,
          ui.hoveredEntityId,
          ...(ui.selectedEntityIds.size > 0 ? [[...ui.selectedEntityIds][0]] : []),
        ]
        if (candidates.some((t) => t !== null && openSettingsFor(t))) {
          e.preventDefault()
          return
        }
      }

      if (e.code === 'KeyR' && !ctrl) {
        e.preventDefault()
        const delta: 1 | -1 = e.shiftKey ? -1 : 1
        if (placing) {
          // Во время активной протяжки направление зафиксировано на всю
          // линию для обычных сущностей/труб/подземных (см. задачу — R
          // "не меняется"), иначе пришлось бы задним числом перекрашивать
          // уже показанные призраки. Для лент R в протяжке — отдельный
          // механизм "угла" (см. задачу про R во время протяжки конвейеров).
          if (dragPlaceRef.current) {
            const isBeltDrag = catalogByTypeId.get(placing.items[0].typeId)?.ioHints?.kind === 'belt'
            if (!isBeltDrag) return
            const curPath = computeEffectiveBeltPath(dragPlaceRef.current.path, cornerOverrideRef.current)
            if (curPath.length === 0) return
            const override = cornerOverrideRef.current
            // Открыт ли уже "хвост" ТЕКУЩЕГО угла (есть ли клетки за
            // замороженным префиксом) — если да, новый R ставит НОВЫЙ угол
            // в текущем конце пути; если нет (угла ещё не было, или он есть,
            // но хвост ещё не появился) — просто крутим ось дальше от ТОГО
            // ЖЕ угла (см. задачу: "повторное R... не создаёт новый угол").
            const gateOpen = !!override && curPath.length > override.frozenLen
            if (!override || gateOpen) {
              const cornerTile = curPath[curPath.length - 1]
              const dirIntoCorner =
                curPath.length >= 2
                  ? directionBetween(curPath[curPath.length - 2], cornerTile)
                  : ((placing.items[0].direction ?? 0) as EntityDirection)
              cornerOverrideRef.current = {
                frozenLen: curPath.length,
                cornerTile,
                axis: rotateCardinal(dirIntoCorner, delta),
              }
            } else {
              cornerOverrideRef.current = { ...override, axis: rotateCardinal(override.axis, delta) }
            }
            return
          }
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
        // Q всегда заменяет placing целиком (новым подбором или null) —
        // если в этот момент шла протяжка старой сущности, её след нужно
        // сбросить, иначе mouseup позже попытается поставить НОВУЮ
        // сущность по пути СТАРОЙ.
        cancelDragPlacement()
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
        const tileSel = useUiStore.getState().selectedTileKeys
        if (tileSel.size > 0) {
          e.preventDefault()
          useCanvasStore.getState().paintTiles([...tileSel].map(parseTileKey), null, true)
          useUiStore.getState().clearSelection()
          return
        }
        if (selectedEntityIds.size > 0) {
          e.preventDefault()
          removeEntities(selectedEntityIds)
          clearSelection()
        }
        return
      }

      if (e.code === 'Escape') {
        if (placing) {
          cancelDragPlacement()
          setPlacing(null)
        } else clearSelection()
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [
    entities,
    catalogByTypeId,
    selectedEntityIds,
    clipboardBuffer,
    clipboardWires,
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
    placing && ghostPos && !tilePaint.tileItem
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

  // Протяжка (см. lib/dragPlacement.ts) — только для ОДНОГО предмета в
  // курсоре и только после того, как путь реально покинул стартовую
  // клетку (иначе это обычный клик, см. handleDragPlaceUp) — до этого
  // момента призраки рисуются как раньше, через ghostItemsWithPos/ghostPos.
  const isDragPlacing = !!placing && placing.items.length === 1 && !!dragPath && dragPath.length > 1
  const dragGhosts = useMemo(
    () => (isDragPlacing && placing && dragPath ? computeDragGhosts(dragPath, placing.items[0]) : []),
    [isDragPlacing, dragPath, placing, entities, catalogByTypeId],
  )
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
  // Шевроны (стрелки направления) в подсказке имеют смысл только у
  // конвейеров — у труб нет направления потока (жидкость течёт в обе
  // стороны), поэтому для них рисуем просто серую полосу (см.
  // UndergroundRange.tsx).
  const undergroundAnchorIsBelt =
    catalogByTypeId.get(undergroundAnchor?.typeId ?? '')?.ioHints?.kind === 'underground-belt'
  // Полоса должна физически тянуться туда, куда реально ведёт тоннель —
  // для труб это ПРОТИВОПОЛОЖНАЯ сторона от entity.direction (видимый
  // патрубок смотрит в одну сторону, тоннель — в другую, см.
  // undergroundTunnelDirection/AxisInfo.tunnelDirection). Раньше сюда
  // передавали undergroundAnchor.direction напрямую — для труб полоса
  // визуально тянулась не в ту сторону, хотя появлялась/пропадала
  // (isUndergroundGhostConnected) правильно.
  const undergroundAnchorTunnelDirection = undergroundAnchor
    ? undergroundTunnelDirection(undergroundAnchor.typeId, undergroundAnchor.direction, catalogByTypeId)
    : null
  const undergroundAnchorDistance = (() => {
    if (!undergroundAnchor || undergroundAnchorCatalogMax == null || !ghostItemsWithPos[0]) return null
    const toGhostDistance = undergroundAxisDistanceToPoint(
      undergroundAnchor,
      { x: ghostItemsWithPos[0].x, y: ghostItemsWithPos[0].y, direction: ghostItemsWithPos[0].direction },
      catalogByTypeId,
    )
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
  const hoveredUndergroundIsBelt =
    catalogByTypeId.get(undergroundHoverAnchor?.typeId ?? '')?.ioHints?.kind === 'underground-belt'

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
  // кнопка «Настройки» у выделенной сущности с записью в реестре настроек
  const settingsTarget = useMemo(() => {
    if (selectionToolActive && lastSelectionSource !== 'click') return undefined
    return entities.find((e) => selectedEntityIds.has(e.id) && hasSettings(e))
  }, [entities, selectedEntityIds, selectionToolActive, lastSelectionSource])
  const settingsGroupSize = settingsTarget ? entities.filter((e) => selectedEntityIds.has(e.id) && e.type === settingsTarget.type).length : 0
  // Один клик по сущности с записью в реестре настроек открывает окно
  // настроек (вместо инфо-панели). Исключения — сущности, у которых в
  // панели есть другое: ракетная шахта (рецепт, модули), массовый
  // манипулятор (своя конфигурация); у них окно — по E или кнопке.
  const settingsOnClick = canShowEntityPanel && !!selectedEntity && hasSettings(selectedEntity)
    && selectedEntity.type !== 'rocket-silo' && !selectedCatalogEntry?.bulkInserterConfig && !placing
  const settingsOpen = useUiStore((s) => s.settingsEntityIds !== null)
  const openEntitySettings = useUiStore((s) => s.openEntitySettings)
  useEffect(() => {
    if (settingsOnClick && selectedEntity && !settingsOpen) openEntitySettings([selectedEntity.id], true)
  }, [settingsOnClick, selectedEntity?.id, settingsOpen, openEntitySettings])
  type PanelKind = 'inserter' | 'loader' | 'mining-drill' | 'lab' | 'rocket-silo' | 'roboport' | 'machine' | 'modules' | 'stat' | 'combinator' | null
  const panelKind: PanelKind = !canShowEntityPanel || !selectedEntity || settingsOnClick
    ? null
    : CONFIGURABLE_TYPES.has(selectedEntity.type ?? '')
      ? 'combinator'
      : TYPE_PANEL_MAP[selectedEntity.type ?? ''] ??
      (selectedEntity.craftingCategories && selectedEntity.craftingCategories.length > 0
        ? 'machine'
        : (selectedEntity.moduleSlots ?? selectedCatalogEntry?.moduleSlots ?? 0) > 0
          ? 'modules'
          : 'stat')

  return (
    <div
      className="canvas-wrap"
      ref={wrapRef}
      onMouseDown={(e) => {
        handleCanvasMouseDown(e)
        handleCanvasMouseDownForPan(e)
      }}
      onMouseMove={handleCanvasMouseMove}
      onDoubleClick={(e) => {
        // двойной клик по сущности с окном настроек. Событие приходит на
        // холст, а не на сущность (pointer capture жеста), поэтому сущность
        // ищем по точке курсора
        const hit = document.elementsFromPoint(e.clientX, e.clientY)
          .map((el) => (el as HTMLElement).closest?.('.entity') as HTMLElement | null)
          .find((el) => el?.dataset.entityId)
        if (hit && openSettingsFor(Number(hit.dataset.entityId))) e.stopPropagation()
      }}
      onMouseDownCapture={(e) => {
        tilePaint.onMouseDownCapture(e)
        wireToolApi.onMouseDownCapture(e)
      }}
      onMouseLeave={() => {
        setGhostPos(null)
        tilePaint.onMouseLeave()
        wireToolApi.onMouseLeave()
      }}
      onWheel={handleWheel}
      onContextMenu={(e) => e.preventDefault()}
      style={{
        cursor: placing ? 'none' : wireToolApi.wireTool ? (wireToolApi.pendingCheck && !wireToolApi.pendingCheck.ok ? 'not-allowed' : 'crosshair') : 'default',
        backgroundPosition: `${offsetX}px ${offsetY}px`,
        backgroundSize: `${GRID * scale}px ${GRID * scale}px`,
      }}
    >
      <TileLayer width={viewportSize.width} height={viewportSize.height} />
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

        {isDragPlacing && placing
          ? dragGhosts.map((g, i) => (
              <PlacementGhost
                key={i}
                typeId={placing.items[0].typeId}
                icon={placing.items[0].icon}
                label={placing.items[0].label}
                x={g.x}
                y={g.y}
                width={g.width}
                height={g.height}
                direction={g.direction}
                blocked={false}
                connects={g.connects}
              />
            ))
          : ghostItemsWithPos.map((item, i) => (
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
            direction={undergroundAnchorTunnelDirection ?? undergroundAnchor.direction}
            maxDistance={undergroundAnchorDistance}
            chevrons={undergroundAnchorIsBelt}
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
            chevrons={hoveredUndergroundIsBelt}
          />
        )}

        {tilePaint.tileItem && tilePaint.cursorCell && !tilePaint.rect && (
          <TileGhost name={tilePaint.tileItem.typeId} x={tilePaint.cursorCell.x} y={tilePaint.cursorCell.y} />
        )}
        {tilePaint.rect && <TileRectPreview rect={tilePaint.rect} />}
        {settingsTarget && (
          <button
            className="es-open-btn"
            style={{ left: settingsTarget.x, top: settingsTarget.y - 26 / scale, transform: `scale(${1 / scale})`, transformOrigin: 'left top' }}
            onMouseDown={(e) => e.stopPropagation()}
            onClick={(e) => { e.stopPropagation(); openSettingsFor(settingsTarget.id) }}
            title="Окно настроек (E или двойной клик)"
          >
            ⚙ Настройки{selectedEntityIds.size > 1 ? ` ×${settingsGroupSize}` : ''}
          </button>
        )}
        <WireLayer
          cursor={wireToolApi.cursor}
          hoverEntityId={wireToolApi.hoverEntityId}
          hoverConnector={wireToolApi.hoverConnector}
          pendingCheck={wireToolApi.pendingCheck}
        />

        {marqueeRect && <div className={`marquee-box${marqueeTilesOnly ? ' tiles' : ''}`} style={marqueeRect} />}
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
              initialQuality={selectedEntity.recipeQuality}
              onPick={(recipeName, quality) => setEntityRecipe(selectedEntity.id, recipeName, quality ?? null)}
              onClose={clearSelection}
            />
          )
          : <MachineInfoPanel entity={selectedEntity} catalogEntry={selectedCatalogEntry} onClose={clearSelection} />
      )}
      {panelKind === 'modules' && selectedEntity && (
        <ModulesPanel entity={selectedEntity} catalogEntry={selectedCatalogEntry} onClose={clearSelection} />
      )}
      <EntitySettingsPanel />
      {panelKind === 'combinator' && selectedEntity && <CombinatorConfigModal entity={selectedEntity} onClose={clearSelection} />}
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