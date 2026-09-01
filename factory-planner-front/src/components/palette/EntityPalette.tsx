import { useMemo, useState } from 'react'
import { useEntityCatalogStore, type CatalogEntity } from '../../store/entityCatalogStore'
import { useCanvasStore } from '../../store/canvasStore'
import { useUiStore } from '../../store/uiStore'

export function EntityPalette() {
  const catalog = useEntityCatalogStore((s) => s.entities)
  const loading = useEntityCatalogStore((s) => s.loading)
  const error = useEntityCatalogStore((s) => s.error)
  const setPlacing = useCanvasStore((s) => s.setPlacing)
  const placing = useCanvasStore((s) => s.placing)
  const sidebarCollapsed = useUiStore((s) => s.sidebarCollapsed)
  const toggleSidebar = useUiStore((s) => s.toggleSidebar)

  const [searchOpen, setSearchOpen] = useState(false)
  const [query, setQuery] = useState('')

    const categories = useMemo(() => {
    const map = new Map<string, CatalogEntity[]>()
    for (const e of catalog) {
      const arr = map.get(e.category) ?? []
      arr.push(e)
      map.set(e.category, arr)
    }
    // сортируем категории в игровом порядке (categoryOrder), а не как попало
    return Array.from(map.entries()).sort((a, b) => {
      const orderA = a[1][0]?.categoryOrder ?? 'zzz'
      const orderB = b[1][0]?.categoryOrder ?? 'zzz'
      return orderA.localeCompare(orderB)
    })
  }, [catalog])

  const [activeCategory, setActiveCategory] = useState<string | null>(
    categories[0]?.[0] ?? null,
  )

  const isSearching = query.trim().length > 0
  const searchResults = isSearching
    ? catalog.filter((e) => e.label.toLowerCase().includes(query.toLowerCase()))
    : []
  const currentItems = activeCategory
    ? categories.find(([name]) => name === activeCategory)?.[1] ?? []
    : []
  const itemsToShow = isSearching ? searchResults : currentItems

  const activeTypeId =
    placing?.items.length === 1 ? placing.items[0].typeId : null

  function pick(entity: CatalogEntity) {
    setPlacing(
      activeTypeId === entity.typeId
        ? null
        : {
            items: [
              {
                typeId: entity.typeId,
                icon: entity.icon,
                label: entity.label,
                width: entity.width,
                height: entity.height,
                offsetX: 0,
                offsetY: 0,
              },
            ],
          },
    )
  }

  function handleDragStart(e: React.DragEvent, entity: CatalogEntity) {
    e.dataTransfer.setData(
      'application/x-hotbar-item',
      JSON.stringify({ kind: 'entity', typeId: entity.typeId, icon: entity.icon, label: entity.label, width: entity.width, height: entity.height }),
    )
  }

  return (
    <>
      <div
        className={`sidebar-collapse-tab${sidebarCollapsed ? ' collapsed' : ''}`}
        onClick={toggleSidebar}
      >
        {sidebarCollapsed ? '‹' : '›'}
      </div>
      <div className={`factory-sidebar${sidebarCollapsed ? ' collapsed' : ''}`}>
        <div className="grid-menu">
          <div className="gm-header">
            <span className="gm-title">Сущности</span>
            <button className="gm-icon-btn" onClick={() => setSearchOpen((v) => !v)}>🔍</button>
          </div>
          {searchOpen && (
            <div className="gm-search-row">
              <input
                className="gm-search-input"
                placeholder="Поиск сущности…"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                autoFocus
              />
            </div>
          )}
          {!isSearching && (
            <div className="gm-categories">
              {categories.map(([name, items]) => (
                <div
                  key={name}
                  className={`gm-cat-cell${name === activeCategory ? ' active' : ''}`}
                  title={name}
                  onClick={() => setActiveCategory(name)}
                >
                  <img src={items[0].icon} alt={name} />
                </div>
              ))}
            </div>
          )}
          <div className="gm-body">
            {loading && <div className="gm-empty">Загрузка каталога…</div>}
            {error && (
              <div className="gm-empty" style={{ color: 'var(--bad)' }}>
                Ошибка: {error}
              </div>
            )}
            {!loading && !error && (
              <div className="gm-grid">
                {itemsToShow.map((e) => (
                  <div
                    key={e.typeId}
                    className={`gm-cell${activeTypeId === e.typeId ? ' active' : ''}`}
                    title={e.label}
                    draggable
                    onDragStart={(ev) => handleDragStart(ev, e)}
                    onClick={() => pick(e)}
                  >
                    <img src={e.icon} alt={e.label} />
                  </div>
                ))}
                {itemsToShow.length === 0 && <div className="gm-empty">Ничего не найдено</div>}
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  )
}