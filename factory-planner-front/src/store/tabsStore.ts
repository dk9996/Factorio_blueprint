import { create } from 'zustand'
import { useCanvasStore, type PlacedEntity } from './canvasStore'
import { useViewportStore } from './viewportStore'

interface Snapshot {
  entities: PlacedEntity[]
  nextId: number
}

interface Tab {
  id: string
  title: string
  factoryId: string | null
  entities: PlacedEntity[]
  nextId: number
  past: Snapshot[]
  future: Snapshot[]
  offsetX: number
  offsetY: number
  scale: number
  savedEntitiesJson: string
}

interface TabsStore {
  tabs: Tab[]
  activeTabId: string
  openBlankTab: () => void
  openFactoryTab: (factoryId: string, title: string, entities: PlacedEntity[]) => void
  closeTab: (id: string) => void
  switchTab: (id: string) => void
  renameActiveTab: (title: string) => void
  attachFactoryToActiveTab: (factoryId: string, title: string) => void
  getActiveTab: () => Tab | undefined
  markTabSaved: (tabId: string, entities: PlacedEntity[]) => void
  isTabDirty: (tabId: string) => boolean
}

function blankTab(): Tab {
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
  }
}

function snapshotCurrentStores(): Omit<Tab, 'id' | 'title' | 'factoryId' | 'savedEntitiesJson'> {
  const canvas = useCanvasStore.getState()
  const viewport = useViewportStore.getState()
  return {
    entities: canvas.entities,
    nextId: canvas.nextId,
    past: canvas.past,
    future: canvas.future,
    offsetX: viewport.offsetX,
    offsetY: viewport.offsetY,
    scale: viewport.scale,
  }
}

function restoreStoresFromTab(tab: Tab) {
  useCanvasStore.setState({
    entities: tab.entities,
    nextId: tab.nextId,
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

  markTabSaved: (tabId, entities) =>
    set((state) => ({
      tabs: state.tabs.map((t) =>
        t.id === tabId ? { ...t, savedEntitiesJson: JSON.stringify(entities) } : t,
      ),
    })),

  isTabDirty: (tabId) => {
    const { tabs, activeTabId } = get()
    const tab = tabs.find((t) => t.id === tabId)
    if (!tab) return false

    const currentEntities =
      tabId === activeTabId ? useCanvasStore.getState().entities : tab.entities

    return JSON.stringify(currentEntities) !== tab.savedEntitiesJson
  },
}))