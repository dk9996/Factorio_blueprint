import type { EntityDirection, PlacedEntity } from '../store/canvasStore'
import type { CatalogEntity } from '../store/entityCatalogStore'
import { DIR_UNITS_TO_DEG, normalizeDirection, rotateVector, type CardinalDeg } from './ioHints'

const GRID = 32

// "Северный" (до поворота) локальный вектор "вперёд" — см. ту же
// конвенцию в ioHints.ts/networks.ts: x вправо, y вниз, 0=север.
function forwardVector(direction: EntityDirection | undefined): [number, number] {
  return rotateVector([0, -1], direction ?? 0)
}

interface AxisInfo {
  maxDistance: number
  isBelt: boolean
  // Направление, которое ДОЛЖЕН иметь партнёр того же typeId, чтобы
  // пара считалась связанной: у конвейеров — то же направление (оба
  // смотрят в сторону движения предметов), у труб — противоположное
  // (подземные стороны смотрят друг на друга, см. отчёт по задаче —
  // при одинаковом ЛОКАЛЬНОМ смещении подземной стороны на обеих
  // сущностях одного typeId это сводится ровно к "направления
  // противоположны", без дополнительного учёта самого смещения).
  requiredPartnerDirection: CardinalDeg
  // Куда ФИЗИЧЕСКИ уходит тоннель от этой сущности — у конвейеров это её
  // собственный entity.direction (лента тянется строго вперёд по ходу
  // движения), у труб — ПРОТИВОПОЛОЖНОЕ направление (видимый патрубок
  // trubы смотрит в одну сторону, а подземная часть — в другую; взято
  // из catalogEntry.ioHints.undergroundDirection, локальное смещение,
  // повёрнутое на entity.direction — та же конвенция, что и у остальных
  // "северных" координат ioHints.ts). Используется ТОЛЬКО для проверки
  // "партнёр физически со стороны тоннеля" (см. isAheadAlongTunnel) — в
  // findUndergroundPartner не участвует: там роль (вход/выход) заранее
  // не зафиксирована, можно искать партнёра в любую сторону по оси.
  tunnelDirection: CardinalDeg
}

function getAxisInfo(
  typeId: string,
  direction: EntityDirection | undefined,
  catalogByTypeId: Map<string, CatalogEntity>,
): AxisInfo | null {
  const catalogEntry = catalogByTypeId.get(typeId)
  const maxDistance = catalogEntry?.ioHints?.undergroundMaxDistance
  if (maxDistance == null) return null
  const isBelt = catalogEntry?.ioHints?.kind === 'underground-belt'
  const dir = normalizeDirection(direction)
  const requiredPartnerDirection = isBelt ? dir : (((dir + 180) % 360) as CardinalDeg)
  const tunnelDirection = isBelt
    ? dir
    : normalizeDirection((DIR_UNITS_TO_DEG[catalogEntry?.ioHints?.undergroundDirection ?? 8] ?? 180) + dir)
  return { maxDistance, isBelt, requiredPartnerDirection, tunnelDirection }
}

// Строго ли point лежит со стороны тоннеля anchor'а (а не сзади) — во
// время двухшаговой постановки роль входа уже ЗАФИКСИРОВАНА (не
// определяется геометрией, как в findUndergroundPartner), поэтому выход
// обязан физически лежать именно там, куда уходит тоннель входа, а не с
// противоположной стороны — иначе тоннель физически не может его
// достать, даже если ось/направление/дальность формально совпадают.
function isAheadAlongTunnel(
  tunnelDir: CardinalDeg,
  fromTileX: number,
  fromTileY: number,
  toTileX: number,
  toTileY: number,
): boolean {
  if (tunnelDir === 0) return toTileY < fromTileY
  if (tunnelDir === 180) return toTileY > fromTileY
  if (tunnelDir === 90) return toTileX > fromTileX
  return toTileX < fromTileX // 270
}

// Тайловая дистанция вдоль оси entity-направления между двумя точками,
// или null, если точка вне оси (не совпадает по перпендикулярной
// координате). dir уже нормализован (normalizeDirection).
function axisDistance(
  dir: CardinalDeg,
  fromTileX: number,
  fromTileY: number,
  toTileX: number,
  toTileY: number,
): number | null {
  if (dir === 0 || dir === 180) {
    if (toTileX !== fromTileX) return null
    return Math.abs(toTileY - fromTileY)
  }
  if (toTileY !== fromTileY) return null
  return Math.abs(toTileX - fromTileX)
}

// Ближайший совместимый партнёр (тот же typeId, одна ось, расстояние в
// пределах дальности, направление по правилу requiredPartnerDirection) —
// ЧИСТО геометрически, без учёта extra.type (роль вход/выход не влияет
// на то, связаны ли сущности). "Берётся ближайший" — других подземных
// сущностей на оси как препятствие НЕ учитываем (см. отчёт по задаче,
// это этап 2); в плотных цепочках (вход-выход-вход-выход вплотную)
// результат может не совпасть с игрой на 100% — осознанное упрощение.
export function findUndergroundPartner(
  entity: PlacedEntity,
  entities: PlacedEntity[],
  catalogByTypeId: Map<string, CatalogEntity>,
): PlacedEntity | null {
  const axis = getAxisInfo(entity.typeId, entity.direction, catalogByTypeId)
  if (!axis) return null

  const dir = normalizeDirection(entity.direction)
  const tileX = Math.round(entity.x / GRID)
  const tileY = Math.round(entity.y / GRID)

  let best: PlacedEntity | null = null
  let bestDist = Infinity

  for (const other of entities) {
    if (other.id === entity.id || other.typeId !== entity.typeId) continue
    if (normalizeDirection(other.direction) !== axis.requiredPartnerDirection) continue

    const otherTileX = Math.round(other.x / GRID)
    const otherTileY = Math.round(other.y / GRID)
    const dist = axisDistance(dir, tileX, tileY, otherTileX, otherTileY)
    if (dist === null || dist === 0 || dist > axis.maxDistance) continue

    if (dist < bestDist) {
      bestDist = dist
      best = other
    }
  }

  return best
}

// Свободен ли кандидат — нет ли у НЕГО самого уже связанного партнёра
// (см. "берётся ближайший свободный партнёр" в задаче).
function isFree(
  candidate: PlacedEntity,
  entities: PlacedEntity[],
  catalogByTypeId: Map<string, CatalogEntity>,
): boolean {
  return findUndergroundPartner(candidate, entities, catalogByTypeId) === null
}

// Автоопределение input/output для ОДИНОЧНОЙ постановки подземного
// конвейера ВНЕ двухшагового режима (Q-подбор, вставка из буфера —
// см. canvasStore.placing.undergroundAutoCycle). Только для конвейеров
// (kind==='underground-belt') — у труб нет понятия "тип" в формате
// чертежа, вызывать для них бессмысленно (вернёт 'input' по умолчанию,
// вызывающий код просто не должен использовать результат).
export function autoDetectUndergroundType(
  pending: { x: number; y: number; direction: EntityDirection | undefined; typeId: string },
  entities: PlacedEntity[],
  catalogByTypeId: Map<string, CatalogEntity>,
): 'input' | 'output' {
  const axis = getAxisInfo(pending.typeId, pending.direction, catalogByTypeId)
  if (!axis || !axis.isBelt) return 'input'

  const dir = normalizeDirection(pending.direction)
  const tileX = Math.round(pending.x / GRID)
  const tileY = Math.round(pending.y / GRID)
  const [fx, fy] = forwardVector(pending.direction)

  function hasFreeRoleAlongAxis(role: 'input' | 'output', dx: number, dy: number): boolean {
    for (let d = 1; d <= axis!.maxDistance; d++) {
      const tx = tileX + dx * d
      const ty = tileY + dy * d
      const candidate = entities.find(
        (e) => e.typeId === pending.typeId && Math.round(e.x / GRID) === tx && Math.round(e.y / GRID) === ty,
      )
      if (!candidate) continue
      if (normalizeDirection(candidate.direction) !== dir) continue
      if (candidate.extra?.type !== role) continue
      if (isFree(candidate, entities, catalogByTypeId)) return true
    }
    return false
  }

  // сзади свободный input -> мы (стоящие впереди по ходу) становимся output
  if (hasFreeRoleAlongAxis('input', -fx, -fy)) return 'output'
  // спереди свободный output -> мы (стоящие позади по ходу) становимся input
  if (hasFreeRoleAlongAxis('output', fx, fy)) return 'input'
  return 'input'
}

// Встанет ли сущность-призрак (ещё не размещённая, т.к. второй шаг
// двухшагового режима) в зону связи с уже поставленным "якорем" —
// для зелёной подсветки рамки призрака (см. PlacementGhost/
// BlueprintCanvas). Та же геометрия, что findUndergroundPartner, но
// принимает "сырые" координаты/направление вместо PlacedEntity —
// призрак ещё не существует как сущность на канвасе.
export function isUndergroundGhostConnected(
  anchor: { x: number; y: number; direction: EntityDirection | undefined; typeId: string },
  ghost: { x: number; y: number; direction: EntityDirection | undefined },
  catalogByTypeId: Map<string, CatalogEntity>,
): boolean {
  const axis = getAxisInfo(anchor.typeId, anchor.direction, catalogByTypeId)
  if (!axis) return false
  if (normalizeDirection(ghost.direction) !== axis.requiredPartnerDirection) return false

  const dir = normalizeDirection(anchor.direction)
  const anchorTileX = Math.round(anchor.x / GRID)
  const anchorTileY = Math.round(anchor.y / GRID)
  const ghostTileX = Math.round(ghost.x / GRID)
  const ghostTileY = Math.round(ghost.y / GRID)

  if (!isAheadAlongTunnel(axis.tunnelDirection, anchorTileX, anchorTileY, ghostTileX, ghostTileY)) return false

  const dist = axisDistance(dir, anchorTileX, anchorTileY, ghostTileX, ghostTileY)
  return dist !== null && dist >= 1 && dist <= axis.maxDistance
}

// Тайловое расстояние между двумя УЖЕ связанными (findUndergroundPartner
// вернул ненулевой результат) сущностями — для подсказки дальности по
// наведению: показываем реальный пролёт до партнёра, а не максимум
// catalog'а (см. UndergroundRange.tsx/BlueprintCanvas.tsx).
export function undergroundTileDistance(a: { x: number; y: number }, b: { x: number; y: number }): number {
  return Math.round((Math.abs(a.x - b.x) + Math.abs(a.y - b.y)) / GRID)
}

// Направление ОТ одной точки К другой (кардинальное, они всегда на одной
// оси — вызывается только для уже подтверждённых пар/осей). Нужно, чтобы
// подсказка дальности указывала НА партнёра, а не всегда "вперёд" по
// entity.direction сущности — если навести на "выходную" часть пары
// (которая стоит ВПЕРЕДИ по ходу), партнёр лежит СЗАДИ неё, и подсказка
// должна развернуться назад, а не продолжать линию вперёд мимо партнёра.
export function undergroundDirectionTo(
  from: { x: number; y: number },
  to: { x: number; y: number },
): CardinalDeg {
  const dx = to.x - from.x
  const dy = to.y - from.y
  if (Math.abs(dy) >= Math.abs(dx)) return dy < 0 ? 0 : 180
  return dx > 0 ? 90 : 270
}

// Канонический порядок пары для оверлея подсказки по наведению —
// возвращает ВСЕГДА одну и ту же из двух сущностей первой независимо от
// того, курсор навели на a или на b (детерминируется по координатам, не
// по тому, кто вызвал). Без этого оверлей (сторона/направление шевронов)
// "прыгал" бы между двумя противоположными видами при переключении
// наведения с одного конца связанной пары на другой, хотя это один и
// тот же физический пролёт и должен выглядеть одинаково.
export function undergroundPairAnchor<T extends { x: number; y: number }>(a: T, b: T): [T, T] {
  if (a.x !== b.x) return a.x < b.x ? [a, b] : [b, a]
  return a.y <= b.y ? [a, b] : [b, a]
}

// Тайловая дистанция от уже поставленного "якоря" (вход двухшагового
// режима) вдоль ЕГО оси до произвольной точки (текущая позиция призрака-
// выхода) — null, если точка не на оси (см. axisDistance) ИЛИ если её
// направление не подходит для связи (см. getAxisInfo.requiredPartnerDirection —
// то же правило, что и isUndergroundGhostConnected/findUndergroundPartner):
// если призрак повернули (R) в сторону, не совместимую с входом (для
// лент — не то же самое направление, для труб — не противоположное),
// полоса дальности не должна показываться вовсе, даже если призрак
// формально стоит на оси в пределах дальности — он физически не
// свяжется в этом положении. Используется, чтобы полоса подсказки во
// время постановки росла вместе с курсором (как в игре — до того места,
// где сейчас призрак, а не сразу на всю максимальную дальность), а не
// связью (findUndergroundPartner), т.к. вторая часть ещё не существует
// как сущность на канвасе.
export function undergroundAxisDistanceToPoint(
  anchor: { x: number; y: number; direction: EntityDirection | undefined; typeId: string },
  point: { x: number; y: number; direction: EntityDirection | undefined },
  catalogByTypeId: Map<string, CatalogEntity>,
): number | null {
  const axis = getAxisInfo(anchor.typeId, anchor.direction, catalogByTypeId)
  if (!axis) return null
  if (normalizeDirection(point.direction) !== axis.requiredPartnerDirection) return null

  const dir = normalizeDirection(anchor.direction)
  const anchorTileX = Math.round(anchor.x / GRID)
  const anchorTileY = Math.round(anchor.y / GRID)
  const pointTileX = Math.round(point.x / GRID)
  const pointTileY = Math.round(point.y / GRID)
  if (!isAheadAlongTunnel(axis.tunnelDirection, anchorTileX, anchorTileY, pointTileX, pointTileY)) return null
  return axisDistance(dir, anchorTileX, anchorTileY, pointTileX, pointTileY)
}
