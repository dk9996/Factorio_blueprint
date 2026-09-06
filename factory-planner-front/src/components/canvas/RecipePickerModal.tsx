import { useMemo, useState } from 'react'
import { useRecipeCatalogStore } from '../../store/recipeCatalogStore'
import type { Recipe } from '../../lib/api/recipes'
import { isBlankIcon } from '../../lib/api/client'

interface Props {
  craftingCategories: string[]
  onPick: (recipeName: string) => void
  onClose: () => void
}

export function RecipePickerModal({ craftingCategories, onPick, onClose }: Props) {
  const recipes = useRecipeCatalogStore((s) => s.recipes)
  const [query, setQuery] = useState('')

    const availableRecipes = useMemo(
    () =>
      recipes.filter(
        (r) =>
          !r.hidden &&
          craftingCategories.includes(r.category) &&
          !isBlankIcon(r.icon),
      ),
    [recipes, craftingCategories],
  )

  const categories = useMemo(() => {
    const map = new Map<string, Recipe[]>()
    for (const r of availableRecipes) {
      const arr = map.get(r.displayCategory) ?? []
      arr.push(r)
      map.set(r.displayCategory, arr)
    }
    return Array.from(map.entries()).sort((a, b) => {
      const orderA = a[1][0]?.displayCategoryOrder ?? 'zzz'
      const orderB = b[1][0]?.displayCategoryOrder ?? 'zzz'
      return orderA.localeCompare(orderB)
    })
  }, [availableRecipes])

  const [activeCategory, setActiveCategory] = useState<string | null>(
    categories[0]?.[0] ?? null,
  )

  const isSearching = query.trim().length > 0
  const searchResults = isSearching
    ? availableRecipes.filter((r) => r.label.toLowerCase().includes(query.toLowerCase()))
    : []

  const currentItemsGrouped = useMemo(() => {
    const items = activeCategory
      ? categories.find(([name]) => name === activeCategory)?.[1] ?? []
      : []

    const bySubgroup = new Map<string, Recipe[]>()
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
      ] as [string, Recipe[]])
  }, [activeCategory, categories])

  return (
    <div className="picker-overlay" onClick={onClose}>
      <div
        className="picker-modal recipe-picker-modal"
        onClick={(e) => e.stopPropagation()}
        onWheel={(e) => e.stopPropagation()}
      >
        <div className="grid-menu">
          <div className="gm-header">
            <span className="gm-title">Выберите рецепт для сборки</span>
            <button className="gm-icon-btn" onClick={onClose}>✕</button>
          </div>
          <div className="gm-search-row">
            <input
              className="gm-search-input"
              placeholder="Поиск рецепта…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              autoFocus
            />
          </div>
          {!isSearching && categories.length > 1 && (
            <div className="gm-categories">
              {categories.map(([name, items]) => (
                <div
                  key={name}
                  className={`gm-cat-cell${name === activeCategory ? ' active' : ''}`}
                  title={name}
                  onClick={() => setActiveCategory(name)}
                >
                  {items[0]?.displayCategoryIcon && (
                    <img src={items[0].displayCategoryIcon} alt={name} />
                  )}
                </div>
              ))}
            </div>
          )}
          <div className="gm-body">
            {isSearching ? (
              <div className="gm-grid">
                {searchResults.map((r) => (
                  <div key={r.name} className="gm-cell" title={r.label} onClick={() => onPick(r.name)}>
                    {r.icon && !isBlankIcon(r.icon) && <img src={r.icon} alt={r.label} />}
                  </div>
                ))}
                {searchResults.length === 0 && <div className="gm-empty">Ничего не найдено</div>}
              </div>
            ) : (
              <div className="gm-rows">
                {currentItemsGrouped.map(([subgroup, items]) => (
                  <div className="gm-row" key={subgroup}>
                    {items.map((r) => (
                      <div key={r.name} className="gm-cell" title={r.label} onClick={() => onPick(r.name)}>
                        {r.icon && !isBlankIcon(r.icon) && <img src={r.icon} alt={r.label} />}
                      </div>
                    ))}
                  </div>
                ))}
                {currentItemsGrouped.length === 0 && (
                  <div className="gm-empty">
                    {availableRecipes.length === 0
                      ? 'Для этой машины нет доступных рецептов'
                      : 'Ничего не найдено'}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}