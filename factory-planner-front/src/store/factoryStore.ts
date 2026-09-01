import { create } from 'zustand'
import type { PlacedEntity } from './canvasStore'
import { factoriesApi } from '../lib/api/factories'

export interface Factory {
  id: string
  name: string
  folder: string
  entities: PlacedEntity[]
  status: 'ok' | 'warn' | 'bad'
  width: number
  height: number
  icon: string
  previewIcons: string[]
}

interface FactoryStore {
  factories: Factory[]
  activeId: string | null
  loading: boolean
  error: string | null

  fetchFactories: () => Promise<void>
  setActive: (id: string) => void
  createFactory: (data: {
    name: string
    folder: string
    width: number
    height: number
    icon: string
    previewIcons?: string[]
    entities?: PlacedEntity[]
  }) => Promise<void>
  updateFactory: (id: string, data: Partial<Pick<Factory, 'name' | 'folder' | 'status' | 'entities'>>) => Promise<void>
  deleteFactory: (id: string) => Promise<void>
}

export const useFactoryStore = create<FactoryStore>((set, get) => ({
  factories: [],
  activeId: null,
  loading: false,
  error: null,

  fetchFactories: async () => {
    set({ loading: true, error: null })
    try {
      const factories = await factoriesApi.list()
      set({
        factories,
        loading: false,
        activeId: get().activeId ?? factories[0]?.id ?? null,
      })
    } catch (err) {
      set({ loading: false, error: err instanceof Error ? err.message : 'Failed to load factories' })
    }
  },

  setActive: (id) => set({ activeId: id }),

  createFactory: async (data) => {
    const created = await factoriesApi.create({
      name: data.name,
      folder: data.folder,
      width: data.width,
      height: data.height,
      icon: data.icon,
      previewIcons: data.previewIcons ?? [],
      entities: data.entities ?? [],
    })
    set((state) => ({ factories: [...state.factories, created] }))
  },

  updateFactory: async (id, data) => {
    const updated = await factoriesApi.update(id, data)
    set((state) => ({
      factories: state.factories.map((f) => (f.id === id ? updated : f)),
    }))
  },

  deleteFactory: async (id) => {
    await factoriesApi.remove(id)
    set((state) => ({
      factories: state.factories.filter((f) => f.id !== id),
      activeId: state.activeId === id ? (state.factories[0]?.id ?? null) : state.activeId,
    }))
  },
}))