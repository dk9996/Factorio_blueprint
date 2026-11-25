import { create } from 'zustand'
import { useCanvasStore, type PlacedEntity } from './canvasStore'
import { useViewportStore } from './viewportStore'
import type { BlueprintTabMeta } from '../lib/blueprint/convert.ts'
import { hasTiles, type TileMap } from '../lib/tiles.ts'
import type { Wire } from '../lib/circuit/types.ts'

interface Snapshot {
  entities: PlacedEntity[]
  nextId: number
  tiles?: TileMap
  wires?: Wire[]
}

// Ключ "сохранённого состояния" вкладки для сравнения (грязная вкладка):
// сущности + слой плиток (плитки в ключ добавляются, только если они есть —
// у проектов без плиток ключ прежний).
export function savedStateKey(entities: PlacedEntity[], tiles?: TileMap, wires?: Wire[]): string {
  return (
    JSON.stringify(entities) +
    (hasTiles(tiles) ? '|tiles:' + JSON.stringify(tiles) : '') +
    (wires && wires.length > 0 ? '|wires:' + JSON.stringify(wires) : '')
  )
}

export interface Tab {
  id: string
  title: string
  factoryId: string | null
  entities: PlacedEntity[]
  nextId: number
  // Слой плиток вкладки (у старых сохранённых вкладок поля нет = {}).
  tiles?: TileMap
  // Провода схемной сети вкладки (у старых вкладок поля нет = [])
  wires?: Wire[]
  past: Snapshot[]
  future: Snapshot[]
  offsetX: number
  offsetY: number
  scale: number
  savedEntitiesJson: string
  // Метаданные исходного чертежа Factorio (label/description/icons/tiles/
  // wires/version) — только у вкладок, открытых импортом строки чертежа
  // (см. ImportExportPanel). Нужны, чтобы повторный экспорт той же
  // вкладки не терял эти данные. У обычных вкладок — undefined.
  blueprintMeta?: BlueprintTabMeta
}

interface TabsStore {
  tabs: Tab[]
  activeTabId: string
  openBlankTab: () => void
  openFactoryTab: (factoryId: string, title: string, entities: PlacedEntity[]) => void
  // Новая вкладка из импортированного чертежа (см. ImportExportPanel) —
  // в отличие от openFactoryTab НЕ ищет существующую вкладку с тем же
  // чертежом (каждый импорт — новая вкладка) и не привязана к сохранённому
  // заводу (factoryId всегда null).
  openBlueprintTab: (
    title: string,
    entities: PlacedEntity[],
    nextId: number,
    meta: BlueprintTabMeta,
    tiles?: TileMap,
    wires?: Wire[],
  ) => string
  closeTab: (id: string) => void
  switchTab: (id: string) => void
  renameActiveTab: (title: string) => void
  attachFactoryToActiveTab: (factoryId: string, title: string) => void
  getActiveTab: () => Tab | undefined
  markTabSaved: (tabId: string, entities: PlacedEntity[], tiles?: TileMap) => void
  isTabDirty: (tabId: string) => boolean
  // Вкладки проекта (книга) — см. lib/projects/projectSession.ts. loadTabs
  // полностью заменяет текущий список вкладок (используется при входе в
  // проект из главного меню); getTabsSnapshot — обратная операция, снимок
  // ТЕКУЩЕГО состояния (включая живой canvas/viewport активной вкладки)
  // для сохранения проекта. Если переданный список пуст — подставляется
  // одна пустая вкладка (как у только что созданного проекта).
  loadTabs: (tabs: Tab[], activeTabId: string) => void
  getTabsSnapshot: () => { tabs: Tab[]; activeTabId: string }
  // Все вкладки считаются сохранёнными "как есть сейчас" — вызывается
  // после успешного сохранения проекта целиком (см. lib/projects/
  // projectSession.ts saveActiveProject), а не по одной вкладке за раз.
  markAllTabsSaved: () => void
}

export function blankTab(): Tab {
  return {
    id: `tab-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    title: 'Новый чертёж',
    factoryId: null,
    entities: [],
    nextId: 100,
    past: [],
    future: [],
    offsetX: 0,
    offsetY: 0,
    scale: 1,
    savedEntitiesJson: JSON.stringify([]),
    tiles: {},
    wires: [],
  }
}

function snapshotCurrentStores(): Omit<Tab, 'id' | 'title' | 'factoryId' | 'savedEntitiesJson'> {
  const canvas = useCanvasStore.getState()
  const viewport = useViewportStore.getState()
  return {
    entities: canvas.entities,
    nextId: canvas.nextId,
    tiles: canvas.tiles,
    wires: canvas.wires,
    past: canvas.past,
    future: canvas.future,
    offsetX: viewport.offsetX,
    offsetY: viewport.offsetY,
    scale: viewport.scale,
  }
}

export function restoreStoresFromTab(tab: Tab) {
  useCanvasStore.setState({
    entities: tab.entities,
    nextId: tab.nextId,
    tiles: tab.tiles ?? {},
    wires: tab.wires ?? [],
    past: tab.past,
    future: tab.future,
    placing: null,
  })
  useViewportStore.setState({
    offsetX: tab.offsetX,
    offsetY: tab.offsetY,
    scale: tab.scale,
  })
}

const initial = blankTab()

export const useTabsStore = create<TabsStore>((set, get) => ({
  tabs: [initial],
  activeTabId: initial.id,

  getActiveTab: () => {
    const { tabs, activeTabId } = get()
    return tabs.find((t) => t.id === activeTabId)
  },

  openBlankTab: () => {
    const { tabs, activeTabId } = get()
    const saved = tabs.map((t) => (t.id === activeTabId ? { ...t, ...snapshotCurrentStores() } : t))
    const newTab = blankTab()
    set({ tabs: [...saved, newTab], activeTabId: newTab.id })
    restoreStoresFromTab(newTab)
  },

  openFactoryTab: (factoryId, title, entities) => {
    const { tabs, activeTabId } = get()
    const saved = tabs.map((t) => (t.id === activeTabId ? { ...t, ...snapshotCurrentStores() } : t))

    // если чертёж уже открыт в какой-то вкладке — просто переключаемся на неё
    const existing = saved.find((t) => t.factoryId === factoryId)
    if (existing) {
      set({ tabs: saved, activeTabId: existing.id })
      restoreStoresFromTab(existing)
      return
    }

    const maxId = entities.reduce((m, e) => Math.max(m, e.id), 0)
    const newTab: Tab = {
      id: `tab-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      title,
      factoryId,
      entities,
      nextId: maxId + 1,
      tiles: {},
      wires: [],
      past: [],
      future: [],
      offsetX: 0,
      offsetY: 0,
      scale: 1,
      savedEntitiesJson: JSON.stringify(entities),
    }
    set({ tabs: [...saved, newTab], activeTabId: newTab.id })
    restoreStoresFromTab(newTab)
  },

  openBlueprintTab: (title, entities, nextId, meta, tiles = {}, wires = []) => {
    const { tabs, activeTabId } = get()
    const saved = tabs.map((t) => (t.id === activeTabId ? { ...t, ...snapshotCurrentStores() } : t))

    const newTab: Tab = {
      id: `tab-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      title,
      factoryId: null,
      entities,
      nextId,
      tiles,
      wires,
      past: [],
      future: [],
      offsetX: 0,
      offsetY: 0,
      scale: 1,
      savedEntitiesJson: savedStateKey(entities, tiles, wires),
      blueprintMeta: meta,
    }
    set({ tabs: [...saved, newTab], activeTabId: newTab.id })
    restoreStoresFromTab(newTab)
    return newTab.id
  },

  switchTab: (id) => {
    const { tabs, activeTabId } = get()
    if (id === activeTabId) return
    const saved = tabs.map((t) => (t.id === activeTabId ? { ...t, ...snapshotCurrentStores() } : t))
    const target = saved.find((t) => t.id === id)
    if (!target) return
    set({ tabs: saved, activeTabId: id })
    restoreStoresFromTab(target)
  },

  closeTab: (id) => {
    const { tabs, activeTabId } = get()
    const remaining = tabs.filter((t) => t.id !== id)

    if (remaining.length === 0) {
      const newTab = blankTab()
      set({ tabs: [newTab], activeTabId: newTab.id })
      restoreStoresFromTab(newTab)
      return
    }

    if (id === activeTabId) {
      const nextActive = remaining[remaining.length - 1]
      set({ tabs: remaining, activeTabId: nextActive.id })
      restoreStoresFromTab(nextActive)
    } else {
      set({ tabs: remaining })
    }
  },

  renameActiveTab: (title) =>
    set((state) => ({
      tabs: state.tabs.map((t) => (t.id === state.activeTabId ? { ...t, title } : t)),
    })),

  attachFactoryToActiveTab: (factoryId, title) =>
    set((state) => ({
      tabs: state.tabs.map((t) =>
        t.id === state.activeTabId ? { ...t, factoryId, title } : t,
      ),
    })),

  markTabSaved: (tabId, entities, tiles) =>
    set((state) => ({
      tabs: state.tabs.map((t) =>
        t.id === tabId
          ? {
              ...t,
              savedEntitiesJson: savedStateKey(
                entities,
                tiles ?? (tabId === state.activeTabId ? useCanvasStore.getState().tiles : t.tiles),
                tabId === state.activeTabId ? useCanvasStore.getState().wires : t.wires,
              ),
            }
          : t,
      ),
    })),

  isTabDirty: (tabId) => {
    const { tabs, activeTabId } = get()
    const tab = tabs.find((t) => t.id === tabId)
    if (!tab) return false

    const live = tabId === activeTabId ? useCanvasStore.getState() : tab
    return savedStateKey(live.entities, live.tiles, live.wires) !== tab.savedEntitiesJson
  },

  loadTabs: (tabs, activeTabId) => {
    const safeTabs = tabs.length > 0 ? tabs : [blankTab()]
    const target = safeTabs.find((t) => t.id === activeTabId) ?? safeTabs[0]
    const stamped = safeTabs.map((t) => ({ ...t, savedEntitiesJson: savedStateKey(t.entities, t.tiles, t.wires) }))
    set({ tabs: stamped, activeTabId: target.id })
    restoreStoresFromTab(target)
  },

  getTabsSnapshot: () => {
    const { tabs, activeTabId } = get()
    const withLive = tabs.map((t) => (t.id === activeTabId ? { ...t, ...snapshotCurrentStores() } : t))
    return { tabs: withLive, activeTabId }
  },

  markAllTabsSaved: () => {
    const { tabs, activeTabId } = get()
    set({
      tabs: tabs.map((t) => ({
        ...t,
        savedEntitiesJson:
          t.id === activeTabId
            ? savedStateKey(useCanvasStore.getState().entities, useCanvasStore.getState().tiles, useCanvasStore.getState().wires)
            : savedStateKey(t.entities, t.tiles, t.wires),
      })),
    })
  },
}))