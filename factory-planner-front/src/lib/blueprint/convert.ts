import type { CatalogEntity } from '../../store/entityCatalogStore.ts'
import type { EntityDirection, PlacedEntity } from '../../store/canvasStore.ts'
import type {
  BlueprintBookData,
  BlueprintData,
  RawBlueprintEntity,
  RawBlueprintIcon,
  RawBlueprintTile,
  RawWire,
} from '../../types/blueprint.ts'
import { decodeBlueprintString } from './decode.ts'
import { decodeDirection, encodeDirection } from './direction.ts'
import { buildExtra } from './extra.ts'
import { parseModules, serializeModules } from './modules.ts'
import { parseTopLevel } from './book.ts'
import { DEFAULT_EXPORT_VERSION } from './version.ts'
import { remapWires } from './wires.ts'

const GRID = 32

function isSideways(direction: EntityDirection | undefined): boolean {
  return direction === 90 || direction === 270
}

// Метаданные чертежа, которые не входят в модель PlacedEntity — храним их
// в метаданных вкладки (tabsStore.Tab.blueprintMeta), чтобы не терять при
// повторном экспорте того же чертежа (label/description/icons/tiles/
// wires/version/snap-to-grid).
export interface BlueprintTabMeta {
  label?: string
  description?: string
  icons?: RawBlueprintIcon[]
  tiles?: RawBlueprintTile[]
  schedules?: unknown
  snapToGrid?: { x: number; y: number }
  absoluteSnapping?: boolean
  positionRelativeToGrid?: { x: number; y: number }
  version: number
  wires?: RawWire[]
  // оригинальный entity_number чертежа -> id нашей PlacedEntity (на момент
  // импорта) — нужно только для перенумеровки wires при повторном экспорте.
  entityNumberMap?: Record<number, number>
}

export interface BlueprintImportResult {
  entities: PlacedEntity[]
  nextId: number
  skippedNames: string[]
  meta: BlueprintTabMeta
}

// Один чертёж (data.entities) -> сущности приложения с РЕАЛЬНЫМИ id
// (сквозная нумерация с startId) — такой результат сразу годится для
// новой вкладки (tabsStore.openBlueprintTab). Для варианта "вставить
// призраком" id просто отбрасываются перед buildPlacingGroup.
export function blueprintDataToEntities(
  data: BlueprintData,
  startId: number,
  catalogByTypeId: Map<string, CatalogEntity>,
): BlueprintImportResult {
  const entities: PlacedEntity[] = []
  const skippedNames: string[] = []
  const entityNumberMap: Record<number, number> = {}
  let id = startId

  for (const raw of data.entities ?? []) {
    const meta = catalogByTypeId.get(raw.name)
    if (!meta) {
      skippedNames.push(raw.name)
      continue
    }

    const direction = decodeDirection(raw.direction, data.version)
    const sideways = isSideways(direction)
    const width = sideways ? meta.height : meta.width
    const height = sideways ? meta.width : meta.height
    const isPipe = !!meta.pipeSpriteVariants

    const modules = parseModules(raw.items)
    const extra = buildExtra(raw)

    entities.push({
      id,
      typeId: raw.name,
      type: meta.type,
      icon: meta.icon,
      label: meta.label,
      x: Math.round(raw.position.x * GRID - width / 2),
      y: Math.round(raw.position.y * GRID - height / 2),
      width,
      height,
      direction: isPipe ? undefined : direction,
      recipe: typeof raw.recipe === 'string' ? raw.recipe : undefined,
      craftingCategories: meta.craftingCategories ?? undefined,
      moduleSlots: meta.moduleSlots || undefined,
      modules: modules.length > 0 ? modules : undefined,
      extra,
    })
    entityNumberMap[raw.entity_number] = id
    id++
  }

  return {
    entities,
    nextId: id,
    skippedNames,
    meta: {
      label: data.label,
      description: data.description,
      icons: data.icons,
      tiles: data.tiles,
      schedules: data.schedules,
      snapToGrid: data.snap_to_grid,
      absoluteSnapping: data.absolute_snapping,
      positionRelativeToGrid: data.position_relative_to_grid,
      version: data.version,
      wires: data.wires,
      entityNumberMap,
    },
  }
}

export interface ImportedTab {
  title: string
  result: BlueprintImportResult
}

export interface ImportBlueprintStringResult {
  tabs: ImportedTab[]
  skippedNames: string[]
  skippedBookEntries: string[]
}

// Полный конвейер: строка -> { вкладка на каждый листовой чертёж }.
// Один blueprint -> один элемент tabs. Ошибки формата (версия/base64/
// zlib/JSON/неподдерживаемый тип) бросаются как BlueprintFormatError —
// ловит UI.
export function importBlueprintString(
  rawString: string,
  catalogByTypeId: Map<string, CatalogEntity>,
): ImportBlueprintStringResult {
  const json = decodeBlueprintString(rawString)
  const { blueprints, skippedBookEntries } = parseTopLevel(json)

  const skippedNames: string[] = []
  const tabs: ImportedTab[] = blueprints.map(({ label, data }) => {
    const result = blueprintDataToEntities(data, 1, catalogByTypeId)
    skippedNames.push(...result.skippedNames)
    return { title: label, result }
  })

  return { tabs, skippedNames, skippedBookEntries }
}

export interface BlueprintExportOptions {
  label: string
  catalogByTypeId: Map<string, CatalogEntity>
  // Метаданные исходного чертежа (если экспортируем то, что импортировали
  // целиком, без подмножества-выделения) — сохраняет tiles/wires/version/
  // snap-to-grid/description/icons. Для выделения/новых чертежей не
  // передаём — тогда версия берётся по умолчанию (см. version.ts), а
  // tiles/wires в экспорт не попадают (они относятся к ВСЕЙ исходной
  // вкладке, а не к произвольному подмножеству сущностей).
  meta?: BlueprintTabMeta
}

export interface BlueprintExportResult {
  data: BlueprintData
  version: number
}

// Сущности -> данные одного blueprint. Нормализует позиции (сдвигает
// минимальный тайл к (0,0) — сдвиг всегда целое число тайлов, т.к. все
// x/y кратны GRID, чётность размеров не меняется), перенумеровывает
// entity_number с 1, перекладывает wires на новые номера.
export function entitiesToBlueprintData(
  entities: PlacedEntity[],
  opts: BlueprintExportOptions,
): BlueprintExportResult {
  // Версию чертежа ВСЕГДА пишем как 2.0.x константу (DEFAULT_EXPORT_VERSION),
  // даже если исходный импортированный чертёж был 1.1 — потому что
  // direction мы всегда кодируем в 16-ступенчатом формате 2.0 (см.
  // encodeDirection), а original meta.version с major<2 заставил бы и
  // игру, и наш собственный decodeDirection при повторном импорте читать
  // direction по 8-ступенчатой шкале — вдвое неверно.
  const version = DEFAULT_EXPORT_VERSION

  if (entities.length === 0) {
    return {
      version,
      data: { item: 'blueprint', label: opts.label, entities: [], version },
    }
  }

  const minX = Math.min(...entities.map((e) => e.x))
  const minY = Math.min(...entities.map((e) => e.y))

  const placedIdToNewEntityNumber = new Map<number, number>()
  const rawEntities: RawBlueprintEntity[] = entities.map((e, i) => {
    const entityNumber = i + 1
    placedIdToNewEntityNumber.set(e.id, entityNumber)

    const catalogEntry = opts.catalogByTypeId.get(e.typeId)
    const isPipe = !!catalogEntry?.pipeSpriteVariants
    const x = e.x - minX
    const y = e.y - minY

    const raw: RawBlueprintEntity = {
      ...(e.extra ?? {}),
      entity_number: entityNumber,
      name: e.typeId,
      position: {
        x: (x + e.width / 2) / GRID,
        y: (y + e.height / 2) / GRID,
      },
    }

    // У труб в чертеже направления нет вовсе (симметричны, картинка
    // считается по соседям) — не пишем direction, даже если у нас в
    // модели на сущности завалялось какое-то значение.
    if (!isPipe) {
      const dir = encodeDirection(e.direction)
      if (dir !== undefined) raw.direction = dir
    }
    if (e.recipe) raw.recipe = e.recipe
    const items = serializeModules(e.modules)
    if (items !== undefined) raw.items = items

    return raw
  })

  const tiles = opts.meta?.tiles?.map((t) => ({
    name: t.name,
    position: { x: t.position.x - minX / GRID, y: t.position.y - minY / GRID },
  }))
  const wires = remapWires(opts.meta?.wires, opts.meta?.entityNumberMap, placedIdToNewEntityNumber)

  const data: BlueprintData = {
    item: 'blueprint',
    label: opts.label,
    ...(opts.meta?.description ? { description: opts.meta.description } : {}),
    ...(opts.meta?.icons && opts.meta.icons.length > 0 ? { icons: opts.meta.icons } : {}),
    entities: rawEntities,
    ...(tiles && tiles.length > 0 ? { tiles } : {}),
    ...(wires ? { wires } : {}),
    ...(opts.meta?.schedules ? { schedules: opts.meta.schedules } : {}),
    ...(opts.meta?.snapToGrid ? { snap_to_grid: opts.meta.snapToGrid } : {}),
    ...(opts.meta?.absoluteSnapping !== undefined ? { absolute_snapping: opts.meta.absoluteSnapping } : {}),
    ...(opts.meta?.positionRelativeToGrid
      ? { position_relative_to_grid: opts.meta.positionRelativeToGrid }
      : {}),
    version,
  }

  return { data, version }
}

export interface TabForBookExport {
  title: string
  entities: PlacedEntity[]
  meta?: BlueprintTabMeta
}

// Экспорт всех вкладок разом -> одна blueprint_book, по чертежу на вкладку.
export function tabsToBlueprintBookData(
  tabs: TabForBookExport[],
  catalogByTypeId: Map<string, CatalogEntity>,
  bookLabel: string,
): { data: BlueprintBookData; version: number } {
  const version = DEFAULT_EXPORT_VERSION
  const data: BlueprintBookData = {
    item: 'blueprint-book',
    label: bookLabel,
    active_index: 0,
    blueprints: tabs.map((tab, index) => {
      const { data: blueprintData } = entitiesToBlueprintData(tab.entities, {
        label: tab.title,
        meta: tab.meta,
        catalogByTypeId,
      })
      return { index, blueprint: blueprintData }
    }),
    version,
  }
  return { data, version }
}
