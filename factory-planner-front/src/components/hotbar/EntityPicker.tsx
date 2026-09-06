import { useUiStore } from '../../store/uiStore'
import { useHotbarStore } from '../../store/hotbarStore'
import { useEntityCatalogStore, type CatalogEntity } from '../../store/entityCatalogStore'
import { useMemo, useState } from 'react'

// Те же временно скрытые категории, что и в EntityPalette — каталог общий,
// список сущностей для хотбара не должен расходиться с палитрой.
const HIDDEN_CATEGORY_IDS = new Set([
  'enemies',
  'environment',
  'effects',
  'se-spoilers',
  'other',
])

export function EntityPicker() {
  const pickerTarget = useUiStore((s) => s.pickerTarget)
  const closePicker = useUiStore((s) => s.closePicker)
  const assignSlot = useHotbarStore((s) => s.assignSlot)
  const catalog = useEntityCatalogStore((s) => s.entities)

  const [query, setQuery] = useState('')

  const categories = useMemo(() => {
    const map = new Map<string, CatalogEntity[]>()
    for (const e of catalog) {
      if (HIDDEN_CATEGORY_IDS.has(e.categoryId)) continue
      const arr = map.get(e.category) ?? []
      arr.push(e)
      map.set(e.category, arr)
    }
    return Array.from(map.entries()).sort((a, b) => {
      const orderA = a[1][0]?.categoryOrder ?? 'zzz'
      const orderB = b[1][0]?.categoryOrder ?? 'zzz'
      return orderA.localeCompare(orderB)
    })
  }, [catalog])

  const [activeCategory, setActiveCategory] = useState<string | null>(null)

  if (!pickerTarget) return null

  const isSearching = query.trim().length > 0
  const searchResults = isSearching
    ? catalog.filter((e) => e.label.toLowerCase().includes(query.toLowerCase()))
    : []

  const category = activeCategory ?? categories[0]?.[0] ?? null

  const currentItemsGrouped = (() => {
    const items = category
      ? categories.find(([name]) => name === category)?.[1] ?? []
      : []

    const bySubgroup = new Map<string, CatalogEntity[]>()
    for (const item of items) {
      const arr = bySubgroup.get(item.subgroup) ?? []
      arr.push(item)
      bySubgroup.set(item.subgroup, arr)
    }

    return Array.from(bySubgroup.entries())
      .sort((a, b) => (a[1][0]?.subgroupOrder ?? 'zzz').localeCompare(b[1][0]?.subgroupOrder ?? 'zzz'))
      .map(([subgroup, subItems]) => [
        subgroup,
        [...subItems].sort((a, b) => a.itemOrder.localeCompare(b.itemOrder)),
      ] as [string, CatalogEntity[]])
  })()

  function pick(entity: CatalogEntity) {
    assignSlot(pickerTarget!.rowIndex, pickerTarget!.slotIndex, {
      kind: 'entity',
      typeId: entity.typeId,
      type: entity.type,
      icon: entity.entitySprite ?? entity.icon,
      label: entity.label,
      width: entity.width,
      height: entity.height,
      craftingCategories: entity.craftingCategories ?? undefined,
      moduleSlots: entity.moduleSlots,
    })
    closePicker()
  }

  return (
    <div className="picker-overlay" onClick={closePicker}>
      <div className="picker-modal" onClick={(e) => e.stopPropagation()}>
        <div className="grid-menu">
          <div className="gm-header">
            <span className="gm-title">Выбрать сущность для слота</span>
            <button className="gm-icon-btn" onClick={closePicker}>✕</button>
          </div>
          <div className="gm-search-row">
            <input
              className="gm-search-input"
              placeholder="Поиск сущности…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              autoFocus
            />
          </div>
          {!isSearching && (
            <div className="gm-categories">
              {categories.map(([name, items]) => (
                <div
                  key={name}
                  className={`gm-cat-cell${name === category ? ' active' : ''}`}
                  title={name}
                  onClick={() => setActiveCategory(name)}
                >
                  <img src={items[0].categoryIcon} alt={name} />
                </div>
              ))}
            </div>
          )}
          <div className="gm-body">
            {isSearching ? (
              <div className="gm-grid">
                {searchResults.map((e) => (
                  <div
                    key={e.typeId}
                    className="gm-cell"
                    title={e.label}
                    onClick={() => pick(e)}
                  >
                    <img src={e.icon} alt={e.label} />
                  </div>
                ))}
                {searchResults.length === 0 && <div className="gm-empty">Ничего не найдено</div>}
              </div>
            ) : (
              <div className="gm-rows">
                {currentItemsGrouped.map(([subgroup, items]) => (
                  <div className="gm-row" key={subgroup}>
                    {items.map((e) => (
                      <div
                        key={e.typeId}
                        className="gm-cell"
                        title={e.label}
                        onClick={() => pick(e)}
                      >
                        <img src={e.icon} alt={e.label} />
                      </div>
                    ))}
                  </div>
                ))}
                {currentItemsGrouped.length === 0 && <div className="gm-empty">Ничего не найдено</div>}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}