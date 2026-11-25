// Допустимость модулей в сущности/рецепте и суммарные эффекты — чистые
// функции без обращения к сторам (см. lib/modulesSelfTest.ts — тесты на
// реальных данных каталога).

export type EffectKey = 'speed' | 'productivity' | 'consumption' | 'pollution' | 'quality'
export const EFFECT_KEYS: EffectKey[] = ['speed', 'productivity', 'consumption', 'pollution', 'quality']

export interface ModuleDef {
  name: string
  label: string
  category: string
  tier: number
  effect: Partial<Record<EffectKey, number>>
  icon: string | null
  // Только формат 1.1 (в 2.0 ограничения задают флаги рецепта).
  limitation?: string[]
  limitationBlacklist?: string[]
}

// Минимум полей сущности каталога, нужный для проверки.
export interface ModuleEntityInfo {
  moduleSlots: number
  allowedEffects?: string[] | null
  allowedModuleCategories?: string[] | null
}

// Минимум полей рецепта каталога. Значения по умолчанию — как у прототипа
// рецепта: productivity запрещена, пока не разрешена явно; остальные
// эффекты разрешены, пока не запрещены явно.
export interface ModuleRecipeInfo {
  name?: string
  allowProductivity?: boolean
  allowSpeed?: boolean
  allowConsumption?: boolean
  allowPollution?: boolean
  allowQuality?: boolean
  allowedModuleCategories?: string[] | null
}

function recipeAllows(recipe: ModuleRecipeInfo, effect: EffectKey): boolean {
  switch (effect) {
    case 'productivity': return recipe.allowProductivity === true
    case 'speed': return recipe.allowSpeed !== false
    case 'consumption': return recipe.allowConsumption !== false
    case 'pollution': return recipe.allowPollution !== false
    case 'quality': return recipe.allowQuality !== false
  }
}

// "Определяющие" эффекты модуля — те, ради которых он нужен: рост скорости/
// продуктивности/качества и СНИЖЕНИЕ потребления/загрязнения. Штрафы
// (скоростной модуль: +потребление, -качество; продуктивный: +потребление,
// +загрязнение, -скорость) сущность/рецепт не блокируют — иначе скоростные
// модули не лезли бы ни в маяк (нет quality), ни в НПЗ/ракетную шахту (нет
// quality), хотя в игре это обычная практика.
export function primaryEffects(module: ModuleDef): EffectKey[] {
  const result: EffectKey[] = []
  for (const key of EFFECT_KEYS) {
    const v = module.effect[key]
    if (!v) continue
    if (key === 'consumption' || key === 'pollution' ? v < 0 : v > 0) result.push(key)
  }
  return result
}

export function isModuleAllowed(
  entity: ModuleEntityInfo,
  recipe: ModuleRecipeInfo | null | undefined,
  module: ModuleDef,
): boolean {
  if (!(entity.moduleSlots > 0)) return false

  const effects = primaryEffects(module)

  // 1) эффекты сущности (не задано — разрешены все)
  if (entity.allowedEffects && !effects.every((e) => entity.allowedEffects!.includes(e))) return false
  // 2) категории сущности
  if (entity.allowedModuleCategories && !entity.allowedModuleCategories.includes(module.category)) return false

  if (recipe) {
    // 3) флаги и категории рецепта
    if (!effects.every((e) => recipeAllows(recipe, e))) return false
    if (recipe.allowedModuleCategories && !recipe.allowedModuleCategories.includes(module.category)) return false
    // формат 1.1: список рецептов у самого модуля
    if (recipe.name) {
      if (module.limitation && module.limitation.length > 0 && !module.limitation.includes(recipe.name)) return false
      if (module.limitationBlacklist?.includes(recipe.name)) return false
    }
  }
  return true
}

export const MODULE_CATEGORY_ORDER = ['speed', 'productivity', 'efficiency', 'quality']
export const MODULE_CATEGORY_LABELS: Record<string, string> = {
  speed: 'Скорость',
  productivity: 'Продуктивность',
  efficiency: 'Эффективность',
  quality: 'Качество',
}

export interface ModuleGroup {
  category: string
  label: string
  modules: ModuleDef[]
}

// Допустимые модули, сгруппированные по категориям (пустые группы не
// возвращаются; категории вне известного списка — в конце).
export function groupAllowedModules(
  entity: ModuleEntityInfo,
  recipe: ModuleRecipeInfo | null | undefined,
  modules: ModuleDef[],
): ModuleGroup[] {
  const byCategory = new Map<string, ModuleDef[]>()
  for (const m of modules) {
    if (!isModuleAllowed(entity, recipe, m)) continue
    byCategory.set(m.category, [...(byCategory.get(m.category) ?? []), m])
  }
  const known = MODULE_CATEGORY_ORDER.filter((c) => byCategory.has(c))
  const other = [...byCategory.keys()].filter((c) => !MODULE_CATEGORY_ORDER.includes(c))
  return [...known, ...other].map((category) => ({
    category,
    label: MODULE_CATEGORY_LABELS[category] ?? category,
    modules: (byCategory.get(category) ?? []).sort((a, b) => a.tier - b.tier),
  }))
}

// Слот модулей: модуль + его качество (отсутствует = normal).
export interface ModuleSlot {
  name: string
  quality?: string
}

// Приводит значение слота к {name, quality?}. Принимает и старый формат
// (просто имя строкой — проекты, сохранённые до поддержки качества).
export function toSlot(raw: unknown): ModuleSlot | null {
  if (!raw) return null
  if (typeof raw === 'string') return { name: raw }
  if (typeof raw === 'object' && typeof (raw as ModuleSlot).name === 'string') {
    const { name, quality } = raw as ModuleSlot
    return quality ? { name, quality } : { name }
  }
  return null
}

// Массив слотов нужной длины (лишнее обрезается, недостающее — null).
export function normalizeSlots(modules: unknown[] | undefined, slotCount: number): (ModuleSlot | null)[] {
  return Array.from({ length: slotCount }, (_, i) => toSlot(modules?.[i]))
}

// Слот занят модулем, который при текущем рецепте стал недопустим.
export function isSlotInvalid(
  entity: ModuleEntityInfo,
  recipe: ModuleRecipeInfo | null | undefined,
  slot: ModuleSlot | string | null,
  modulesByName: Map<string, ModuleDef>,
): boolean {
  const moduleName = toSlot(slot)?.name
  if (!moduleName) return false
  const def = modulesByName.get(moduleName)
  return def ? !isModuleAllowed(entity, recipe, def) : false
}

// Сумма эффектов установленных модулей (доли: 0.2 = +20%).
export function sumModuleEffects(
  modules: unknown[] | undefined,
  modulesByName: Map<string, ModuleDef>,
): Record<EffectKey, number> {
  const total: Record<EffectKey, number> = { speed: 0, productivity: 0, consumption: 0, pollution: 0, quality: 0 }
  for (const raw of modules ?? []) {
    const name = toSlot(raw)?.name
    const def = name ? modulesByName.get(name) : undefined
    if (!def) continue
    for (const key of EFFECT_KEYS) total[key] += def.effect[key] ?? 0
  }
  return total
}
