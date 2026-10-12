import type { RawWire } from '../../types/blueprint.ts'

// Провода — этап 1 (см. задачу): на импорте просто сохраняем сырые wires
// (ссылаются на ОРИГИНАЛЬНЫЕ entity_number чертежа) + карту
// "оригинальный entity_number -> id нашей PlacedEntity" в метаданных
// вкладки. На экспорте entity_number перенумеровывается с нуля заново
// (см. convert.ts) — тут перекладываем каждую пару на новые номера,
// выкидывая провода, у которых хоть один конец не попал в текущий набор
// экспортируемых сущностей (сущность была пропущена как неизвестная при
// импорте, удалена пользователем, либо не входит в выбранное для
// экспорта подмножество).
export function remapWires(
  rawWires: RawWire[] | undefined,
  entityNumberToPlacedId: Record<number, number> | undefined,
  placedIdToNewEntityNumber: Map<number, number>,
): RawWire[] | undefined {
  if (!rawWires || rawWires.length === 0 || !entityNumberToPlacedId) return undefined

  const result: RawWire[] = []
  for (const [en1, c1, en2, c2] of rawWires) {
    const placedId1 = entityNumberToPlacedId[en1]
    const placedId2 = entityNumberToPlacedId[en2]
    if (placedId1 === undefined || placedId2 === undefined) continue

    const newEn1 = placedIdToNewEntityNumber.get(placedId1)
    const newEn2 = placedIdToNewEntityNumber.get(placedId2)
    if (newEn1 === undefined || newEn2 === undefined) continue

    result.push([newEn1, c1, newEn2, c2])
  }

  return result.length > 0 ? result : undefined
}
