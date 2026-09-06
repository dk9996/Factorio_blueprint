import { useMemo, useState } from 'react'
import { useDerivedItems, type DerivedItem } from '../../hooks/useDerivedItems'

interface Props {
  onPick: (itemName: string) => void
  onClose: () => void
}

export function ItemPickerModal({ onPick, onClose }: Props) {
  const items = useDerivedItems()
  const [query, setQuery] = useState('')

  const categories = useMemo(() => {
    const map = new Map<string, DerivedItem[]>()
    for (const it of items) {
      const arr = map.get(it.category) ?? []
      arr.push(it)
      map.set(it.category, arr)
    }
    return Array.from(map.entries()).sort((a, b) => {
      const orderA = a[1][0]?.categoryOrder ?? 'zzz'
      const orderB = b[1][0]?.categoryOrder ?? 'zzz'
      return orderA.localeCompare(orderB)
    })
  }, [items])

  const [activeCategory, setActiveCategory] = useState<string | null>(
    categories[0]?.[0] ?? null,
  )

  const isSearching = query.trim().length > 0
  const searchResults = isSearching
    ? items.filter((it) => it.label.toLowerCase().includes(query.toLowerCase()))
    : []

  const currentItemsGrouped = useMemo(() => {
    const list = activeCategory
      ? categories.find(([name]) => name === activeCategory)?.[1] ?? []
      : []

    const bySubgroup = new Map<string, DerivedItem[]>()
    for (const it of list) {
      const arr = bySubgroup.get(it.subgroup) ?? []
      arr.push(it)
      bySubgroup.set(it.subgroup, arr)
    }

    return Array.from(bySubgroup.entries())
      .sort((a, b) => (a[1][0]?.subgroupOrder ?? 'zzz').localeCompare(b[1][0]?.subgroupOrder ?? 'zzz'))
      .map(([subgroup, subItems]) => [
        subgroup,
        [...subItems].sort((a, b) => a.itemOrder.localeCompare(b.itemOrder)),
      ] as [string, DerivedItem[]])
  }, [activeCategory, categories])

  return (
    <div className="picker-overlay" onClick={onClose}>
      <div
        className="picker-modal"
        onClick={(e) => e.stopPropagation()}
        onWheel={(e) => e.stopPropagation()}
      >
        <div className="grid-menu">
          <div className="gm-header">
            <span className="gm-title">Выберите предмет для фильтра</span>
            <button className="gm-icon-btn" onClick={onClose}>✕</button>
          </div>
          <div className="gm-search-row">
            <input
              className="gm-search-input"
              placeholder="Поиск предмета…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              autoFocus
            />
          </div>
          {!isSearching && categories.length > 1 && (
            <div className="gm-categories">
              {categories.map(([name, catItems]) => (
                <div
                  key={name}
                  className={`gm-cat-cell${name === activeCategory ? ' active' : ''}`}
                  title={name}
                  onClick={() => setActiveCategory(name)}
                >
                  {catItems[0]?.categoryIcon && (
                    <img src={catItems[0].categoryIcon} alt={name} />
                  )}
                </div>
              ))}
            </div>
          )}
          <div className="gm-body">
            {isSearching ? (
              <div className="gm-grid">
                {searchResults.map((it) => (
                  <div key={it.name} className="gm-cell" title={it.label} onClick={() => onPick(it.name)}>
                    <img src={it.icon} alt={it.label} />
                  </div>
                ))}
                {searchResults.length === 0 && <div className="gm-empty">Ничего не найдено</div>}
              </div>
            ) : (
              <div className="gm-rows">
                {currentItemsGrouped.map(([subgroup, subItems]) => (
                  <div className="gm-row" key={subgroup}>
                    {subItems.map((it) => (
                      <div key={it.name} className="gm-cell" title={it.label} onClick={() => onPick(it.name)}>
                        <img src={it.icon} alt={it.label} />
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