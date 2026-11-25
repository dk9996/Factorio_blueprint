import { create } from 'zustand'
import { entitiesApi } from '../lib/api/entities'
import { resolveAssetUrl } from '../lib/api/client'
import type { ModuleDef } from '../lib/modules'
import type { QualityDef } from '../lib/quality'
import type { TileDef } from '../lib/tiles'
import { EMPTY_SIGNALS, type SignalCatalog } from '../lib/circuit/signals'

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

// Подсказки входов/выходов (стрелки) — см. src/lib/ioHints.ts. Все позиции/
// направления здесь — "сырые", в северной ориентации сущности (как
// объявлено в прототипе игры), поворот на entity.direction делает
// computeIoHints на фронте.
export interface IoHintsInserter {
  pickup: [number, number]
  drop: [number, number]
}

export interface IoHintsFluidFilter {
  name: string
  label: string
  icon: string | null
  color: [number, number, number] | null
}

export interface IoHintsFluidPort {
  index: number
  productionType: 'input' | 'output' | 'input-output'
  // Ровно одно из двух не-null (см. бэкенд io_hints_service.py —
  // pumpjack — единственный встреченный случай с positionsByDirection).
  position: [number, number] | null
  positionsByDirection: [
    [number, number],
    [number, number],
    [number, number],
    [number, number],
  ] | null
  direction: number // 0/4/8/12 = N/E/S/W, в северной ориентации сущности
  filter: IoHintsFluidFilter | null
  recipeMatchIndex: number | null
}

export type IoHintsKind =
  | 'inserter'
  | 'belt'
  | 'underground-belt'
  | 'splitter'
  | 'loader'
  | 'crafting'
  | 'mining-drill'
  | 'fixed-fluid'

export interface IoHints {
  kind: IoHintsKind
  inserter: IoHintsInserter | null
  fluidPorts: IoHintsFluidPort[] | null
  dropVector: [number, number] | null
  // Механика подземных конвейеров/труб (см. src/lib/underground.ts) —
  // максимальная дальность (в тайлах, из прототипа — max_distance у
  // underground-belt, max_underground_distance у подземной трубы).
  // undergroundDirection — ТОЛЬКО у труб (pipe-to-ground): "северное"
  // (до поворота сущности) направление подземной стороны (0/4/8/12).
  // У underground-belt null — его ось = собственный entity.direction.
  undergroundMaxDistance: number | null
  undergroundDirection: number | null
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
  ioHints: IoHints | null
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
  // Какие эффекты/категории модулей сущность принимает (lib/modules.ts).
  allowedEffects: string[]
  allowedModuleCategories: string[] | null
  // Схемная сеть: коннекторы проводов по направлениям Factorio (0|4|8|12;
  // точки в тайлах от центра сущности) или null, и макс. длина провода (тайлы).
  connectors: Record<string, { id: string; kind: 'single' | 'input' | 'output'; red: [number, number]; green: [number, number] }[]> | null
  circuitWireMaxDistance: number | null
  craftingSpeed: number | null
  miningSpeed: number | null
  researchingSpeed: number | null
  // Скорость конвейера/погрузчика/сплиттера (тайлов/тик), null у
  // остальных типов — см. src/lib/networks.ts, GroupStatsPanel.tsx.
  speed: number | null
  rocketPartsRequired: number | null
  filterCount: number
  // слоты инвентаря (контейнеры/вагоны/хабы) или null
  inventorySize?: number | null
  // инструменты и звуки программируемой колонки (порядок = id в чертеже)
  speakerInstruments?: { name: string; label: string; notes: { name: string; label: string }[] }[] | null
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
  // Модули профиля (выбор в слотах сущностей, lib/modules.ts).
  modules: ModuleDef[]
  // Качества профиля; пустой массив = у профиля нет качества (UI скрыт).
  qualities: QualityDef[]
  // Плитки профиля (слой под сущностями, lib/tiles.ts).
  tiles: TileDef[]
  // Сигналы для окна выбора сигнала комбинаторов (lib/circuit/signals.ts)
  signals: SignalCatalog
  loading: boolean
  error: string | null
  // Профиль, которым сейчас реально заполнен entities — см.
  // lib/projects/projectSession.ts:openProjectInEditor, которая решает,
  // нужен ли рефетч, сравнивая это поле с проектным content_profile.
  activeProfile: string | null
  fetchEntities: (profile?: string) => Promise<void>
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
    ioHints: e.ioHints
      ? {
          ...e.ioHints,
          fluidPorts: e.ioHints.fluidPorts
            ? e.ioHints.fluidPorts.map((port) => ({
                ...port,
                filter: port.filter && port.filter.icon
                  ? { ...port.filter, icon: resolveAssetUrl(port.filter.icon) }
                  : port.filter,
              }))
            : null,
        }
      : null,
  }))
}

export const useEntityCatalogStore = create<EntityCatalogStore>((set, get) => ({
  entities: [],
  modules: [],
  qualities: [],
  tiles: [],
  signals: EMPTY_SIGNALS,
  loading: false,
  error: null,
  activeProfile: null,

  fetchEntities: async (profile = 'base') => {
    set({ loading: true, error: null })
    try {
      const [entities, modules, qualities, tiles, signals] = await Promise.all([
        entitiesApi.list(profile),
        entitiesApi.modules(profile),
        entitiesApi.qualities(profile),
        entitiesApi.tiles(profile),
        entitiesApi.signals(profile),
      ])
      set({
        entities: withResolvedIcons(entities),
        modules: modules.map((m) => ({ ...m, icon: m.icon ? resolveAssetUrl(m.icon) : null })),
        qualities: qualities.map((q) => ({ ...q, icon: q.icon ? resolveAssetUrl(q.icon) : null })),
        signals: {
          groups: signals.groups.map((g) => ({ ...g, icon: g.icon ? resolveAssetUrl(g.icon) : null })),
          signals: signals.signals.map((x) => ({ ...x, icon: x.icon ? resolveAssetUrl(x.icon) : null })),
        },
        tiles: tiles.map((t) => ({
          ...t,
          icon: t.icon ? resolveAssetUrl(t.icon) : null,
          textureVariants: t.textureVariants
            ? { ...t.textureVariants, urls: t.textureVariants.urls.map(resolveAssetUrl) }
            : null,
        })),
        loading: false,
        activeProfile: profile,
      })
    } catch (err) {
      set({
        loading: false,
        error: err instanceof Error ? err.message : 'Failed to load entity catalog',
      })
    }
  },

  rebuildCatalog: async (forceRedump = false) => {
    const profile = get().activeProfile ?? 'base'
    set({ loading: true, error: null })
    try {
      await entitiesApi.rebuild(profile, forceRedump)
      const [entities, modules, qualities, tiles, signals] = await Promise.all([
        entitiesApi.list(profile),
        entitiesApi.modules(profile),
        entitiesApi.qualities(profile),
        entitiesApi.tiles(profile),
        entitiesApi.signals(profile),
      ])
      set({
        entities: withResolvedIcons(entities),
        modules: modules.map((m) => ({ ...m, icon: m.icon ? resolveAssetUrl(m.icon) : null })),
        qualities: qualities.map((q) => ({ ...q, icon: q.icon ? resolveAssetUrl(q.icon) : null })),
        signals: {
          groups: signals.groups.map((g) => ({ ...g, icon: g.icon ? resolveAssetUrl(g.icon) : null })),
          signals: signals.signals.map((x) => ({ ...x, icon: x.icon ? resolveAssetUrl(x.icon) : null })),
        },
        tiles: tiles.map((t) => ({
          ...t,
          icon: t.icon ? resolveAssetUrl(t.icon) : null,
          textureVariants: t.textureVariants
            ? { ...t.textureVariants, urls: t.textureVariants.urls.map(resolveAssetUrl) }
            : null,
        })),
        loading: false,
        activeProfile: profile,
      })
    } catch (err) {
      set({
        loading: false,
        error: err instanceof Error ? err.message : 'Failed to rebuild catalog',
      })
    }
  },
}))