// Настройки сущности хранятся в PlacedEntity в формате blueprint 2.0:
// control_behavior -> PlacedEntity.controlBehavior, всё остальное, что не
// разобрано в собственные поля модели, лежит в PlacedEntity.extra (см.
// lib/blueprint/extra.ts). Путь настройки — путь в JSON сущности чертежа
// ('bar', 'parameters.playback_volume', 'control_behavior.use_colors').
// Неизвестные поля путь не затрагивает — они остаются как есть.
import type { PlacedEntity } from '../../store/canvasStore'

export interface SettingPatch {
  path: string
  // undefined — стереть поле
  value: unknown
  // значения по умолчанию для обязательных вложенных объектов чертежа:
  // top-level ключ -> объект, создаётся при первой записи внутрь него
  seed?: Record<string, unknown>
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

function getIn(root: unknown, segments: string[]): unknown {
  let cur: unknown = root
  for (const s of segments) {
    if (!isRecord(cur)) return undefined
    cur = cur[s]
  }
  return cur
}

// set со стиранием: пустые родительские объекты убираются
function setIn(root: Record<string, unknown> | undefined, segments: string[], value: unknown): Record<string, unknown> | undefined {
  const [head, ...rest] = segments
  const base: Record<string, unknown> = { ...(root ?? {}) }
  if (rest.length === 0) {
    if (value === undefined) delete base[head]
    else base[head] = value
  } else {
    const child = setIn(isRecord(base[head]) ? (base[head] as Record<string, unknown>) : undefined, rest, value)
    if (child === undefined) delete base[head]
    else base[head] = child
  }
  return Object.keys(base).length > 0 ? base : undefined
}

export function readSetting(entity: PlacedEntity, path: string): unknown {
  const segments = path.split('.')
  if (segments[0] === 'control_behavior') return getIn(entity.controlBehavior, segments.slice(1))
  return getIn(entity.extra, segments)
}

export function applySettingPatches(entity: PlacedEntity, patches: SettingPatch[]): PlacedEntity {
  let next = entity
  for (const p of patches) {
    const segments = p.path.split('.')
    if (segments[0] === 'control_behavior') {
      let current = next.controlBehavior as Record<string, unknown> | undefined
      const cbSeed = p.seed?.control_behavior
      if (cbSeed && p.value !== undefined && isRecord(cbSeed)) {
        // недостающие обязательные поля control_behavior берутся из seed
        current = { ...structuredClone(cbSeed), ...(current ?? {}) }
      }
      const cb = setIn(current, segments.slice(1), p.value)
      next = { ...next, controlBehavior: cb }
    } else {
      let extra = next.extra
      if (p.seed && p.value !== undefined && extra?.[segments[0]] === undefined && p.seed[segments[0]] !== undefined) {
        extra = { ...(extra ?? {}), [segments[0]]: structuredClone(p.seed[segments[0]]) }
      }
      next = { ...next, extra: setIn(extra, segments, p.value) }
    }
  }
  return next
}

export function sameValue(a: unknown, b: unknown): boolean {
  return JSON.stringify(a ?? null) === JSON.stringify(b ?? null)
}
