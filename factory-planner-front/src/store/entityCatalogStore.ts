import { create } from 'zustand'
import { entitiesApi } from '../lib/api/entities'
import { resolveAssetUrl } from '../lib/api/client'

export interface PipeSpriteVariant {
  url: string
  frameWidth: number
  frameHeight: number
  shiftX: number
  shiftY: number
  scale: number
  gameShiftX: number
  gameShiftY: number
}

export interface FluidPipeOverlay {
  url: string
  productionType: 'input' | 'output' | 'input-output'
  frameWidth: number
  frameHeight: number
  shiftX: number
  shiftY: number
  scale: number
  gameShiftX: number
  gameShiftY: number
  connectionPositionX: number
  connectionPositionY: number
}

export interface DirectionalSpriteFrame {
  url: string
  frameWidth: number
  frameHeight: number
  shiftX: number
  shiftY: number
  scale: number
  gameShiftX: number
  gameShiftY: number
}

export interface DirectionalSprites {
  north: DirectionalSpriteFrame
  east: DirectionalSpriteFrame
  south: DirectionalSpriteFrame
  west: DirectionalSpriteFrame
}

export interface CatalogEntity {
  typeId: string
  type: string
  label: string
  icon: string
  entitySprite: string | null
  pipeSpriteVariants: Record<string, PipeSpriteVariant> | null
  fluidPipeOverlays: FluidPipeOverlay[] | null
  directionalSprites: DirectionalSprites | null
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
  logisticRadius: number | null
  constructionRadius: number | null
  spriteFrameWidth: number | null
  spriteFrameHeight: number | null
  spriteFrameCount: number | null
  spriteLineLength: number | null
  spriteShiftX: number
  spriteShiftY: number
  spriteScale: number
  spriteGameShiftX: number
  spriteGameShiftY: number
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
    pipeSpriteVariants: e.pipeSpriteVariants
      ? Object.fromEntries(
          Object.entries(e.pipeSpriteVariants).map(([key, variant]) => [
            key,
            { ...variant, url: resolveAssetUrl(variant.url) },
          ]),
        )
      : null,
    fluidPipeOverlays: e.fluidPipeOverlays
      ? e.fluidPipeOverlays.map((overlay) => ({ ...overlay, url: resolveAssetUrl(overlay.url) }))
      : null,
    directionalSprites: e.directionalSprites
      ? {
          north: { ...e.directionalSprites.north, url: resolveAssetUrl(e.directionalSprites.north.url) },
          east: { ...e.directionalSprites.east, url: resolveAssetUrl(e.directionalSprites.east.url) },
          south: { ...e.directionalSprites.south, url: resolveAssetUrl(e.directionalSprites.south.url) },
          west: { ...e.directionalSprites.west, url: resolveAssetUrl(e.directionalSprites.west.url) },
        }
      : null,
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