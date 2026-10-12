import type { PlacedEntity } from '../store/canvasStore'
import type { CatalogEntity, IoHintsFluidPort } from '../store/entityCatalogStore'
import { normalizeDirection, rotateVector, DIR_UNITS_TO_DEG, type CardinalDeg } from './ioHints'

const GRID = 32

export type NetworkKind = 'belt' | 'pipe'
export type NetworkEndpointRole = 'in' | 'out' | 'end'

export interface NetworkEndpoint {
  entityId: number
  role: NetworkEndpointRole
  direction: CardinalDeg
}

export interface Network {
  id: string
  kind: NetworkKind
  ids: number[]
  endpoints: NetworkEndpoint[]
  connectedMachines: number[]
}

export interface NetworksResult {
  groupOf: Map<number, string>
  groups: Map<string, Network>
  // `${machineEntityId}:${portIndex}` -> id сетки трубы, занявшей этот
  // порт — используется и для статистики группы (какая жидкость течёт),
  // и в ioHints.ts (подавить стрелку занятого порта).
  connectedPorts: Map<string, string>
}

export const EMPTY_NETWORKS: NetworksResult = {
  groupOf: new Map(),
  groups: new Map(),
  connectedPorts: new Map(),
}

function tileKey(tx: number, ty: number): string {
  return `${tx},${ty}`
}

class UnionFind {
  private parent = new Map<number, number>()

  find(x: number): number {
    if (!this.parent.has(x)) this.parent.set(x, x)
    let root = x
    while (this.parent.get(root) !== root) root = this.parent.get(root)!
    let cur = x
    while (this.parent.get(cur) !== root) {
      const next = this.parent.get(cur)!
      this.parent.set(cur, root)
      cur = next
    }
    return root
  }

  union(a: number, b: number): void {
    const ra = this.find(a)
    const rb = this.find(b)
    if (ra !== rb) this.parent.set(ra, rb)
  }
}

// Направление -> единичный вектор смещения в тайлах (x вправо, y вниз,
// 0=север/вверх, по часовой — та же конвенция, что и везде в ioHints.ts).
function unitVector(dir: CardinalDeg): [number, number] {
  switch (dir) {
    case 0:
      return [0, -1]
    case 90:
      return [1, 0]
    case 180:
      return [0, 1]
    default:
      return [-1, 0]
  }
}

// Битовая маска сторон трубы (как в pipeConnections.ts) — N=1,E=2,S=4,W=8.
const PIPE_NEIGHBOR_OFFSETS: [dx: number, dy: number, bit: number][] = [
  [0, -1, 1],
  [1, 0, 2],
  [0, 1, 4],
  [-1, 0, 8],
]
const PIPE_OPEN_DIRECTION: Record<number, CardinalDeg> = { 1: 180, 2: 270, 4: 0, 8: 90 }

/**
 * Внешняя (соседняя снаружи) клетка порта жидкостного fluid_box машины —
 * та же геометрия, что строит точку порта для отрисовки в ioHints.ts
 * (см. fluidPortPrimitive), плюс ещё один шаг на тайл наружу в направлении,
 * куда порт "смотрит" (facingDeg) — именно там в игре должна стоять
 * подключаемая труба. Координаты — в мировых тайлах (entity.x/y уже
 * выровнены по сетке 32px, см. GRID в canvasStore.ts).
 */
function portExternalTile(
  entity: PlacedEntity,
  port: IoHintsFluidPort,
): { tx: number; ty: number } | null {
  const direction = entity.direction ?? 0
  const entityStep = Math.round(normalizeDirection(direction) / 90)

  let rawX: number
  let rawY: number
  let facingDeg: CardinalDeg
  if (port.positionsByDirection) {
    const [tx, ty] = port.positionsByDirection[entityStep]
    rawX = entity.width / 2 + tx * GRID
    rawY = entity.height / 2 + ty * GRID
    facingDeg = DIR_UNITS_TO_DEG[port.direction] ?? 0
  } else if (port.position) {
    const [rx, ry] = rotateVector(port.position, direction)
    rawX = entity.width / 2 + rx * GRID
    rawY = entity.height / 2 + ry * GRID
    facingDeg = normalizeDirection((DIR_UNITS_TO_DEG[port.direction] ?? 0) + direction)
  } else {
    return null
  }

  const [fx, fy] = unitVector(facingDeg)
  const worldX = entity.x + rawX + fx * GRID
  const worldY = entity.y + rawY + fy * GRID
  return { tx: Math.floor(worldX / GRID), ty: Math.floor(worldY / GRID) }
}

/**
 * Группирует связанные конвейеры и трубы в сети (union-find по
 * пространственному хэшу занятых клеток, O(n)) — см. отчёт по задаче
 * для точных правил связи. Машины в группы НЕ входят, но фиксируются в
 * connectedMachines той трубной сети, чей порт они подключают (п.
 * "Трубы и машины").
 *
 * Чистая функция — ничего не читает кроме аргументов, ничего не пишет
 * в сторы. Раздача результата — networksStore.ts.
 */
export function computeNetworks(
  entities: PlacedEntity[],
  catalogByTypeId: Map<string, CatalogEntity>,
): NetworksResult {
  const isPipeLike = (e: PlacedEntity) => !!catalogByTypeId.get(e.typeId)?.pipeSpriteVariants
  const isBelt = (e: PlacedEntity) => catalogByTypeId.get(e.typeId)?.ioHints?.kind === 'belt'

  const beltEntities = entities.filter(isBelt)
  const pipeEntities = entities.filter(isPipeLike)
  if (beltEntities.length === 0 && pipeEntities.length === 0) return EMPTY_NETWORKS

  const entityById = new Map(entities.map((e) => [e.id, e]))

  // Занятые клетки — по ВСЕМ сущностям (нужно и для соседства труб/лент,
  // и для проверки "труба ли стоит снаружи порта машины"), не только по
  // группируемым типам.
  const occupiedTiles = new Map<string, number>()
  for (const e of entities) {
    const tilesW = Math.round(e.width / GRID)
    const tilesH = Math.round(e.height / GRID)
    const tx0 = Math.round(e.x / GRID)
    const ty0 = Math.round(e.y / GRID)
    for (let dx = 0; dx < tilesW; dx++) {
      for (let dy = 0; dy < tilesH; dy++) {
        occupiedTiles.set(tileKey(tx0 + dx, ty0 + dy), e.id)
      }
    }
  }

  const uf = new UnionFind()

  // --- Конвейеры: направленные рёбра (A кормит B, если B — прямо перед
  // A по direction A, и B не смотрит на A лоб в лоб) ---
  const beltIncomingCount = new Map<number, number>()
  const beltHasOutgoing = new Set<number>()
  for (const belt of beltEntities) {
    uf.find(belt.id) // регистрируем даже изолированные — см. комментарий ниже про groupMembers
    const dir = normalizeDirection(belt.direction)
    const [fx, fy] = unitVector(dir)
    const tx = Math.round(belt.x / GRID) + fx
    const ty = Math.round(belt.y / GRID) + fy
    const targetId = occupiedTiles.get(tileKey(tx, ty))
    if (targetId === undefined || targetId === belt.id) continue
    const target = entityById.get(targetId)
    if (!target || !isBelt(target)) continue
    const targetDir = normalizeDirection(target.direction)
    const opposite = ((dir + 180) % 360) as CardinalDeg
    if (targetDir === opposite) continue // лоб в лоб — не связаны
    uf.union(belt.id, targetId)
    beltHasOutgoing.add(belt.id)
    beltIncomingCount.set(targetId, (beltIncomingCount.get(targetId) ?? 0) + 1)
  }

  // --- Трубы: соседство по 4 сторонам всегда соединяет (как в игре) ---
  const pipeConnectedMask = new Map<number, number>()
  for (const pipe of pipeEntities) {
    uf.find(pipe.id)
    let mask = 0
    const tx0 = Math.round(pipe.x / GRID)
    const ty0 = Math.round(pipe.y / GRID)
    for (const [dx, dy, bit] of PIPE_NEIGHBOR_OFFSETS) {
      const nId = occupiedTiles.get(tileKey(tx0 + dx, ty0 + dy))
      if (nId === undefined || nId === pipe.id) continue
      const n = entityById.get(nId)
      if (n && isPipeLike(n)) {
        mask |= bit
        uf.union(pipe.id, nId)
      }
    }
    pipeConnectedMask.set(pipe.id, mask)
  }

  // --- Собираем группы по корню union-find (только ленты/трубы — машины
  // туда никогда не попадают, см. докстринг) ---
  const groupMembers = new Map<number, number[]>()
  for (const e of [...beltEntities, ...pipeEntities]) {
    const root = uf.find(e.id)
    const list = groupMembers.get(root)
    if (list) list.push(e.id)
    else groupMembers.set(root, [e.id])
  }

  const groupOf = new Map<number, string>()
  const groups = new Map<string, Network>()
  for (const [root, ids] of groupMembers) {
    const groupId = `g${root}`
    const first = entityById.get(ids[0])!
    const kind: NetworkKind = isBelt(first) ? 'belt' : 'pipe'
    for (const id of ids) groupOf.set(id, groupId)
    groups.set(groupId, { id: groupId, kind, ids, endpoints: [], connectedMachines: [] })
  }

  // --- Концы: ленты — нет входящих/исходящих рёбер; трубы — степень 1 ---
  for (const belt of beltEntities) {
    const group = groups.get(groupOf.get(belt.id)!)!
    const dir = normalizeDirection(belt.direction)
    if ((beltIncomingCount.get(belt.id) ?? 0) === 0) {
      group.endpoints.push({ entityId: belt.id, role: 'in', direction: dir })
    }
    if (!beltHasOutgoing.has(belt.id)) {
      group.endpoints.push({ entityId: belt.id, role: 'out', direction: dir })
    }
  }

  for (const pipe of pipeEntities) {
    const mask = pipeConnectedMask.get(pipe.id)!
    // Степень 1 — ровно один бит установлен (mask — степень двойки).
    if (mask !== 0 && (mask & (mask - 1)) === 0) {
      const group = groups.get(groupOf.get(pipe.id)!)!
      group.endpoints.push({ entityId: pipe.id, role: 'end', direction: PIPE_OPEN_DIRECTION[mask] })
    }
  }

  // --- Машины: порт считается занятым, если снаружи него (с учётом
  // направления машины) стоит труба — труба НЕ входит в connectedMachines,
  // а машина входит в connectedMachines той сети труб ---
  const connectedPorts = new Map<string, string>()
  for (const e of entities) {
    if (isPipeLike(e)) continue // трубы сами по себе не "машины" в этом смысле
    const ports = catalogByTypeId.get(e.typeId)?.ioHints?.fluidPorts
    if (!ports || ports.length === 0) continue
    for (const port of ports) {
      const ext = portExternalTile(e, port)
      if (!ext) continue
      const neighborId = occupiedTiles.get(tileKey(ext.tx, ext.ty))
      if (neighborId === undefined) continue
      const neighbor = entityById.get(neighborId)
      if (!neighbor || !isPipeLike(neighbor)) continue
      const pipeGroupId = groupOf.get(neighborId)
      if (!pipeGroupId) continue
      const group = groups.get(pipeGroupId)!
      if (!group.connectedMachines.includes(e.id)) group.connectedMachines.push(e.id)
      connectedPorts.set(`${e.id}:${port.index}`, pipeGroupId)
    }
  }

  return { groupOf, groups, connectedPorts }
}
