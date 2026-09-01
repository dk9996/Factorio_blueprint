import { useUiStore } from '../../store/uiStore'
import { useHotbarStore } from '../../store/hotbarStore'
import { useEntityCatalogStore, type CatalogEntity } from '../../store/entityCatalogStore'
import { useMemo, useState } from 'react'

export function EntityPicker() {
  const pickerTarget = useUiStore((s) => s.pickerTarget)
  const closePicker = useUiStore((s) => s.closePicker)
  const assignSlot = useHotbarStore((s) => s.assignSlot)
  const catalog = useEntityCatalogStore((s) => s.entities)

  const [query, setQuery] = useState('')
  const [activeCategory, setActiveCategory] = useState<string | null>(null)

  const categories = useMemo(() => {
    const map = new Map<string, CatalogEntity[]>()
    for (const e of catalog) {
      const arr = map.get(e.category) ?? []
      arr.push(e)
      map.set(e.category, arr)
    }
    return Array.from(map.entries())
  }, [catalog])

  if (!pickerTarget) return null

  const isSearching = query.trim().length > 0
  const searchResults = isSearching
    ? catalog.filter((e) => e.label.toLowerCase().includes(query.toLowerCase()))
    : []
  const category = activeCategory ?? categories[0]?.[0] ?? null
  const currentItems = category
    ? categories.find(([name]) => name === category)?.[1] ?? []
    : []
  const itemsToShow = isSearching ? searchResults : currentItems

  function pick(entity: CatalogEntity) {
    assignSlot(pickerTarget!.rowIndex, pickerTarget!.slotIndex, {
      kind: 'entity',
      typeId: entity.typeId,
      icon: entity.icon,
      label: entity.label,
      width: entity.width,
      height: entity.height,
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
                  <img src={items[0].icon} alt={name} />
                </div>
              ))}
            </div>
          )}
          <div className="gm-body">
            <div className="gm-grid">
              {itemsToShow.map((e) => (
                <div
                  key={e.typeId}
                  className="gm-cell"
                  title={e.label}
                  onClick={() => pick(e)}
                >
                  <img src={e.icon} alt={e.label} />
                </div>
              ))}
              {itemsToShow.length === 0 && <div className="gm-empty">Ничего не найдено</div>}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}