import { create } from 'zustand'
import type { ModuleStackEntry } from '../lib/blueprint/modules.ts'

export type EntityDirection = 0 | 90 | 180 | 270

export interface PlacedEntity {
  id: number
  typeId: string
  type?: string
  icon: string
  label: string
  x: number
  y: number
  width: number
  height: number
  // Поворот (R в игре) — 0/90/180/270, по часовой стрелке. undefined
  // трактуется как 0 (сущности, размещённые до появления этого поля).
  direction?: EntityDirection
  bottleneck?: boolean
  power?: number
  pollution?: number
  throughput?: number
  recipe?: string | null
  craftingCategories?: string[]
  moduleSlots?: number
  config?: Record<string, unknown>
  // Модули в слотах (entities[].items чертежа) — см. lib/blueprint/modules.ts.
  // Своего UI для их выбора пока нет, появляются только через импорт
  // чертежа и сохраняются для обратного экспорта без потерь.
  modules?: ModuleStackEntry[]
  // Сырые поля сущности чертежа Factorio, которые не разобраны в
  // собственные поля модели (type у underground-belt/loader "input"/
  // "output", filters, control_behavior, quality и т.д.) — см.
  // lib/blueprint/extra.ts. Сохраняются и пишутся обратно при экспорте
  // без изменений, чтобы импорт-экспорт чертежа из игры не терял настройки.
  extra?: Record<string, unknown>
}

export interface PlacingGroupItem {
  typeId: string
  type?: string
  icon: string
  label: string
  width: number
  height: number
  offsetX: number
  offsetY: number
  direction?: EntityDirection
  craftingCategories?: string[]
  moduleSlots?: number
  recipe?: string | null
  modules?: ModuleStackEntry[]
  extra?: Record<string, unknown>
}

export interface PlacingState {
  items: PlacingGroupItem[]
  // Двухшаговая постановка подземных конвейеров/труб (см.
  // src/lib/underground.ts) — true только когда сущность выбрана ЗАНОВО
  // из хотбара/палитры (Hotbar.tsx/EntityPalette.tsx). Подхват
  // существующей (Q), вставка из буфера/чертежа и т.п. эту механику НЕ
  // включают — там тип определяется автоматически по соседям в момент
  // постановки, без форсирования и без переключения фазы.
  undergroundAutoCycle?: boolean
  // 'exit' — items[0] это форсированная "выходная" часть пары, привязанная
  // к undergroundEntranceAnchor (уже поставленной "входной" части).
  // undefined (при undergroundAutoCycle=true) — items[0] это
  // "входная" часть, которая при постановке переключит фазу на 'exit'.
  undergroundPhase?: 'exit'
  undergroundEntranceAnchor?: { x: number; y: number; direction: EntityDirection; typeId: string }
}

interface Rect {
  x: number
  y: number
  width: number
  height: number
}

function isOverlapping(a: Rect, b: Rect): boolean {
  return (
    a.x < b.x + b.width &&
    a.x + a.width > b.x &&
    a.y < b.y + b.height &&
    a.y + a.height > b.y
  )
}

interface Snapshot {
  entities: PlacedEntity[]
  nextId: number
}

interface CanvasStore {
  setEntityRecipe: (id: number, recipe: string | null) => void
  updateEntityConfig: (id: number, patch: Record<string, unknown>) => void
  entities: PlacedEntity[]
  nextId: number

  placing: PlacingState | null
  setPlacing: (state: PlacingState | null) => void
  
  
  past: Snapshot[]
  future: Snapshot[]
  loadEntities: (entities: PlacedEntity[]) => void
  addEntity: (partial: Omit<PlacedEntity, 'id'>) => boolean
  addEntities: (list: Omit<PlacedEntity, 'id'>[]) => number[]
  moveEntityLive: (id: number, x: number, y: number) => void
  commitMove: (id: number, origX: number, origY: number) => void
  // Групповое перетаскивание (автоматические сети конвейеров/труб, см.
  // lib/networks.ts) — та же дельта применяется ко ВСЕМ id сразу,
  // атомарно (если хоть один упирается в соседа вне группы — не
  // двигаем НИКОГО, вся группа остаётся на месте, как moveEntityLive
  // молча отклоняет недопустимое перемещение одной сущности).
  moveEntitiesLive: (ids: number[], dx: number, dy: number, origins: Map<number, { x: number; y: number }>) => void
  commitEntitiesMove: (ids: number[], origins: Map<number, { x: number; y: number }>) => void
  removeEntity: (id: number) => void
  removeEntities: (ids: Set<number>) => void
  rotateEntities: (ids: Set<number>, deltaSteps: 1 | -1) => void
  // R по уже связанной паре подземных конвейеров/труб (см.
  // src/lib/underground.ts, findUndergroundPartner) — в игре это не
  // поворот на 90°, а разворот всего пролёта на 180° сразу у обеих
  // частей (иначе ось связи ломается — поворот на 90° увёл бы вторую
  // половину с линии связи). Для лент дополнительно меняет местами
  // extra.type (вход/выход) — физически именно вход и выход меняются
  // ролями при развороте потока. Обе сущности всегда 1x1, свап width/
  // height (как у rotateEntities) не нужен.
  flipUndergroundPair: (idA: number, idB: number) => void
  canPlaceAt: (rect: Rect, excludeId?: number) => boolean

  undo: () => void
  redo: () => void
}

const GRID = 32
const MAX_HISTORY = 50

const mockInitial: PlacedEntity[] = [
  { id: 1, typeId: 'assembling-machine-2', icon: '/assets/icons-cropped/assembling-machine-2.png', label: 'ASM-2', x: 320, y: 64, width: 96, height: 96 },
  { id: 2, typeId: 'transport-belt', icon: '/assets/icons-cropped/transport-belt.png', label: 'belt', x: 256, y: 96, width: 64, height: 32, bottleneck: true, throughput: 92 },
  { id: 3, typeId: 'assembling-machine-2', icon: '/assets/icons-cropped/assembling-machine-2.png', label: 'ASM-2', x: 192, y: 128, width: 96, height: 96 },
  { id: 4, typeId: 'transport-belt', icon: '/assets/icons-cropped/transport-belt.png', label: 'belt', x: 224, y: 224, width: 32, height: 64 },
  { id: 5, typeId: 'assembling-machine-2', icon: '/assets/icons-cropped/assembling-machine-2.png', label: 'ASM-2', x: 64, y: 256, width: 96, height: 96 },
  { id: 6, typeId: 'assembling-machine-2', icon: '/assets/icons-cropped/assembling-machine-2.png', label: 'ASM-2', x: 256, y: 256, width: 96, height: 96, power: 142, pollution: 3.8, throughput: 92 },
]

export const useCanvasStore = create<CanvasStore>((set, get) => {

  
  
  function pushHistory() {
    const { entities, nextId, past } = get()
    const snapshot: Snapshot = { entities, nextId }
    const nextPast = [...past, snapshot].slice(-MAX_HISTORY)
    set({ past: nextPast, future: [] })
  }

  return {

      loadEntities: (entities) => {
      const maxId = entities.reduce((max, e) => Math.max(max, e.id), 0)
      set({
        entities,
        nextId: maxId + 1,
        placing: null,
        past: [],
        future: [],
      })
    },
    
    entities: mockInitial,
    nextId: 100,

    placing: null,
    setPlacing: (state) => set({ placing: state }),

    past: [],
    future: [],

    canPlaceAt: (rect, excludeId) => {
      const { entities } = get()
      return !entities.some((e) => e.id !== excludeId && isOverlapping(rect, e))
    },

    addEntity: (partial) => {
      const { entities, canPlaceAt, nextId } = get()
      const rect: Rect = { x: partial.x, y: partial.y, width: partial.width, height: partial.height }
      if (!canPlaceAt(rect)) return false

      pushHistory()
      set({
        entities: [...entities, { ...partial, id: nextId }],
        nextId: nextId + 1,
      })
      return true
    },

    addEntities: (list) => {
      const { entities, nextId } = get()
      pushHistory()
      const newIds: number[] = []
      let id = nextId
      const added: PlacedEntity[] = []
      for (const partial of list) {
        added.push({ ...partial, id })
        newIds.push(id)
        id++
      }
      set({ entities: [...entities, ...added], nextId: id })
      return newIds
    },

    moveEntityLive: (id, x, y) => {
      const { entities, canPlaceAt } = get()
      const current = entities.find((e) => e.id === id)
      if (!current) return

      const snappedX = Math.round(x / GRID) * GRID
      const snappedY = Math.round(y / GRID) * GRID
      const rect: Rect = { x: snappedX, y: snappedY, width: current.width, height: current.height }

      if (!canPlaceAt(rect, id)) return

      set({
        entities: entities.map((e) => (e.id === id ? { ...e, x: snappedX, y: snappedY } : e)),
      })
    },

    commitMove: (id, origX, origY) => {
      const { entities } = get()
      const current = entities.find((e) => e.id === id)
      if (!current) return
      if (current.x === origX && current.y === origY) return

      const { past, nextId } = get()
      const rolledBackEntities = entities.map((e) =>
        e.id === id ? { ...e, x: origX, y: origY } : e,
      )
      const snapshot: Snapshot = { entities: rolledBackEntities, nextId }
      set({ past: [...past, snapshot].slice(-MAX_HISTORY), future: [] })
    },

    moveEntitiesLive: (ids, dx, dy, origins) => {
      if (ids.length === 0) return
      const { entities } = get()
      const idSet = new Set(ids)

      const newPositions = new Map<number, { x: number; y: number }>()
      for (const id of ids) {
        const origin = origins.get(id)
        if (!origin) continue
        newPositions.set(id, {
          x: Math.round((origin.x + dx) / GRID) * GRID,
          y: Math.round((origin.y + dy) / GRID) * GRID,
        })
      }

      // Коллизия — только относительно сущностей ВНЕ группы: при сдвиге
      // на одинаковую дельту взаимное расположение членов группы не
      // меняется, друг с другом они столкнуться не могут.
      for (const e of entities) {
        if (!idSet.has(e.id)) continue
        const pos = newPositions.get(e.id)
        if (!pos) continue
        const rect: Rect = { x: pos.x, y: pos.y, width: e.width, height: e.height }
        const blocked = entities.some((other) => !idSet.has(other.id) && isOverlapping(rect, other))
        if (blocked) return // атомарно — не двигаем никого из группы
      }

      set({
        entities: entities.map((e) => {
          const pos = newPositions.get(e.id)
          return pos ? { ...e, x: pos.x, y: pos.y } : e
        }),
      })
    },

    commitEntitiesMove: (ids, origins) => {
      if (ids.length === 0) return
      const idSet = new Set(ids)
      const { entities, past, nextId } = get()

      let anyMoved = false
      const rolledBackEntities = entities.map((e) => {
        if (!idSet.has(e.id)) return e
        const origin = origins.get(e.id)
        if (!origin) return e
        if (e.x !== origin.x || e.y !== origin.y) anyMoved = true
        return { ...e, x: origin.x, y: origin.y }
      })
      if (!anyMoved) return

      const snapshot: Snapshot = { entities: rolledBackEntities, nextId }
      set({ past: [...past, snapshot].slice(-MAX_HISTORY), future: [] })
    },

    removeEntity: (id) => {
      pushHistory()
      set((state) => ({ entities: state.entities.filter((e) => e.id !== id) }))
    },

    removeEntities: (ids) => {
      if (ids.size === 0) return
      pushHistory()
      set((state) => ({ entities: state.entities.filter((e) => !ids.has(e.id)) }))
    },

    rotateEntities: (ids, deltaSteps) => {
      if (ids.size === 0) return
      const { entities, canPlaceAt } = get()

      // Поворот на 90°/270° всегда меняет местами width/height вокруг ТЕКУЩЕГО
      // центра сущности (0/180 — размеры не меняются, свап нужен ровно на
      // каждом шаге ±90°, независимо от абсолютного direction — два свапа
      // подряд возвращают исходные размеры, что и требуется для 0<->180).
      // Хитбокс/коллизия не должны накладываться на соседей после поворота —
      // если новый прямоугольник блокирован, эту сущность просто пропускаем
      // (остальные выделенные всё равно поворачиваются), как и moveEntityLive
      // молча отклоняет недопустимое перемещение.
      const rotated = entities.map((e) => {
        if (!ids.has(e.id)) return e
        const newWidth = e.height
        const newHeight = e.width
        const newX = e.x + (e.width - newWidth) / 2
        const newY = e.y + (e.height - newHeight) / 2
        const newDirection = (((e.direction ?? 0) + deltaSteps * 90) % 360 + 360) % 360 as PlacedEntity['direction']
        const rect: Rect = { x: newX, y: newY, width: newWidth, height: newHeight }
        if (!canPlaceAt(rect, e.id)) return e
        return { ...e, x: newX, y: newY, width: newWidth, height: newHeight, direction: newDirection }
      })

      if (rotated.every((e, i) => e === entities[i])) return // все повороты заблокированы — нечего коммитить

      pushHistory()
      set({ entities: rotated })
    },

    flipUndergroundPair: (idA, idB) => {
      const { entities } = get()
      const a = entities.find((e) => e.id === idA)
      const b = entities.find((e) => e.id === idB)
      if (!a || !b) return

      const flipType = (extra: Record<string, unknown> | undefined) => {
        if (!extra || (extra.type !== 'input' && extra.type !== 'output')) return extra
        return { ...extra, type: extra.type === 'input' ? 'output' : 'input' }
      }

      pushHistory()
      set({
        entities: entities.map((e) => {
          if (e.id !== idA && e.id !== idB) return e
          const newDirection = (((e.direction ?? 0) + 180) % 360) as PlacedEntity['direction']
          return { ...e, direction: newDirection, extra: flipType(e.extra) }
        }),
      })
    },

    undo: () => {
      const { past, entities, nextId, future } = get()
      if (past.length === 0) return
      const prev = past[past.length - 1]
      const newPast = past.slice(0, -1)
      const currentSnapshot: Snapshot = { entities, nextId }
      set({
        entities: prev.entities,
        nextId: prev.nextId,
        past: newPast,
        future: [currentSnapshot, ...future].slice(0, MAX_HISTORY),
      })
    },

    redo: () => {
      
      const { future, entities, nextId, past } = get()
      if (future.length === 0) return
      const next = future[0]
      const newFuture = future.slice(1)
      const currentSnapshot: Snapshot = { entities, nextId }
      set({
        entities: next.entities,
        nextId: next.nextId,
        past: [...past, currentSnapshot].slice(-MAX_HISTORY),
        future: newFuture,
      })
    },
    setEntityRecipe: (id, recipe) =>
      set((state) => ({
        entities: state.entities.map((e) => (e.id === id ? { ...e, recipe } : e)),
      })),
    updateEntityConfig: (id, patch) =>
      set((state) => ({
        entities: state.entities.map((e) =>
          e.id === id ? { ...e, config: { ...e.config, ...patch } } : e,
        ),
      })),
  }
})