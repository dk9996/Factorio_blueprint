// Качество (Quality) предметов — только профили с DLC quality/space-age
// (там бэкенд отдаёт непустой список qualities). Отсутствие качества у
// сущности/рецепта/модуля = normal.

export interface QualityDef {
  name: string
  level: number
  // CSS-цвет '#rrggbb' из прототипа quality дампа
  color: string
  localizedName: string
  icon: string | null
}

export const NORMAL_QUALITY = 'normal'

// Качество выше normal (то, что подсвечивается цветным фоном и пишется в
// модель/чертёж). undefined/null/'normal' — обычное.
export function isUpgradedQuality(quality: string | null | undefined): quality is string {
  return !!quality && quality !== NORMAL_QUALITY
}

// В модель кладём undefined вместо 'normal' — "отсутствует = normal".
export function storedQuality(quality: string | null | undefined): string | undefined {
  return isUpgradedQuality(quality) ? quality : undefined
}
