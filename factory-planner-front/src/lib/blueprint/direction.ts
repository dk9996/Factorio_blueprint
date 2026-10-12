import type { EntityDirection } from '../../store/canvasStore.ts'
import { directionStepCount } from './version.ts'

const CARDINAL_DEGREES: EntityDirection[] = [0, 90, 180, 270]

// Сырой direction чертежа (0..7 в 1.1, 0..15 в 2.0, см. version.ts) ->
// наши 0/90/180/270. Диагональные значения (рельсы и т.п.) округляются
// до ближайшего кардинального — видеть их "как есть" не обещали
// (см. задачу: точность рельсов не добиваемся), главное не падать.
// Отсутствие direction в чертеже = север (0).
export function decodeDirection(raw: number | undefined, version: number): EntityDirection {
  if (raw === undefined) return 0
  const steps = directionStepCount(version)
  const stepsPerCardinal = steps / 4
  const cardinalIndex = ((Math.round(raw / stepsPerCardinal) % 4) + 4) % 4
  return CARDINAL_DEGREES[cardinalIndex]
}

// Наши 0/90/180/270 -> сырой direction в формате 2.0 (0/4/8/12). Экспорт
// всегда пишем в формате 2.0, независимо от того, из какой версии чертёж
// импортировали (см. задачу). direction=0 (север) не пишем вовсе —
// undefined здесь значит "не добавлять ключ direction в сущность".
export function encodeDirection(direction: EntityDirection | undefined): number | undefined {
  const deg = direction ?? 0
  const step = (deg / 90) * 4 // 0->0, 90->4, 180->8, 270->12
  return step === 0 ? undefined : step
}
