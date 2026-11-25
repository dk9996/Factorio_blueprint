// Модули сущности (entities[].items чертежа). В 1.1 — словарь
// {имя_предмета: количество}, в 2.0 — массив
// [{id:{name,quality?}, items:{in_inventory:[{inventory,stack,count?}]}}].
//
// В модели приложения модули — массив по слотам PlacedEntity.modules
// ({name, quality?} | null, индекс = слот = stack в чертеже; качество —
// id.quality чертежа 2.0, отсутствует = normal). Всё, что не является
// модулем в слоте (топливо, модули вне диапазона слотов и т.п.), не
// теряется: уходит "как есть" в PlacedEntity.extra.items и пишется обратно.

import { toSlot, type ModuleSlot } from '../modules.ts'
import { storedQuality } from '../quality.ts'

export interface ModuleExtra {
  // Инвентарь модулей сущности ровно в том виде, как он был в чертеже
  // (в 2.0 это число defines.inventory — например 4 у сборщиков; строка
  // бывает только у чертежей, созданных старыми версиями приложения).
  inventory?: number | string
}

export interface ParsedItems {
  modules?: (ModuleSlot | null)[]
  moduleExtra?: ModuleExtra
  // Нераспознанные как модули записи items (2.0-формат), пишутся обратно
  // без изменений.
  rest?: unknown[]
}

// Предикат "это имя — модуль": по каталогу профиля, а если каталог не
// загружен (тесты, меню до входа в проект) — по соглашению об именах.
export function makeIsModuleName(names?: Set<string> | null): (name: string) => boolean {
  return (name) => (names && names.size > 0 ? names.has(name) : false) || /-module(-\d+)?$/.test(name)
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

// Inventory, который игра понимает у чертежей 2.0 для модулей сборщиков
// (crafter_modules = 4: так в собственном коде игры, base/prototypes/
// factoriopedia-simulations.lua). Для остальных типов числовые значения
// defines.inventory в файлах игры не публикуются — для них пишем имя
// инвентаря строкой (имена из doc-html/runtime-api.json), см. отчёт.
const CRAFTER_TYPES = new Set(['assembling-machine', 'furnace', 'rocket-silo'])
const NAMED_INVENTORY_BY_TYPE: Record<string, string> = {
  beacon: 'beacon_modules',
  lab: 'lab_modules',
  'mining-drill': 'mining_drill_modules',
  'agricultural-tower': 'agricultural_tower_modules',
}

export function defaultModuleInventory(entityType: string | undefined): number | string {
  if (entityType && CRAFTER_TYPES.has(entityType)) return 4
  if (entityType && NAMED_INVENTORY_BY_TYPE[entityType]) return NAMED_INVENTORY_BY_TYPE[entityType]
  return 'crafter_modules'
}

// items чертежа -> модули по слотам + остаток. slotCount — число слотов
// сущности по каталогу (0 — модули некуда класть, всё уходит в rest).
export function parseBlueprintItems(
  raw: unknown,
  slotCount: number,
  isModuleName: (name: string) => boolean,
): ParsedItems {
  if (!raw) return {}

  const slots: (ModuleSlot | null)[] = Array.from({ length: slotCount }, () => null)
  let inventory: number | string | undefined
  let anyModule = false
  const rest: unknown[] = []

  if (Array.isArray(raw)) {
    for (const item of raw) {
      if (!isRecord(item) || !isRecord(item.id) || typeof item.id.name !== 'string') {
        rest.push(item)
        continue
      }
      const name = item.id.name
      const quality = typeof item.id.quality === 'string' ? storedQuality(item.id.quality) : undefined
      const inInventory = isRecord(item.items) ? item.items.in_inventory : undefined
      if (!isModuleName(name) || !Array.isArray(inInventory)) {
        rest.push(item)
        continue
      }
      const unplaced: unknown[] = []
      for (const slot of inInventory) {
        const stack = isRecord(slot) ? slot.stack : undefined
        const fits =
          isRecord(slot) &&
          typeof stack === 'number' &&
          Number.isInteger(stack) &&
          stack >= 0 &&
          stack < slotCount &&
          slots[stack] === null &&
          (slot.count === undefined || slot.count === 1)
        if (!fits) {
          unplaced.push(slot)
          continue
        }
        const s = slot as Record<string, unknown>
        slots[stack as number] = quality ? { name, quality } : { name }
        anyModule = true
        if (inventory === undefined && (typeof s.inventory === 'number' || typeof s.inventory === 'string')) {
          inventory = s.inventory
        }
      }
      if (unplaced.length > 0) rest.push({ ...item, items: { ...(item.items as object), in_inventory: unplaced } })
    }
  } else if (isRecord(raw)) {
    // 1.1: {имя: количество}; модули раскладываем по слотам подряд.
    let next = 0
    let legacyStack = 0
    for (const [name, count] of Object.entries(raw)) {
      if (typeof count !== 'number' || count <= 0) continue
      if (isModuleName(name)) {
        let left = count
        while (left > 0 && next < slotCount) {
          slots[next++] = { name }
          anyModule = true
          left--
        }
        if (left > 0) rest.push(legacyEntry(name, left, legacyStack++))
      } else {
        rest.push(legacyEntry(name, count, legacyStack++))
      }
    }
  } else {
    return {}
  }

  const result: ParsedItems = {}
  if (anyModule) {
    result.modules = slots
    if (inventory !== undefined) result.moduleExtra = { inventory }
  }
  if (rest.length > 0) result.rest = rest
  return result
}

// Запись 1.1-предмета (не модуль или не поместившийся модуль) -> 2.0.
// inventory=1 — "fuel" по порядку defines.inventory (в документации игры
// это первое значение); единственное допущение в этом файле, затрагивает
// только НЕмодульные items из чертежей формата 1.1.
function legacyEntry(name: string, count: number, stack: number): unknown {
  return { id: { name }, items: { in_inventory: [{ inventory: 1, stack, count }] } }
}

// Модули по слотам + остаток -> raw items (всегда формат 2.0). undefined,
// если писать нечего (чтобы не добавлять пустой "items": []).
// includeQuality=false (профиль без DLC quality) — id.quality не пишется.
export function serializeBlueprintItems(
  modules: unknown[] | undefined,
  moduleExtra: ModuleExtra | undefined,
  rest: unknown,
  entityType: string | undefined,
  includeQuality = true,
): unknown[] | undefined {
  const out: unknown[] = []
  if (modules) {
    const inventory = moduleExtra?.inventory ?? defaultModuleInventory(entityType)
    const groups = new Map<string, { name: string; quality: string | null; stacks: number[] }>()
    modules.forEach((raw, stack) => {
      const slot = toSlot(raw)
      if (!slot) return
      const { name } = slot
      const quality = includeQuality ? storedQuality(slot.quality) ?? null : null
      const key = `${name}\u0000${quality ?? ''}`
      const g = groups.get(key) ?? { name, quality, stacks: [] }
      g.stacks.push(stack)
      groups.set(key, g)
    })
    for (const g of groups.values()) {
      out.push({
        id: g.quality ? { name: g.name, quality: g.quality } : { name: g.name },
        items: { in_inventory: g.stacks.map((stack) => ({ inventory, stack })) },
      })
    }
  }
  if (Array.isArray(rest)) out.push(...rest)
  return out.length > 0 ? out : undefined
}
