import type { PlacedEntity, EntityDirection } from '../store/canvasStore'
import type { CatalogEntity, IoHintsFluidPort } from '../store/entityCatalogStore'
import type { Recipe, RecipeIngredient } from './api/recipes'

export type IoHintKind = 'in' | 'out' | 'dir' | 'neutral'

export interface IoHintPrimitive {
  key: string
  // Координаты в px, в локальной системе координат бокса сущности (0,0 —
  // левый верхний угол, как entity.width/entity.height) — то же, в чём
  // EntityNode позиционирует спрайт.
  x: number
  y: number
  // Угол поворота стрелки в градусах, 0 = вверх (север), по часовой стрелке
  // (та же конвенция, что entity.direction и CSS transform: rotate()).
  angle: number
  kind: IoHintKind
  iconUrl?: string | null
  color?: string | null
  label?: string | null
}

export type CardinalDeg = 0 | 90 | 180 | 270

// Инфо из networks.ts (computeNetworks) для ОДНОЙ конкретной сущности —
// EntityNode собирает его из networksStore и передаёт сюда, сам
// computeIoHints про стор/сеть целиком ничего не знает (остаётся чистой
// функцией). network=null (или isTracked=false) — группировка не
// активна (режим выделения рамкой) или сеть ещё не посчитана; рендер
// падает обратно на старое "каждая сущность — своя стрелка" поведение.
export interface NetworkRenderInfo {
  // true для ЛЮБОЙ ленты/трубы, когда группировка активна (даже
  // одиночной/несвязанной — networks.ts регистрирует ВСЕ ленты и трубы,
  // не только связанные) — отличает "это середина цепочки, подсказок не
  // нужно" от "группировка просто выключена, работает старое поведение".
  isTracked: boolean
  endpoints: { role: 'in' | 'out' | 'end'; direction: CardinalDeg }[]
  // Индексы (IoHintsFluidPort.index) собственных fluidPorts сущности,
  // занятых подключённой трубой — не только у труб, у ЛЮБОЙ сущности с
  // fluidPorts (машины, боiler, насосы и т.п.).
  connectedPortIndexes: Set<number>
}

// Экспортированы для src/lib/networks.ts — та же геометрия поворота
// нужна для проверки "стоит ли труба в соседней клетке за портом машины"
// (см. тамошний portExternalTile), дублировать её там не хочется.
export function normalizeDirection(direction: number | undefined): CardinalDeg {
  const d = (((direction ?? 0) % 360) + 360) % 360
  const snapped = (Math.round(d / 90) * 90) % 360
  return snapped as CardinalDeg
}

// Поворот вектора (в тайлах, "северная" система координат сущности) по
// часовой стрелке на direction — та же конвенция, что R/rotateEntities
// в canvasStore.ts (x вправо, y вниз, поворот по часовой).
export function rotateVector([x, y]: [number, number], direction: number): [number, number] {
  switch (normalizeDirection(direction)) {
    case 90:
      return [-y, x]
    case 180:
      return [-x, -y]
    case 270:
      return [y, -x]
    default:
      return [x, y]
  }
}

function tileVectorToBoxPoint(
  entity: PlacedEntity,
  vec: [number, number],
): { x: number; y: number } {
  const [rx, ry] = rotateVector(vec, entity.direction ?? 0)
  return { x: entity.width / 2 + rx * 32, y: entity.height / 2 + ry * 32 }
}

// Доминирующая ось вектора -> один из 4 кардинальных углов (стрелки
// подсказок всегда осе-выровненные, диагоналей не бывает).
function cardinalAngleOf([x, y]: [number, number]): 0 | 90 | 180 | 270 {
  if (Math.abs(y) >= Math.abs(x)) return y < 0 ? 0 : 180
  return x > 0 ? 90 : 270
}

export const DIR_UNITS_TO_DEG: Record<number, CardinalDeg> = { 0: 0, 4: 90, 8: 180, 12: 270 }

function rotatePortFacing(portDirectionUnits: number, entityDirection: number | undefined): 0 | 90 | 180 | 270 {
  const base = DIR_UNITS_TO_DEG[portDirectionUnits] ?? 0
  return normalizeDirection(base + (entityDirection ?? 0))
}

// Прижимает точку порта к краю бокса вдоль оси, куда "смотрит" порт
// (facingDeg) — сырая позиция из прототипа обычно лежит чуть ВНУТРИ
// бокса (см. отчёт по данным), а для абстрактной SVG-подсказки нужен
// чёткий маркер на границе, а не пиксель-в-пиксель повтор игровой
// графики (в отличие от fluidPipeOverlays, этим подсказкам не нужна
// точная подгонка под спрайт).
function clampToEdge(
  point: { x: number; y: number },
  facingDeg: 0 | 90 | 180 | 270,
  entity: PlacedEntity,
): { x: number; y: number } {
  switch (facingDeg) {
    case 0:
      return { x: point.x, y: 0 }
    case 90:
      return { x: entity.width, y: point.y }
    case 180:
      return { x: point.x, y: entity.height }
    default:
      return { x: 0, y: point.y }
  }
}

function colorToCss(color: [number, number, number] | null | undefined): string | null {
  if (!color) return null
  return `rgb(${color[0]}, ${color[1]}, ${color[2]})`
}

const EDGE_ORDER = ['west', 'north', 'east', 'south'] as const
type Edge = (typeof EDGE_ORDER)[number]

function rotateEdge(edge: Edge, direction: number | undefined): Edge {
  const idx = EDGE_ORDER.indexOf(edge)
  const step = Math.round(normalizeDirection(direction) / 90)
  return EDGE_ORDER[(idx + step) % 4]
}

function pointOnEdge(edge: Edge, fraction: number, w: number, h: number): { x: number; y: number } {
  switch (edge) {
    case 'west':
      return { x: 0, y: h * fraction }
    case 'east':
      return { x: w, y: h * fraction }
    case 'north':
      return { x: w * fraction, y: 0 }
    default:
      return { x: w * fraction, y: h }
  }
}

const EDGE_INWARD_ANGLE: Record<Edge, 0 | 90 | 180 | 270> = { west: 90, east: 270, north: 180, south: 0 }
const EDGE_OUTWARD_ANGLE: Record<Edge, 0 | 90 | 180 | 270> = { west: 270, east: 90, north: 0, south: 180 }

function itemPortsAlongEdge(
  items: RecipeIngredient[],
  edge: Edge,
  kind: 'in' | 'out',
  w: number,
  h: number,
  keyPrefix: string,
): IoHintPrimitive[] {
  const named = items.filter((i) => i.type === 'item' && !i.hidden)
  const angle = kind === 'in' ? EDGE_INWARD_ANGLE[edge] : EDGE_OUTWARD_ANGLE[edge]
  return named.map((item, i) => {
    const fraction = (i + 1) / (named.length + 1)
    const { x, y } = pointOnEdge(edge, fraction, w, h)
    return {
      key: `${keyPrefix}-${item.name}`,
      x,
      y,
      angle,
      kind,
      iconUrl: item.icon,
      label: item.name,
    }
  })
}

// Экспортирован для GroupStatsPanel.tsx — то же сопоставление "i-й
// жидкостный ingredient/result рецепта" нужно и там, чтобы определить,
// какая жидкость течёт по трубной сети (см. отчёт по задаче, п.6).
export function matchFluidForPort(items: RecipeIngredient[], recipeMatchIndex: number): RecipeIngredient | null {
  const fluids = items.filter((i) => i.type === 'fluid')
  const byIndex = fluids.find((f) => f.fluidboxIndex === recipeMatchIndex)
  if (byIndex) return byIndex
  return fluids[recipeMatchIndex] ?? null
}

function fluidPortPrimitive(
  entity: PlacedEntity,
  port: IoHintsFluidPort,
  recipe: Recipe | null,
  hasRecipeSlot: boolean,
): IoHintPrimitive | null {
  const entityDirection = entity.direction ?? 0
  const entityStep = Math.round(normalizeDirection(entityDirection) / 90)

  let rawPoint: { x: number; y: number }
  let facingDeg: 0 | 90 | 180 | 270
  if (port.positionsByDirection) {
    // Единственный известный случай (pumpjack) — позиция уже готова под
    // конкретную ориентацию сущности, поворачивать вектор не нужно (см.
    // io_hints_service.py). Facing берём как объявлено у прототипа, без
    // доп. поворота — минорное косметическое упрощение для этого
    // единственного редкого случая.
    // ВАЖНО: НЕ прогонять через rotateVector/tileVectorToBoxPoint — та
    // точка УЖЕ готова под текущую ориентацию сущности, повторный
    // поворот на entity.direction задвоил бы эффект при direction != 0.
    const [tx, ty] = port.positionsByDirection[entityStep]
    rawPoint = { x: entity.width / 2 + tx * 32, y: entity.height / 2 + ty * 32 }
    facingDeg = DIR_UNITS_TO_DEG[port.direction] ?? 0
  } else if (port.position) {
    rawPoint = tileVectorToBoxPoint(entity, port.position)
    facingDeg = rotatePortFacing(port.direction, entityDirection)
  } else {
    return null
  }

  const point = clampToEdge(rawPoint, facingDeg, entity)

  let kind: IoHintKind
  let angle: number
  if (port.productionType === 'input') {
    kind = 'in'
    angle = normalizeDirection(facingDeg + 180)
  } else if (port.productionType === 'output') {
    kind = 'out'
    angle = facingDeg
  } else {
    kind = 'neutral'
    angle = facingDeg
  }

  // Фиксированный фильтр жидкости у самого fluid_box (вода у котла и
  // т.п.) — показываем всегда, независимо от рецепта.
  if (port.filter) {
    return {
      key: `fluid-${port.index}`,
      x: point.x,
      y: point.y,
      angle,
      kind,
      iconUrl: port.filter.icon,
      color: colorToCss(port.filter.color),
      label: port.filter.label,
    }
  }

  // Нет фиксированного фильтра, но порт принадлежит сущности с рецептом
  // (kind==='crafting') — пробуем сопоставить с i-м жидкостным
  // ingredient/result текущего рецепта.
  if (hasRecipeSlot) {
    if (!recipe || port.recipeMatchIndex === null) {
      // Рецепт не выбран (или порт input-output без явной роли) —
      // нейтральная серая метка без названия жидкости.
      return { key: `fluid-${port.index}`, x: point.x, y: point.y, angle, kind: 'neutral', color: 'var(--text-dim)' }
    }
    const pool = port.productionType === 'input' ? recipe.ingredients : recipe.results
    const match = matchFluidForPort(pool, port.recipeMatchIndex)
    if (!match) {
      // У текущего рецепта нет столько жидкостных ingredient/result —
      // порт скрываем (ближе к игре, см. fluid_boxes_off_when_no_fluid_recipe).
      return null
    }
    return {
      key: `fluid-${port.index}`,
      x: point.x,
      y: point.y,
      angle,
      kind,
      iconUrl: match.icon,
      color: colorToCss(match.color),
      label: match.name,
    }
  }

  // Не crafting-сущность (pump, storage-tank, electric-mining-drill и
  // т.п.) и нет фиксированного фильтра — жидкость неизвестна в принципе,
  // нейтральная серая метка.
  return { key: `fluid-${port.index}`, x: point.x, y: point.y, angle, kind: 'neutral', color: 'var(--text-dim)' }
}

// Точка на переднем (front=true, по ходу direction) или заднем (front=false,
// противоположном) крае тайла конвейера — начало/конец группы рисуются на
// РАЗНЫХ краях одного и того же тайла одним и тем же углом (dir), чтобы
// даже у изолированной ленты (одновременно начало И конец) стрелки не
// накладывались друг на друга визуально.
function beltEdgePoint(dir: CardinalDeg, w: number, h: number, front: boolean): { x: number; y: number } {
  switch (dir) {
    case 0:
      return { x: w / 2, y: front ? 0 : h }
    case 90:
      return { x: front ? w : 0, y: h / 2 }
    case 180:
      return { x: w / 2, y: front ? h : 0 }
    default:
      return { x: front ? 0 : w, y: h / 2 }
  }
}

function computeSplitterHints(w: number, h: number, direction: EntityDirection | undefined): IoHintPrimitive[] {
  const dir = normalizeDirection(direction)
  const prims: IoHintPrimitive[] = []
  if (dir === 0 || dir === 180) {
    const laneOffset = w / 4
    const outY = dir === 0 ? 0 : h
    const inY = dir === 0 ? h : 0
    for (const sign of [-1, 1] as const) {
      prims.push({ key: `out-${sign}`, x: w / 2 + sign * laneOffset, y: outY, angle: dir, kind: 'out' })
      prims.push({ key: `in-${sign}`, x: w / 2 + sign * laneOffset, y: inY, angle: dir, kind: 'in' })
    }
  } else {
    const laneOffset = h / 4
    const outX = dir === 90 ? w : 0
    const inX = dir === 90 ? 0 : w
    for (const sign of [-1, 1] as const) {
      prims.push({ key: `out-${sign}`, x: outX, y: h / 2 + sign * laneOffset, angle: dir, kind: 'out' })
      prims.push({ key: `in-${sign}`, x: inX, y: h / 2 + sign * laneOffset, angle: dir, kind: 'in' })
    }
  }
  return prims
}

/**
 * Чистая функция — геометрия всех подсказок входов/выходов одной
 * размещённой сущности, уже повёрнутая под entity.direction. Рендер —
 * IoHints.tsx (SVG-оверлей внутри EntityNode, только в режиме "квадрат
 * с иконкой"). recipe — разрешённый объект рецепта из каталога
 * (entity.recipe найден в recipeCatalogStore), null если рецепт не
 * выбран/не найден. network — см. NetworkRenderInfo выше; null/isTracked=false
 * — группировка не активна (режим выделения рамкой), рендерим как раньше.
 */
export function computeIoHints(
  entity: PlacedEntity,
  catalogEntry: CatalogEntity | undefined,
  recipe: Recipe | null,
  network: NetworkRenderInfo | null = null,
): IoHintPrimitive[] {
  const hints = catalogEntry?.ioHints
  if (!hints) return []

  const w = entity.width
  const h = entity.height
  const direction = entity.direction ?? 0

  switch (hints.kind) {
    case 'belt': {
      // Группировка (lib/networks.ts) применяется только к обычным
      // конвейерам на этом этапе — подземные/погрузчики остаются как
      // были до этапа 2 (их ветка ниже, вместе с 'loader').
      if (network?.isTracked) {
        return network.endpoints.map((ep) => {
          const point = beltEdgePoint(ep.direction, w, h, ep.role === 'out')
          return {
            key: `belt-${ep.role}`,
            x: point.x,
            y: point.y,
            angle: ep.direction,
            kind: ep.role === 'out' ? 'out' : 'in',
          }
        })
      }
      return [{ key: 'dir', x: w / 2, y: h / 2, angle: normalizeDirection(direction), kind: 'dir' }]
    }

    case 'underground-belt':
    case 'loader': {
      return [{ key: 'dir', x: w / 2, y: h / 2, angle: normalizeDirection(direction), kind: 'dir' }]
    }

    case 'splitter': {
      return computeSplitterHints(w, h, entity.direction)
    }

    case 'inserter': {
      if (!hints.inserter) return []
      const pickupVec = rotateVector(hints.inserter.pickup, direction)
      const dropVec = rotateVector(hints.inserter.drop, direction)
      const pickupPoint = tileVectorToBoxPoint(entity, hints.inserter.pickup)
      const dropPoint = tileVectorToBoxPoint(entity, hints.inserter.drop)
      return [
        {
          key: 'pickup',
          x: pickupPoint.x,
          y: pickupPoint.y,
          angle: normalizeDirection(cardinalAngleOf(pickupVec) + 180),
          kind: 'in',
        },
        {
          key: 'drop',
          x: dropPoint.x,
          y: dropPoint.y,
          angle: cardinalAngleOf(dropVec),
          kind: 'out',
        },
      ]
    }

    case 'mining-drill': {
      const prims: IoHintPrimitive[] = []
      if (hints.dropVector) {
        const rotated = rotateVector(hints.dropVector, direction)
        const point = tileVectorToBoxPoint(entity, hints.dropVector)
        prims.push({ key: 'drop-vector', x: point.x, y: point.y, angle: cardinalAngleOf(rotated), kind: 'out' })
      }
      if (hints.fluidPorts) {
        for (const port of hints.fluidPorts) {
          if (network?.connectedPortIndexes.has(port.index)) continue // занят подключённой трубой
          const prim = fluidPortPrimitive(entity, port, recipe, false)
          if (prim) prims.push(prim)
        }
      }
      return prims
    }

    case 'fixed-fluid': {
      // Трубы сами получают ioHints.kind='fixed-fluid' (у них тоже
      // fluid_box с pipe_connections на все 4 стороны) — отличаем их от
      // "настоящих" fixed-fluid сущностей (насос, котёл, резервуар) по
      // pipeSpriteVariants, тому же критерию, что и computePipeVariantKey.
      const isPipe = !!catalogEntry?.pipeSpriteVariants
      if (isPipe && network?.isTracked) {
        // В сети труб обычные 4 нейтральных порта не рисуем — только
        // стрелка-продолжение у концевых труб (степень 1); угловые/
        // тройники/кресты/одиночные (степень 0) — вообще без подсказок.
        return network.endpoints
          .filter((ep) => ep.role === 'end')
          .map((ep) => ({
            key: `pipe-end-${ep.direction}`,
            x: w / 2,
            y: h / 2,
            angle: ep.direction,
            kind: 'dir' as const,
          }))
      }
      if (!hints.fluidPorts) return []
      const prims: IoHintPrimitive[] = []
      for (const port of hints.fluidPorts) {
        if (network?.connectedPortIndexes.has(port.index)) continue
        const prim = fluidPortPrimitive(entity, port, recipe, false)
        if (prim) prims.push(prim)
      }
      return prims
    }

    case 'crafting': {
      const prims: IoHintPrimitive[] = []
      if (recipe) {
        const inputEdge = rotateEdge('west', direction)
        const outputEdge = rotateEdge('east', direction)
        prims.push(...itemPortsAlongEdge(recipe.ingredients, inputEdge, 'in', w, h, 'item-in'))
        prims.push(...itemPortsAlongEdge(recipe.results, outputEdge, 'out', w, h, 'item-out'))
      }
      if (hints.fluidPorts) {
        for (const port of hints.fluidPorts) {
          if (network?.connectedPortIndexes.has(port.index)) continue
          const prim = fluidPortPrimitive(entity, port, recipe, true)
          if (prim) prims.push(prim)
        }
      }
      return prims
    }

    default:
      return []
  }
}
