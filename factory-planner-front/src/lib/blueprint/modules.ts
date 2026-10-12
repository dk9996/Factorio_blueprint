// Модули сущности (entities[].items в чертеже). В 1.1 — словарь
// {имя_модуля: количество}, в 2.0 — массив
// [{id:{name,quality?}, items:{in_inventory:[{inventory,stack,count?}]}}].
// Разбираем оба формата в единый нормализованный вид и всегда пишем
// обратно в формате 2.0 (см. задачу) — даже если чертёж был импортирован
// из 1.1.
export interface ModuleStackEntry {
  name: string
  quality?: string
  // Имя инвентаря модулей у сущности ("crafter_modules" у станков/буров,
  // своё у маяков и т.п.) — на импорте всегда берём из самого чертежа
  // (2.0-формат его указывает явно), на 1.1 такой информации нет, тогда
  // используем разумный дефолт. Своего UI для добавления модулей в
  // приложении нет, так что modules появляется только через импорт —
  // отсутствие оригинального inventory-имени не встречается на практике.
  inventory: string
  stack: number
  count?: number
}

const DEFAULT_MODULE_INVENTORY = 'crafter_modules'

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

export function parseModules(raw: unknown): ModuleStackEntry[] {
  if (!raw) return []

  if (Array.isArray(raw)) {
    // 2.0: [{id:{name,quality?}, items:{in_inventory:[{inventory,stack,count?}]}}]
    const result: ModuleStackEntry[] = []
    for (const item of raw) {
      if (!isRecord(item)) continue
      const id = item.id
      if (!isRecord(id) || typeof id.name !== 'string') continue
      const name = id.name
      const quality = typeof id.quality === 'string' ? id.quality : undefined
      const items = item.items
      const inInventory = isRecord(items) ? items.in_inventory : undefined
      if (!Array.isArray(inInventory)) continue
      for (const slot of inInventory) {
        if (!isRecord(slot)) continue
        result.push({
          name,
          quality,
          inventory: typeof slot.inventory === 'string' ? slot.inventory : DEFAULT_MODULE_INVENTORY,
          stack: typeof slot.stack === 'number' ? slot.stack : result.length,
          count: typeof slot.count === 'number' ? slot.count : undefined,
        })
      }
    }
    return result
  }

  if (isRecord(raw)) {
    // 1.1: {имя: количество}
    const result: ModuleStackEntry[] = []
    let stack = 0
    for (const [name, count] of Object.entries(raw)) {
      if (typeof count !== 'number' || count <= 0) continue
      result.push({
        name,
        inventory: DEFAULT_MODULE_INVENTORY,
        stack,
        count: count > 1 ? count : undefined,
      })
      stack++
    }
    return result
  }

  return []
}

// Нормализованный вид -> raw items для экспорта (всегда формат 2.0).
// undefined, если модулей нет — чтобы не писать пустой "items": [].
export function serializeModules(modules: ModuleStackEntry[] | undefined): unknown[] | undefined {
  if (!modules || modules.length === 0) return undefined
  return modules.map((m) => ({
    id: m.quality ? { name: m.name, quality: m.quality } : { name: m.name },
    items: {
      in_inventory: [
        {
          inventory: m.inventory,
          stack: m.stack,
          ...(m.count !== undefined ? { count: m.count } : {}),
        },
      ],
    },
  }))
}
