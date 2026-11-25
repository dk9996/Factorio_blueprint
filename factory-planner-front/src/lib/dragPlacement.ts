import type { EntityDirection, PlacedEntity } from '../store/canvasStore'
import type { CatalogEntity } from '../store/entityCatalogStore'
import { undergroundTunnelDirection } from './underground'

const GRID = 32

// Протяжка (зажал ЛКМ, повёл, отпустил — ставится линия сущностей) — см.
// отчёт по задаче в BlueprintCanvas.tsx. Чистые функции без React/store:
// принимают "путь" (клетки, через которые прошёл курсор) и уже
// размещённые сущности, возвращают, ЧТО поставить — коллизии (в т.ч.
// против уже решённых В ЭТОЙ ЖЕ протяжке виртуальных сущностей) и геометрия
// посчитаны здесь, actual addEntities() вызывает BlueprintCanvas.tsx.

export interface DragTile {
  x: number
  y: number
}

export interface DragPlacementResult {
  x: number
  y: number
  width: number
  height: number
  direction?: EntityDirection
  extra?: Record<string, unknown>
  // Только у подземных пар (см. computeUndergroundDragPlacements) — есть ли
  // у ЭТОЙ части пары уже построенный партнёр, для зелёной рамки призрака
  // (PlacementGhost), как у существующей двухшаговой постановки кликами.
  connects?: boolean
}

interface Rect {
  x: number
  y: number
  width: number
  height: number
}

function overlaps(a: Rect, b: Rect): boolean {
  return a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y
}

function isFreeRect(rect: Rect, entities: PlacedEntity[], virtual: Rect[]): boolean {
  for (const e of entities) {
    if (overlaps(rect, e)) return false
  }
  for (const v of virtual) {
    if (overlaps(rect, v)) return false
  }
  return true
}

// Целочисленный Брезенхем по клеткам (не px) — включает обе границы.
export function bresenhamTiles(x0: number, y0: number, x1: number, y1: number): [number, number][] {
  const points: [number, number][] = []
  let x = x0
  let y = y0
  const dx = Math.abs(x1 - x0)
  const dy = -Math.abs(y1 - y0)
  const sx = x0 < x1 ? 1 : -1
  const sy = y0 < y1 ? 1 : -1
  let err = dx + dy
  while (true) {
    points.push([x, y])
    if (x === x1 && y === y1) break
    const e2 = 2 * err
    if (e2 >= dy) {
      err += dy
      x += sx
    }
    if (e2 <= dx) {
      err += dx
      y += sy
    }
  }
  return points
}

// Наращивание пути протяжки — Брезенхем от ПОСЛЕДНЕЙ точки пути до новой
// (не от старта протяжки до курсора — иначе физический изгиб мышью в виде
// буквы "Г" превратился бы в диагональ). newPoint — мировые px, уже
// снэппленные к сетке (см. getLocalPoint/GRID в BlueprintCanvas.tsx).
export function appendPathTo(path: DragTile[], newPoint: DragTile): DragTile[] {
  if (path.length === 0) return [newPoint]
  const last = path[path.length - 1]
  if (last.x === newPoint.x && last.y === newPoint.y) return path

  const filled = bresenhamTiles(last.x / GRID, last.y / GRID, newPoint.x / GRID, newPoint.y / GRID)
  const appended = filled.slice(1).map(([tx, ty]) => ({ x: tx * GRID, y: ty * GRID }))
  if (appended.length === 0) return path
  return [...path, ...appended]
}

interface RegularDragItem {
  width: number
  height: number
  direction?: EntityDirection
  extra?: Record<string, unknown>
}

// Обычные сущности (в т.ч. трубы — у них просто width===height===GRID,
// direction не используется получателем) — направление ЗАФИКСИРОВАНО на
// всю протяжку (ставится R до её начала, см. задачу). Шаг = макс(ширина,
// высота) сущности в px, измеренный Чебышёвским расстоянием от последней
// ПОСТАВЛЕННОЙ (не просто пройденной) клетки — не даёт сущностям
// налезать друг на друга ни по горизонтали, ни по вертикали, ни по
// диагонали, без отдельного учёта "вдоль какой именно оси" идёт движение.
export function computeRegularDragPlacements(
  path: DragTile[],
  item: RegularDragItem,
  entities: PlacedEntity[],
): DragPlacementResult[] {
  const results: DragPlacementResult[] = []
  const virtualRects: Rect[] = []
  let lastPlaced: DragTile | null = null
  const requiredGap = Math.max(item.width, item.height)

  for (const point of path) {
    if (lastPlaced) {
      const dx = Math.abs(point.x - lastPlaced.x)
      const dy = Math.abs(point.y - lastPlaced.y)
      if (Math.max(dx, dy) < requiredGap) continue
    }
    const rect: Rect = { x: point.x, y: point.y, width: item.width, height: item.height }
    if (!isFreeRect(rect, entities, virtualRects)) continue
    virtualRects.push(rect)
    lastPlaced = point
    results.push({ x: point.x, y: point.y, width: item.width, height: item.height, direction: item.direction, extra: item.extra })
  }
  return results
}

// Направление ОТ одной клетки К соседней (кардинальное) — та же конвенция
// 0=север/90=восток/180=юг/270=запад, что и во всём приложении (см.
// lib/underground.ts forwardVector). При диагональном шаге Брезенхема
// (|dx|===|dy|) тай-брейк в пользу вертикали — как в уже существующем
// undergroundDirectionTo (lib/underground.ts), для единообразия.
export function directionBetween(from: DragTile, to: DragTile): EntityDirection {
  const dx = to.x - from.x
  const dy = to.y - from.y
  if (Math.abs(dy) >= Math.abs(dx)) return dy < 0 ? 0 : 180
  return dx > 0 ? 90 : 270
}

// Поворот кардинального направления на ±90° (как rotatePlacingItem в
// BlueprintCanvas.tsx) — для R-угла протяжки ленты (см. ниже).
export function rotateCardinal(dir: EntityDirection, deltaSteps: 1 | -1): EntityDirection {
  return (((dir + deltaSteps * 90) % 360) + 360) % 360 as EntityDirection
}

// Проекция точки `to` на ось `axisDir` от точки `from`, в клетках, со
// знаком (положительно — дальше по ходу оси). 0=север(-y)/90=восток(+x)/
// 180=юг(+y)/270=запад(-x) — та же конвенция направлений, что везде.
export function axisProjectionTiles(from: DragTile, to: DragTile, axisDir: EntityDirection): number {
  const dx = (to.x - from.x) / GRID
  const dy = (to.y - from.y) / GRID
  if (axisDir === 0) return -dy
  if (axisDir === 180) return dy
  if (axisDir === 90) return dx
  return -dx
}

export interface BeltCornerOverride {
  // Индекс в dragPath, на котором замороженный префикс заканчивается
  // (включительно) — frozenLen = cornerTile — последняя точка префикса.
  frozenLen: number
  cornerTile: DragTile
  axis: EntityDirection
}

// Эффективный путь протяжки ленты с учётом R-угла (см. задачу "R во время
// протяжки конвейеров"): без override — просто сырой органический путь
// (dragPath). С override — замороженный префикс (dragPath[0..frozenLen])
// + "живой" хвост, Брезенхем от угла до ТЕКУЩЕГО курсора (последняя точка
// dragPath — он копится органически всегда, см. BlueprintCanvas.tsx), но
// ТОЛЬКО если курсор ушёл от угла по НОВОЙ оси хотя бы на 1 клетку —
// иначе хвоста нет вовсе, угловая клетка (последняя в префиксе) остаётся
// с прежним направлением. Реактивно — пересчитывается заново из текущего
// dragPath при каждом вызове, ничего не копит сверх override/dragPath.
export function computeEffectiveBeltPath(dragPath: DragTile[], override: BeltCornerOverride | null): DragTile[] {
  if (!override || dragPath.length === 0) return dragPath
  const prefix = dragPath.slice(0, override.frozenLen)
  const cursor = dragPath[dragPath.length - 1]
  const projection = axisProjectionTiles(override.cornerTile, cursor, override.axis)
  if (projection < 1) return prefix
  const tail = appendPathTo([override.cornerTile], cursor).slice(1)
  return [...prefix, ...tail]
}

interface BeltDragItem {
  width: number
  height: number
  extra?: Record<string, unknown>
  fallbackDirection?: EntityDirection
}

// Ленты — 1×1, направление КАЖДОЙ клетки берётся из направления движения
// курсора К НЕЙ от предыдущей клетки пути (смотрит вперёд, "куда поедет
// предмет дальше"); последняя клетка пути направления взять неоткуда (нет
// следующей) — копирует направление предыдущей, как в игре (угол
// "довернётся" только когда появится следующий отрезок). cornerOverride —
// см. задачу "R во время протяжки конвейеров": если задан, path уже
// обрезан вызывающим кодом до актуального (замороженный префикс + живой
// хвост или без него) — эта функция ничего не знает про R саму по себе.
export function computeBeltDragPlacements(path: DragTile[], item: BeltDragItem, entities: PlacedEntity[]): DragPlacementResult[] {
  const placedPoints: DragTile[] = []
  const virtualRects: Rect[] = []

  for (const point of path) {
    const rect: Rect = { x: point.x, y: point.y, width: item.width, height: item.height }
    if (!isFreeRect(rect, entities, virtualRects)) continue
    virtualRects.push(rect)
    placedPoints.push(point)
  }

  const directions: EntityDirection[] = []
  for (let i = 0; i < placedPoints.length; i++) {
    if (i < placedPoints.length - 1) {
      directions.push(directionBetween(placedPoints[i], placedPoints[i + 1]))
    } else {
      directions.push(directions[i - 1] ?? item.fallbackDirection ?? 0)
    }
  }

  return placedPoints.map((point, i) => ({
    x: point.x,
    y: point.y,
    width: item.width,
    height: item.height,
    direction: directions[i],
    extra: item.extra,
  }))
}

export interface UndergroundDragPair {
  entrance: DragPlacementResult
  exit: DragPlacementResult | null
}

interface UndergroundDragItem {
  typeId: string
  width: number
  height: number
  maxDistance: number
  isBelt: boolean
  // Передаётся через в entrance/exit (вместе с type у лент) — чтобы не
  // терять прочие extra-поля (фильтры и т.п.), как и существующая
  // двухшаговая постановка кликами (BlueprintCanvas.tsx: `{...item.extra, type: ...}`).
  baseExtra?: Record<string, unknown>
}

// Подземные пары (конвейеры/трубы) — ось протяжки фиксируется по
// доминирующему направлению от стартовой клетки пути (path[0]) до ТЕКУЩЕЙ
// (последней в path) — пересчитывается заново при каждом вызове, без
// накопления состояния (см. задачу). Жадно строит пары максимальной
// дальности, пока курсор позволяет; последняя (ещё не на максимуме)
// пара — "живая", её выход растёт вместе с курсором — та же функция
// годится и для превью во время протяжки (path = путь ДО текущего
// курсора), и для финальной постановки на mouseup (path = путь ДО
// финального курсора) — логика идентична, отдельного flag не нужно.
export function computeUndergroundDragPlacements(
  path: DragTile[],
  item: UndergroundDragItem,
  entities: PlacedEntity[],
  catalogByTypeId: Map<string, CatalogEntity>,
): UndergroundDragPair[] {
  if (path.length < 2) return []
  const start = path[0]
  const cursor = path[path.length - 1]
  const totalDx = cursor.x - start.x
  const totalDy = cursor.y - start.y
  if (totalDx === 0 && totalDy === 0) return []

  const axisIsHorizontal = Math.abs(totalDx) >= Math.abs(totalDy)
  const axisSign = axisIsHorizontal ? Math.sign(totalDx) : Math.sign(totalDy)
  if (axisSign === 0) return []

  const travelAxisDeg = (axisIsHorizontal ? (axisSign > 0 ? 90 : 270) : axisSign > 0 ? 180 : 0) as EntityDirection

  let entranceDirection: EntityDirection | null = null
  for (const d of [0, 90, 180, 270] as EntityDirection[]) {
    if (undergroundTunnelDirection(item.typeId, d, catalogByTypeId) === travelAxisDeg) {
      entranceDirection = d
      break
    }
  }
  if (entranceDirection === null) return []
  const exitDirection: EntityDirection = item.isBelt ? entranceDirection : (((entranceDirection + 180) % 360) as EntityDirection)

  function pointAtAxisOffset(offsetTiles: number): DragTile {
    if (axisIsHorizontal) return { x: start.x + axisSign * offsetTiles * GRID, y: start.y }
    return { x: start.x, y: start.y + axisSign * offsetTiles * GRID }
  }
  function axisTileOffset(point: DragTile): number {
    const dx = (point.x - start.x) / GRID
    const dy = (point.y - start.y) / GRID
    return (axisIsHorizontal ? dx : dy) * axisSign
  }

  const cursorOffset = axisTileOffset(cursor)
  if (cursorOffset < 1) return []

  const pairs: UndergroundDragPair[] = []
  const virtualRects: Rect[] = []

  function makeItem(offset: number, direction: EntityDirection, extraType: 'input' | 'output' | undefined): DragPlacementResult | null {
    const point = pointAtAxisOffset(offset)
    const rect: Rect = { x: point.x, y: point.y, width: item.width, height: item.height }
    if (!isFreeRect(rect, entities, virtualRects)) return null
    virtualRects.push(rect)
    return {
      x: point.x,
      y: point.y,
      width: item.width,
      height: item.height,
      direction,
      extra: extraType ? { ...item.baseExtra, type: extraType } : item.baseExtra,
    }
  }

  let entranceOffset = 0
  while (true) {
    const entranceResult = makeItem(entranceOffset, entranceDirection, item.isBelt ? 'input' : undefined)
    if (!entranceResult) break // вход заблокирован — цепочка обрывается здесь, без отмены уже построенного

    const reachOffset = entranceOffset + item.maxDistance
    if (cursorOffset >= reachOffset) {
      // курсор дошёл до клетки, где пара помещается целиком — коммитим,
      // следующий вход сразу за этим выходом
      const exitResult = makeItem(reachOffset, exitDirection, item.isBelt ? 'output' : undefined)
      if (!exitResult) {
        pairs.push({ entrance: entranceResult, exit: null })
        break
      }
      entranceResult.connects = true
      exitResult.connects = true
      pairs.push({ entrance: entranceResult, exit: exitResult })
      entranceOffset = reachOffset + 1
      if (cursorOffset < entranceOffset) break
      continue
    }

    // "живой" хвост — курсор ещё не дошёл до максимума этой пары
    const liveOffset = cursorOffset - entranceOffset
    if (liveOffset >= 1) {
      const exitResult = makeItem(entranceOffset + liveOffset, exitDirection, item.isBelt ? 'output' : undefined)
      if (exitResult) {
        entranceResult.connects = true
        exitResult.connects = true
      }
      pairs.push({ entrance: entranceResult, exit: exitResult })
    } else {
      pairs.push({ entrance: entranceResult, exit: null })
    }
    break
  }

  return pairs
}
