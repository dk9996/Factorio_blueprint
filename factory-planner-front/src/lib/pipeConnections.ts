import type { PlacedEntity } from '../store/canvasStore'
import type { CatalogEntity } from '../store/entityCatalogStore'

const GRID = 32

// Соответствие "какие стороны N/E/S/W подключены" -> ключ варианта картинки
// трубы (pictures.* в дампе Factorio). N=1,E=2,S=4,W=8 — битовая маска.
// Проверено эмпирически на реальных PNG (см. entity_sprite_service.py,
// PIPE_VARIANT_KEY_BY_SIDES) — ending_left/ending_right единственная пара,
// где имя не совпадает с подключённой стороной.
const PIPE_VARIANT_KEY_BY_MASK: Record<number, string> = {
  0: 'straight_vertical_single',
  1: 'ending_up',
  4: 'ending_down',
  2: 'ending_left',
  8: 'ending_right',
  5: 'straight_vertical',
  10: 'straight_horizontal',
  3: 'corner_up_right',
  9: 'corner_up_left',
  6: 'corner_down_right',
  12: 'corner_down_left',
  11: 't_up',
  14: 't_down',
  13: 't_left',
  7: 't_right',
  15: 'cross',
}

const NEIGHBOR_OFFSETS: [dx: number, dy: number, bit: number][] = [
  [0, -GRID, 1], // N
  [GRID, 0, 2], // E
  [0, GRID, 4], // S
  [-GRID, 0, 8], // W
]

/**
 * Определяет, какой вариант спрайта трубы показывать, по факту
 * присутствия соседних труб/насосов/резервуаров вплотную к каждой из 4
 * сторон (только для 1×1 сущностей — вся текущая поддержка ограничена
 * ими, см. отчёт по задаче). Соседом считается любая ДРУГАЯ размещённая
 * сущность, чей каталожный типа тоже имеет pipeSpriteVariants (то есть
 * тоже труба) и стоит ровно в соседней клетке.
 */
export function computePipeVariantKey(
  entity: PlacedEntity,
  allEntities: PlacedEntity[],
  catalogByTypeId: Map<string, CatalogEntity>,
): string {
  let mask = 0
  for (const [dx, dy, bit] of NEIGHBOR_OFFSETS) {
    const nx = entity.x + dx
    const ny = entity.y + dy
    const connected = allEntities.some((other) => {
      if (other.id === entity.id || other.x !== nx || other.y !== ny) return false
      return !!catalogByTypeId.get(other.typeId)?.pipeSpriteVariants
    })
    if (connected) mask |= bit
  }
  return PIPE_VARIANT_KEY_BY_MASK[mask] ?? 'straight_vertical_single'
}
