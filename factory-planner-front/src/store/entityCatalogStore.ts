import { create } from 'zustand'
import { entitiesApi } from '../lib/api/entities'
import { resolveAssetUrl } from '../lib/api/client'

export interface CatalogEntity {
  typeId: string
  type: string
  label: string
  icon: string
  entitySprite: string | null
  category: string
  categoryId: string
  categoryOrder: string
  subgroup: string
  subgroupOrder: string
  itemOrder: string
  categoryIcon: string
  width: number
  height: number
  craftingCategories: string[] | null
  moduleSlots: number
  craftingSpeed: number | null
  miningSpeed: number | null
  researchingSpeed: number | null
  rocketPartsRequired: number | null
  filterCount: number
  bulkInserterConfig: boolean
}

interface EntityCatalogStore {
  entities: CatalogEntity[]
  loading: boolean
  error: string | null
  fetchEntities: () => Promise<void>
  rebuildCatalog: (forceRedump?: boolean) => Promise<void>
}

function withResolvedIcons(entities: CatalogEntity[]): CatalogEntity[] {
  return entities.map((e) => ({
    ...e,
    icon: resolveAssetUrl(e.icon),
    categoryIcon: resolveAssetUrl(e.categoryIcon),
    entitySprite: e.entitySprite ? resolveAssetUrl(e.entitySprite) : null,
  }))
}

export const useEntityCatalogStore = create<EntityCatalogStore>((set) => ({
  entities: [],
  loading: false,
  error: null,

  fetchEntities: async () => {
    set({ loading: true, error: null })
    try {
      const entities = await entitiesApi.list()
      set({ entities: withResolvedIcons(entities), loading: false })
    } catch (err) {
      set({
        loading: false,
        error: err instanceof Error ? err.message : 'Failed to load entity catalog',
      })
    }
  },

  rebuildCatalog: async (forceRedump = false) => {
    set({ loading: true, error: null })
    try {
      await entitiesApi.rebuild(forceRedump)
      const entities = await entitiesApi.list()
      set({ entities: withResolvedIcons(entities), loading: false })
    } catch (err) {
      set({
        loading: false,
        error: err instanceof Error ? err.message : 'Failed to rebuild catalog',
      })
    }
  },
}))