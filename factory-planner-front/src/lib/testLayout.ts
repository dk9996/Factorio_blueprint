import { useCanvasStore, type PlacedEntity } from '../store/canvasStore'
import { useEntityCatalogStore } from '../store/entityCatalogStore'
import { useTabsStore } from '../store/tabsStore'

const GRID = 32
const GAP = GRID // отступ между тестовыми сущностями — 1 тайл

/**
 * Открывает новый пустой чертёж и раскладывает в один ряд все сущности
 * из переданного списка typeId — каждая следующая ставится сразу после
 * предыдущей (по её реальной ширине из каталога) плюс небольшой отступ,
 * чтобы они не наезжали друг на друга. Сущности, которых нет в текущем
 * каталоге (мод выключен, опечатка в typeId), молча пропускаются.
 */
export function placeTestEntitiesRow(typeIds: string[]): void {
  const catalog = useEntityCatalogStore.getState().entities
  if (catalog.length === 0) return // каталог ещё не загружен — раскладывать нечего

  useTabsStore.getState().openBlankTab()

  const toPlace: Omit<PlacedEntity, 'id'>[] = []
  let cursorX = 0

  for (const typeId of typeIds) {
    const entry = catalog.find((e) => e.typeId === typeId)
    if (!entry) continue

    toPlace.push({
      typeId: entry.typeId,
      type: entry.type,
      icon: entry.icon,
      label: entry.label,
      x: cursorX,
      y: 0,
      width: entry.width,
      height: entry.height,
      craftingCategories: entry.craftingCategories ?? undefined,
      moduleSlots: entry.moduleSlots,
      recipe: null,
    })

    cursorX += entry.width + GAP
  }

  if (toPlace.length > 0) {
    useCanvasStore.getState().addEntities(toPlace)
  }
}