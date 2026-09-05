import { useMemo, useState } from 'react'
import { useRecipeCatalogStore } from '../../store/recipeCatalogStore'
import type { Recipe } from '../../lib/api/recipes'

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
        (r) => !r.hidden && craftingCategories.includes(r.category),
      ),
    [recipes, craftingCategories],
  )

  const categories = useMemo(() => {
    const map = new Map<string, Recipe[]>()
    for (const r of availableRecipes) {
      const arr = map.get(r.category) ?? []
      arr.push(r)
      map.set(r.category, arr)
    }
    return Array.from(map.entries())
  }, [availableRecipes])

  const [activeCategory, setActiveCategory] = useState<string | null>(
    categories[0]?.[0] ?? null,
  )

  const isSearching = query.trim().length > 0
  const searchResults = isSearching
    ? availableRecipes.filter((r) => r.label.toLowerCase().includes(query.toLowerCase()))
    : []
  const currentItems = activeCategory
    ? categories.find(([name]) => name === activeCategory)?.[1] ?? []
    : []
  const itemsToShow = isSearching ? searchResults : currentItems

  return (
    <div className="picker-overlay" onClick={onClose}>
      <div className="picker-modal ie-modal" onClick={(e) => e.stopPropagation()}>
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
              {categories.map(([name]) => (
                <div
                  key={name}
                  className={`gm-cat-cell${name === activeCategory ? ' active' : ''}`}
                  title={name}
                  onClick={() => setActiveCategory(name)}
                >
                  {name}
                </div>
              ))}
            </div>
          )}
          <div className="gm-body">
            <div className="gm-grid">
              {itemsToShow.map((r) => (
                <div
                  key={r.name}
                  className="gm-cell"
                  title={r.label}
                  onClick={() => onPick(r.name)}
                >
                  {r.icon && <img src={r.icon} alt={r.label} />}
                </div>
              ))}
              {itemsToShow.length === 0 && (
                <div className="gm-empty">
                  {availableRecipes.length === 0
                    ? 'Для этой машины нет доступных рецептов'
                    : 'Ничего не найдено'}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}