import type { CatalogEntity } from '../../store/entityCatalogStore'
import type { PlacedEntity } from '../../store/canvasStore'
import type { ProjectData } from '../api/projects'
import type { BlueprintTabMeta, TabForBookExport } from '../blueprint/convert'
import { entitiesToBlueprintData, tabsToBlueprintBookData } from '../blueprint/convert'
import { encodeBlueprintString } from '../blueprint/encode'

/**
 * Строка чертежа из данных проекта (как они лежат на бэкенде), БЕЗ захода
 * в редактор — для кнопки "Экспортировать" в меню карточки (см.
 * ProjectCardMenu.tsx). Один чертёж, если у проекта одна непустая вкладка;
 * иначе — книга (та же логика, что и "Все вкладки" в ImportExportPanel).
 */
export function exportProjectDataAsString(
  data: ProjectData,
  catalogByTypeId: Map<string, CatalogEntity>,
  projectName: string,
  includeQuality = false,
): string {
  const tabs: TabForBookExport[] = data.tabs
    .map((t) => ({
      title: t.title,
      entities: (t.entities as PlacedEntity[]) ?? [],
      meta: t.blueprintMeta as BlueprintTabMeta | undefined,
      tiles: t.tiles ?? {},
      wires: (t.wires as TabForBookExport['wires']) ?? [],
    }))
    .filter((t) => t.entities.length > 0 || Object.keys(t.tiles).length > 0)

  if (tabs.length === 0) {
    throw new Error('В проекте нет ни одной сущности — нечего экспортировать')
  }

  if (tabs.length === 1) {
    const { data: blueprintData } = entitiesToBlueprintData(tabs[0].entities, {
      label: tabs[0].meta?.label ?? tabs[0].title ?? projectName,
      meta: tabs[0].meta,
      catalogByTypeId,
      includeQuality,
      tiles: tabs[0].tiles,
      wires: tabs[0].wires,
    })
    return encodeBlueprintString({ blueprint: blueprintData })
  }

  const { data: bookData } = tabsToBlueprintBookData(tabs, catalogByTypeId, projectName, includeQuality)
  return encodeBlueprintString({ blueprint_book: bookData })
}
