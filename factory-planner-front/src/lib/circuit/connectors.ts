import type { CatalogEntity } from '../../store/entityCatalogStore'
import type { PlacedEntity } from '../../store/canvasStore'
import type { Wire, WireColor, WireEndpoint } from './types'

// Коннекторы проводов (каталог: connectors по направлениям Factorio
// 0|4|8|12, точки в тайлах от центра сущности) — чистые функции без
// обращения к сторам, чтобы покрыть тестами.

export const GRID = 32

export interface ConnectorDef {
  id: string
  kind: 'single' | 'input' | 'output'
  red: [number, number]
  green: [number, number]
}

export type ConnectorsByDirection = Record<string, ConnectorDef[]>

// direction PlacedEntity (градусы по часовой, undefined = 0) -> ключ каталога
export function directionKey(direction: number | undefined): '0' | '4' | '8' | '12' {
  const deg = (((direction ?? 0) % 360) + 360) % 360
  return (['0', '4', '8', '12'] as const)[Math.round(deg / 90) % 4]
}

type EntityLike = Pick<PlacedEntity, 'x' | 'y' | 'width' | 'height' | 'direction'>
type CatalogLike = { connectors?: CatalogEntity['connectors'] | null; circuitWireMaxDistance?: number | null }

export function connectorsOf(entity: EntityLike, catalog: CatalogLike | undefined): ConnectorDef[] {
  const byDir = catalog?.connectors as ConnectorsByDirection | null | undefined
  if (!byDir) return []
  return byDir[directionKey(entity.direction)] ?? []
}

export function hasCircuitConnectors(catalog: CatalogLike | undefined): boolean {
  return !!catalog?.connectors
}

// Мировая точка (px) подключения провода данного цвета к коннектору.
export function connectorPoint(
  entity: EntityLike,
  catalog: CatalogLike | undefined,
  connectorId: string,
  color: WireColor,
): { x: number; y: number } | null {
  const c = connectorsOf(entity, catalog).find((x) => x.id === connectorId)
  if (!c) return null
  const [dx, dy] = c[color]
  return { x: entity.x + entity.width / 2 + dx * GRID, y: entity.y + entity.height / 2 + dy * GRID }
}

// Ближайший к точке (px) коннектор сущности (для комбинатора — input или
// output). Расстояние — до середины красной/зелёной точек коннектора.
export function nearestConnector(
  entity: EntityLike,
  catalog: CatalogLike | undefined,
  point: { x: number; y: number },
): ConnectorDef | null {
  let best: ConnectorDef | null = null
  let bestDist = Infinity
  for (const c of connectorsOf(entity, catalog)) {
    const mx = entity.x + entity.width / 2 + ((c.red[0] + c.green[0]) / 2) * GRID
    const my = entity.y + entity.height / 2 + ((c.red[1] + c.green[1]) / 2) * GRID
    const d = Math.hypot(mx - point.x, my - point.y)
    if (d < bestDist) {
      bestDist = d
      best = c
    }
  }
  return best
}

export interface WireCheck {
  ok: boolean
  reason?: 'too-far' | 'same-entity' | 'no-connector' | 'duplicate'
  // расстояние между точками и допустимое, в тайлах
  distance?: number
  limit?: number
}

// Можно ли провести провод между двумя коннекторами: разные сущности,
// расстояние между точками подключения (тайлы) <= min(circuit_wire_max_distance
// двух сущностей).
export function checkWire(
  a: { entity: EntityLike; catalog: CatalogLike | undefined; connector: string },
  b: { entity: EntityLike; catalog: CatalogLike | undefined; connector: string },
  color: WireColor,
  sameEntity: boolean,
): WireCheck {
  if (sameEntity) return { ok: false, reason: 'same-entity' }
  const pa = connectorPoint(a.entity, a.catalog, a.connector, color)
  const pb = connectorPoint(b.entity, b.catalog, b.connector, color)
  if (!pa || !pb) return { ok: false, reason: 'no-connector' }
  const limit = Math.min(a.catalog?.circuitWireMaxDistance ?? 0, b.catalog?.circuitWireMaxDistance ?? 0)
  const distance = Math.hypot(pa.x - pb.x, pa.y - pb.y) / GRID
  // небольшой допуск на округление точек
  return distance <= limit + 1e-6 ? { ok: true, distance, limit } : { ok: false, reason: 'too-far', distance, limit }
}

export function sameEndpoint(a: WireEndpoint, b: WireEndpoint): boolean {
  return a.entityId === b.entityId && a.connector === b.connector
}

// Провод того же цвета между той же парой коннекторов (в любом порядке концов).
export function findWire(wires: Wire[], color: WireColor, a: WireEndpoint, b: WireEndpoint): Wire | undefined {
  return wires.find(
    (w) =>
      w.color === color &&
      ((sameEndpoint(w.a, a) && sameEndpoint(w.b, b)) || (sameEndpoint(w.a, b) && sameEndpoint(w.b, a))),
  )
}

let wireCounter = 0
export function newWireId(): string {
  wireCounter += 1
  return `w${Date.now().toString(36)}${wireCounter.toString(36)}${Math.random().toString(36).slice(2, 5)}`
}

// Провода, у которых оба конца среди ids (внутренние для группы).
export function internalWires(wires: Wire[], ids: Set<number>): Wire[] {
  return wires.filter((w) => ids.has(w.a.entityId) && ids.has(w.b.entityId))
}

export function withoutEntities(wires: Wire[], ids: Set<number>): Wire[] {
  return wires.filter((w) => !ids.has(w.a.entityId) && !ids.has(w.b.entityId))
}
