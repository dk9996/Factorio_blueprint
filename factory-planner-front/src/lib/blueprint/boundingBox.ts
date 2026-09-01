import type { PlacedEntity } from '../../store/canvasStore'

export function normalizeEntities(entities: PlacedEntity[]): {
  entities: PlacedEntity[]
  width: number
  height: number
} {
  if (entities.length === 0) {
    return { entities: [], width: 0, height: 0 }
  }

  const minX = Math.min(...entities.map((e) => e.x))
  const minY = Math.min(...entities.map((e) => e.y))
  const maxX = Math.max(...entities.map((e) => e.x + e.width))
  const maxY = Math.max(...entities.map((e) => e.y + e.height))

  const GRID = 32
  const normalized = entities.map((e) => ({
    ...e,
    x: e.x - minX,
    y: e.y - minY,
  }))

  return {
    entities: normalized,
    width: Math.ceil((maxX - minX) / GRID),
    height: Math.ceil((maxY - minY) / GRID),
  }
}