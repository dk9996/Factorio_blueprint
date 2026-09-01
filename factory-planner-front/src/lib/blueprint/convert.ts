import type { PlacedEntity } from '../../store/canvasStore'
import type { BlueprintEntity, BlueprintWrapper } from '../../types/blueprint'

const GRID = 32 // px на одну игровую клетку на нашем canvas

// PlacedEntity -> формат Factorio (координаты в клетках, от угла к центру сущности)
export function entitiesToBlueprint(
  entities: PlacedEntity[],
  label = 'Экспорт из Factory Planner',
): BlueprintWrapper {
  const bpEntities: BlueprintEntity[] = entities.map((e, i) => ({
    entity_number: i + 1,
    name: e.typeId,
    position: {
      x: e.x / GRID + e.width / GRID / 2,
      y: e.y / GRID + e.height / GRID / 2,
    },
  }))

  return {
    blueprint: {
      item: 'blueprint',
      label,
      entities: bpEntities,
      version: 281479276527616, // стандартный version-код текущего формата Factorio
    },
  }
}

// формат Factorio -> PlacedEntity (нужен каталог, чтобы знать icon/width/height по typeId)
export function blueprintToEntities(
  wrapper: BlueprintWrapper,
  resolveMeta: (typeId: string) => { icon: string; width: number; height: number } | null,
  startId: number,
): { entities: Omit<PlacedEntity, 'id'>[]; usedIds: number } {
  const result: Omit<PlacedEntity, 'id'>[] = []
  let id = startId

  for (const be of wrapper.blueprint.entities) {
    const meta = resolveMeta(be.name)
    if (!meta) continue // неизвестная сущность (например, из мода, которого нет в каталоге) — пропускаем

    result.push({
      typeId: be.name,
      icon: meta.icon,
      label: be.name,
      x: Math.round((be.position.x - meta.width / GRID / 2) * GRID),
      y: Math.round((be.position.y - meta.height / GRID / 2) * GRID),
      width: meta.width,
      height: meta.height,
    })
    id++
  }

  return { entities: result, usedIds: id }
}