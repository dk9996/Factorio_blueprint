import { useMemo, useState } from 'react'
import { useFactoryStore, type Factory } from '../../store/factoryStore'

interface Props {
  title: string
  activeId?: string | null
  showStatus?: boolean
  onPick: (factory: Factory) => void
  onClose?: () => void
}

export function FactoryGrid({ title, activeId, showStatus, onPick, onClose }: Props) {
  const factories = useFactoryStore((s) => s.factories)
  const [searchOpen, setSearchOpen] = useState(false)
  const [query, setQuery] = useState('')

  const categories = useMemo(() => {
    const map = new Map<string, Factory[]>()
    for (const f of factories) {
      const arr = map.get(f.folder) ?? []
      arr.push(f)
      map.set(f.folder, arr)
    }
    return Array.from(map.entries()) // [ [folderName, Factory[]], ... ]
  }, [factories])

  const [activeCategory, setActiveCategory] = useState<string | null>(
    categories[0]?.[0] ?? null,
  )

  const currentCategoryItems = activeCategory
    ? categories.find(([name]) => name === activeCategory)?.[1] ?? []
    : []

  // при поиске — игнорируем категории, ищем по всем заводам сразу
  const isSearching = query.trim().length > 0
  const searchResults = isSearching
    ? factories.filter((f) => f.name.toLowerCase().includes(query.toLowerCase()))
    : []

  const itemsToShow = isSearching ? searchResults : currentCategoryItems

  return (
    <div className="grid-menu">
      <div className="gm-header">
        <span className="gm-title">{title}</span>
        <button
          className="gm-icon-btn"
          onClick={() => setSearchOpen((v) => !v)}
          title="Поиск"
        >
          🔍
        </button>
        {onClose && (
          <button className="gm-icon-btn" onClick={onClose} title="Закрыть">
            ✕
          </button>
        )}
      </div>

      {searchOpen && (
        <div className="gm-search-row">
          <input
            className="gm-search-input"
            placeholder="Поиск завода…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            autoFocus
          />
        </div>
      )}

      {!isSearching && (
        <div className="gm-categories">
          {categories.map(([folderName, items]) => (
            <div
              key={folderName}
              className={`gm-cat-cell${folderName === activeCategory ? ' active' : ''}`}
              title={folderName}
              onClick={() => setActiveCategory(folderName)}
            >
              {items[0] ? (
                <img src={items[0].icon} alt={folderName} />
              ) : (
                <span className="gm-cat-fallback">{folderName}</span>
              )}
            </div>
          ))}
        </div>
      )}

      <div className="gm-body">
        <div className="gm-grid">
          {itemsToShow.map((f) => (
            <div
              key={f.id}
              className={`gm-cell${f.id === activeId ? ' active' : ''}`}
              title={f.name}
              onClick={() => onPick(f)}
            >
              <img src={f.icon} alt={f.name} />
              {showStatus && (
                <div
                  className="gm-cell-status"
                  style={{ background: statusColor(f.status) }}
                />
              )}
            </div>
          ))}
          {itemsToShow.length === 0 && (
            <div className="gm-empty">Ничего не найдено</div>
          )}
        </div>
      </div>
    </div>
  )
}

function statusColor(status: 'ok' | 'warn' | 'bad'): string {
  if (status === 'ok') return 'var(--ok)'
  if (status === 'warn') return 'var(--warn)'
  return 'var(--bad)'
}