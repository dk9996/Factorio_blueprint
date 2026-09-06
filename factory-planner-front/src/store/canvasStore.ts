import { create } from 'zustand'

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
  bottleneck?: boolean
  power?: number
  pollution?: number
  throughput?: number
  recipe?: string | null
  craftingCategories?: string[]
  moduleSlots?: number
  config?: Record<string, unknown>
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
  craftingCategories?: string[]
  moduleSlots?: number
  recipe?: string | null
}

export interface PlacingState {
  items: PlacingGroupItem[]
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
  removeEntity: (id: number) => void
  removeEntities: (ids: Set<number>) => void
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

    removeEntity: (id) => {
      pushHistory()
      set((state) => ({ entities: state.entities.filter((e) => e.id !== id) }))
    },

    removeEntities: (ids) => {
      if (ids.size === 0) return
      pushHistory()
      set((state) => ({ entities: state.entities.filter((e) => !ids.has(e.id)) }))
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