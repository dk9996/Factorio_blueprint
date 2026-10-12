// Версия игры в чертеже — упаковано в одно число:
// major<<48 | minor<<32 | patch<<16 | build (build почти всегда 0 в
// самих чертежах). Все компоненты малы (<2^16), результат далеко в
// пределах Number.MAX_SAFE_INTEGER (2^53-1), побитовые сдвиги не
// используем — у JS они 32-битные, считаем через умножение.
export interface GameVersion {
  major: number
  minor: number
  patch: number
  build: number
}

const SHIFT_48 = 2 ** 48
const SHIFT_32 = 2 ** 32
const SHIFT_16 = 2 ** 16

export function packVersion(major: number, minor: number, patch: number, build = 0): number {
  return major * SHIFT_48 + minor * SHIFT_32 + patch * SHIFT_16 + build
}

export function unpackVersion(version: number): GameVersion {
  const major = Math.floor(version / SHIFT_48) % SHIFT_16
  const minor = Math.floor(version / SHIFT_32) % SHIFT_16
  const patch = Math.floor(version / SHIFT_16) % SHIFT_16
  const build = version % SHIFT_16
  return { major, minor, patch, build }
}

// Версия, которую проставляем при экспорте своих чертежей — см. отчёт
// в чате: на бэкенде/в дампе каталога номер версии движка не хранится,
// так что берём разумную актуальную 2.0.x константу.
export const DEFAULT_EXPORT_VERSION = packVersion(2, 0, 28)

// В Factorio 2.0 направление — 0..15 (16 ступеней по 22.5°), в 1.1 было
// 0..7 (8 ступеней по 45°). Определяем по major компоненте версии чертежа.
export function directionStepCount(version: number): 8 | 16 {
  return unpackVersion(version).major >= 2 ? 16 : 8
}
