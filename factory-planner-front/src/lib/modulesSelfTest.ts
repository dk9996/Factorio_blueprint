// Тесты lib/modules.ts на РЕАЛЬНЫХ данных каталога (профиль all, собирается
// scripts/build_content.py) — запускать из factory-planner-front:
//   node src/lib/modulesSelfTest.ts
// Как и lib/blueprint/selfTest.ts: без vitest, Node исполняет .ts напрямую.
/// <reference types="node" />
import { readFileSync } from 'node:fs'
import { groupAllowedModules, isModuleAllowed, isSlotInvalid, sumModuleEffects, type ModuleDef } from './modules.ts'

const BACKEND = new URL('../../../factory-planner-backend/', import.meta.url)
function loadProfile(id: string) {
  const dir = new URL(`content/profiles/${id}/`, BACKEND)
  const read = (f: string) => JSON.parse(readFileSync(new URL(f, dir), 'utf-8'))
  return { entities: read('entity_catalog.json'), recipes: read('recipes.json'), modules: read('modules.json') as ModuleDef[], dir }
}

let failed = 0
let passed = 0
function assert(cond: boolean, msg: string) {
  if (cond) { passed++; console.log(`  OK  ${msg}`) } else { failed++; console.log(`FAIL  ${msg}`) }
}

const all = loadProfile('base+er+quality+space-age')
const base = loadProfile('base')
const entity = (name: string) => all.entities.find((e: { typeId: string }) => e.typeId === name)
const recipe = (name: string) => all.recipes.find((r: { name: string }) => r.name === name)
const allowedNames = (e: unknown, r: unknown, mods: ModuleDef[]) => mods.filter((m) => isModuleAllowed(e as never, r as never, m)).map((m) => m.name)
const byCategory = (names: string[]) => (cat: string) => names.filter((n) => all.modules.find((m) => m.name === n)?.category === cat)

console.log('=== Маяк ===')
{
  const names = allowedNames(entity('beacon'), null, all.modules)
  assert(byCategory(names)('productivity').length === 0, 'продуктивные модули НЕ разрешены')
  assert(byCategory(names)('quality').length === 0, 'модули качества НЕ разрешены (нет quality в allowed_effects)')
  assert(byCategory(names)('speed').length === 3, 'все 3 скоростных разрешены (штраф по quality не блокирует)')
  assert(byCategory(names)('efficiency').length === 3, 'все 3 энергоэффективных разрешены')
}

console.log('=== Сборочный автомат 3 ===')
{
  const asm = entity('assembling-machine-3')
  const cats: string[] = asm.craftingCategories
  const rawRecipes = JSON.parse(readFileSync(new URL('data-raw-dump.json', all.dir), 'utf-8')).recipe as Record<string, { category?: string; allow_productivity?: boolean }>
  // рецепт, где allow_productivity ЯВНО false в дампе, и машина его умеет
  const explicitFalse = Object.entries(rawRecipes).find(([, r]) => r.allow_productivity === false && cats.includes(r.category ?? 'crafting'))
  assert(!!explicitFalse, `в дампе есть рецепт с allow_productivity=false для asm-3: ${explicitFalse?.[0]}`)
  const noProd = recipe(explicitFalse![0])
  const names = allowedNames(asm, noProd, all.modules)
  assert(byCategory(names)('productivity').length === 0, 'allow_productivity=false: продуктивных нет')
  assert(byCategory(names)('speed').length === 3 && byCategory(names)('efficiency').length === 3 && byCategory(names)('quality').length === (noProd.allowQuality === false ? 0 : 3), 'скорость/эффективность разрешены, качество — строго по allow_quality рецепта')
  // обычный рецепт с allow_productivity=true
  const prodRecipe = recipe('electronic-circuit')
  assert(prodRecipe.allowProductivity === true, 'electronic-circuit: allow_productivity=true')
  const names2 = allowedNames(asm, prodRecipe, all.modules)
  assert(byCategory(names2)('productivity').length === 3, 'с обычным рецептом продуктивные есть (все 3)')
  // рецепт, где флага вообще нет в дампе — productivity по умолчанию запрещена
  const noFlag = Object.entries(rawRecipes).find(([n, r]) => r.allow_productivity === undefined && cats.includes(r.category ?? 'crafting') && recipe(n) && !recipe(n).hidden && recipe(n).ingredients.length > 0)
  assert(!!noFlag && recipe(noFlag[0]).allowProductivity === false && byCategory(allowedNames(asm, recipe(noFlag[0]), all.modules))('productivity').length === 0,
    `флага нет (${noFlag?.[0]}): по умолчанию продуктивность запрещена`)
  // без рецепта — все 4 категории
  const none = allowedNames(asm, null, all.modules)
  assert(none.length === all.modules.length, 'без рецепта разрешены все модули профиля')
  // allow_quality=false запрещает модули качества
  const noQuality = all.recipes.find((r: { allowQuality: boolean }) => r.allowQuality === false)
  assert(!!noQuality && byCategory(allowedNames(asm, noQuality, all.modules))('quality').length === 0, `allow_quality=false (${noQuality?.name}): качества нет`)
  // подсветка при смене рецепта
  const byName = new Map(all.modules.map((m) => [m.name, m]))
  assert(isSlotInvalid(asm, noProd, 'productivity-module-3', byName) === true, 'продуктивный модуль при allow_productivity=false помечен недопустимым')
  assert(isSlotInvalid(asm, prodRecipe, 'productivity-module-3', byName) === false, 'тот же модуль при обычном рецепте допустим')
  assert(isSlotInvalid(asm, noProd, null, byName) === false, 'пустой слот никогда не недопустим')
}

console.log('=== Лаборатория / печь / бур / ракетная шахта ===')
{
  assert(allowedNames(entity('lab'), null, all.modules).length === all.modules.length, 'лаборатория: все модули')
  const furnace = entity('electric-furnace')
  const fn = allowedNames(furnace, recipe('iron-plate'), all.modules)
  assert(fn.length > 0 && byCategory(fn)('speed').length === 3 && byCategory(fn)('efficiency').length === 3, 'электропечь: скорость и эффективность есть')
  assert(byCategory(fn)('productivity').length === (recipe('iron-plate').allowProductivity ? 3 : 0), 'электропечь: продуктивность строго по флагу рецепта iron-plate')
  assert(allowedNames(entity('electric-mining-drill'), null, all.modules).length === all.modules.length, 'электробур: все модули')
  const silo = allowedNames(entity('rocket-silo'), null, all.modules)
  assert(byCategory(silo)('speed').length === 3 && byCategory(silo)('quality').length === 0, 'ракетная шахта: скорость есть (quality-штраф не мешает), качества нет')
}

console.log('=== Сущность без слотов ===')
{
  const steel = entity('steel-furnace')
  assert(steel.moduleSlots === 0 && allowedNames(steel, null, all.modules).length === 0, 'стальная печь (0 слотов): ничего')
  assert(allowedNames(entity('transport-belt'), null, all.modules).length === 0, 'конвейер: ничего')
  assert(groupAllowedModules(steel, null, all.modules).length === 0, 'группы пусты → UI покажет «Нет доступных модулей»')
}

console.log('=== Профили: модули качества ===')
{
  assert(!base.modules.some((m) => m.category === 'quality'), 'профиль base: модулей качества нет')
  assert(all.modules.filter((m) => m.category === 'quality').length === 3, 'профиль all: 3 модуля качества')
  const q = loadProfile('base+quality')
  assert(q.modules.filter((m) => m.category === 'quality').length === 3, 'профиль base+quality: модули качества есть')
  const groups = groupAllowedModules(entity('assembling-machine-3'), null, all.modules)
  assert(groups.map((g) => g.category).join() === 'speed,productivity,efficiency,quality', 'группы в порядке: скорость, продуктивность, эффективность, качество')
}

console.log('=== Суммарные эффекты ===')
{
  const byName = new Map(all.modules.map((m) => [m.name, m]))
  const t = sumModuleEffects(['speed-module-3', 'speed-module-3', null, 'productivity-module'], byName)
  assert(Math.abs(t.speed - (0.5 + 0.5 - 0.05)) < 1e-9, `скорость: ${t.speed}`)
  assert(Math.abs(t.productivity - 0.04) < 1e-9, `продуктивность: ${t.productivity}`)
  assert(Math.abs(t.consumption - (0.7 + 0.7 + 0.4)) < 1e-9, `потребление: ${t.consumption}`)
  assert(Math.abs(t.quality - (-0.25 - 0.25)) < 1e-9, `качество: ${t.quality}`)
}

console.log(`\n=== Итого: ${passed} OK, ${failed} FAIL ===`)
if (failed > 0) process.exit(1)
