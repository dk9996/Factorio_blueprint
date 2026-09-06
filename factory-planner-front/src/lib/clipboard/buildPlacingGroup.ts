import type { PlacedEntity, PlacingGroupItem } from '../../store/canvasStore'

export function buildPlacingGroup(
  items: Omit<PlacedEntity, 'id'>[],
): PlacingGroupItem[] {
  if (items.length === 0) return []
  const minX = Math.min(...items.map((i) => i.x))
  const minY = Math.min(...items.map((i) => i.y))
  return items.map((i) => ({
    typeId: i.typeId,
    type: i.type,
    icon: i.icon,
    label: i.label,
    width: i.width,
    height: i.height,
    offsetX: i.x - minX,
    offsetY: i.y - minY,
    craftingCategories: i.craftingCategories,
    moduleSlots: i.moduleSlots,
    recipe: i.recipe,        // ← добавить
  }))
}

// та же логика, но для готовых PlacedEntity (например, из сохранённого чертежа)
export function buildPlacingGroupFromEntities(
  entities: PlacedEntity[],
): PlacingGroupItem[] {
  return buildPlacingGroup(entities)
}