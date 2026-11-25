import type { CatalogEntity } from '../store/entityCatalogStore'
import type { TileDef } from './tiles'

export const TILE_CATEGORY_ID = 'floor-tiles'

// Плитки профиля в виде "сущностей каталога" — чтобы палитра и выбор в
// хотбар показывали их обычной категорией «Плитки» (type === 'tile'
// отличает их при постановке: это не сущность, а слой под сущностями, см.
// hooks/useTilePainting.ts).
export function tilePseudoEntities(tiles: TileDef[]): CatalogEntity[] {
  return tiles.map((t, i) => ({
    typeId: t.name,
    type: 'tile',
    label: t.localizedName,
    icon: t.icon ?? '',
    entitySprite: null,
    category: t.category,
    categoryId: TILE_CATEGORY_ID,
    categoryOrder: 'zzzz',
    categoryIcon: tiles[0]?.icon ?? '',
    subgroup: 'tiles',
    subgroupOrder: 'a',
    itemOrder: String(i).padStart(4, '0'),
    width: 32,
    height: 32,
    craftingCategories: null,
    moduleSlots: 0,
    allowedEffects: [],
    allowedModuleCategories: null,
    ioHints: null,
    pipeSpriteVariants: null,
    fluidPipeOverlays: null,
    directionalSprites: null,
  })) as unknown as CatalogEntity[]
}
