import type { RawBlueprintEntity } from '../../types/blueprint.ts'

// Поля сущности чертежа, которые разобраны в собственные поля PlacedEntity
// (entity_number/name/position/direction — конвертацией позиции/направления,
// recipe — PlacedEntity.recipe, items — PlacedEntity.modules). Всё, что
// осталось (type у underground-belt/loader "input"/"output", filters,
// control_behavior, quality сущности, neighbours и т.д.) — сохраняем как
// есть в PlacedEntity.extra и пишем обратно при экспорте без изменений,
// чтобы чертёж из игры не терял настройки после импорта-экспорта.
const PARSED_KEYS = new Set(['entity_number', 'name', 'position', 'direction', 'recipe', 'items'])

export function buildExtra(raw: RawBlueprintEntity): Record<string, unknown> | undefined {
  const extra: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(raw)) {
    if (PARSED_KEYS.has(key)) continue
    extra[key] = value
  }
  return Object.keys(extra).length > 0 ? extra : undefined
}
