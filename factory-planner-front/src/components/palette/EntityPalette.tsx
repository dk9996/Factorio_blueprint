import { useMemo, useRef, useState } from 'react'
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
  const sidebarWidth = useUiStore((s) => s.sidebarWidth)
  const setSidebarWidth = useUiStore((s) => s.setSidebarWidth)

  const resizeRef = useRef<{ startX: number; startWidth: number } | null>(null)

  function handleResizeStart(e: React.MouseEvent) {
    e.preventDefault()
    resizeRef.current = { startX: e.clientX, startWidth: sidebarWidth }
    window.addEventListener('mousemove', handleResizeMove)
    window.addEventListener('mouseup', handleResizeEnd)
  }

  function handleResizeMove(e: MouseEvent) {
    if (!resizeRef.current) return
    // панель справа — тянем влево, чтобы увеличить ширину
    const dx = resizeRef.current.startX - e.clientX
    setSidebarWidth(resizeRef.current.startWidth + dx)
  }

  function handleResizeEnd() {
    resizeRef.current = null
    window.removeEventListener('mousemove', handleResizeMove)
    window.removeEventListener('mouseup', handleResizeEnd)
  }

  const [searchOpen, setSearchOpen] = useState(false)
  const [query, setQuery] = useState('')

    // Временно скрытые категории — данные остаются в каталоге,
  // просто не показываются в палитре. Уберём фильтр, когда понадобятся
  // (например, при подключении симуляции и обнаружении, что чего-то не хватает).
  const HIDDEN_CATEGORY_IDS = new Set([
    'enemies',       // enen
    'environment',   // envir — или как оно реально называется в твоём dump
    'effects',       // effec
    'se-spoilers',   // se-spoil
    'other',         // othe / Прочее
  ])

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

  const [activeCategory, setActiveCategory] = useState<string | null>(
    categories[0]?.[0] ?? null,
  )

  const isSearching = query.trim().length > 0
  const searchResults = isSearching
    ? catalog.filter((e) => e.label.toLowerCase().includes(query.toLowerCase()))
    : []
    const currentItemsGrouped = useMemo(() => {
    const items = activeCategory
      ? categories.find(([name]) => name === activeCategory)?.[1] ?? []
      : []

    const bySubgroup = new Map<string, CatalogEntity[]>()
    for (const item of items) {
      const arr = bySubgroup.get(item.subgroup) ?? []
      arr.push(item)
      bySubgroup.set(item.subgroup, arr)
    }

    // сортируем подгруппы по subgroupOrder, а внутри — по itemOrder
    return Array.from(bySubgroup.entries())
      .sort((a, b) => (a[1][0]?.subgroupOrder ?? 'zzz').localeCompare(b[1][0]?.subgroupOrder ?? 'zzz'))
      .map(([subgroup, subItems]) => [
        subgroup,
        [...subItems].sort((a, b) => a.itemOrder.localeCompare(b.itemOrder)),
      ] as [string, CatalogEntity[]])
  }, [activeCategory, categories])

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
                icon: entity.entitySprite ?? entity.icon,
                label: entity.label,
                width: entity.width,
                height: entity.height,
                offsetX: 0,
                offsetY: 0,
                craftingCategories: entity.craftingCategories ?? undefined,
                moduleSlots: entity.moduleSlots,
              },
            ],
          },
    )
  }

    function handleDragStart(e: React.DragEvent, entity: CatalogEntity) {
    e.dataTransfer.setData(
      'application/x-hotbar-item',
      JSON.stringify({
        kind: 'entity',
        typeId: entity.typeId,
        icon: entity.entitySprite ?? entity.icon,
        label: entity.label,
        width: entity.width,
        height: entity.height,
      }),
    )
  }

  return (
    <>
      <div
        className={`sidebar-collapse-tab${sidebarCollapsed ? ' collapsed' : ''}`}
        style={{ right: sidebarCollapsed ? 0 : sidebarWidth }}
        onClick={toggleSidebar}
      >
        {sidebarCollapsed ? '‹' : '›'}
      </div>
      <div
        className={`factory-sidebar${sidebarCollapsed ? ' collapsed' : ''}`}
        style={{ width: sidebarCollapsed ? 0 : sidebarWidth }}
      >
        {!sidebarCollapsed && (
          <div className="sidebar-resize-handle" onMouseDown={handleResizeStart} />
        )}
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
                  <img src={items[0].categoryIcon} alt={name} />
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
              <div className="gm-rows">
                {currentItemsGrouped.map(([subgroup, items]) => (
                  <div className="gm-row" key={subgroup}>
                    {items.map((e) => (
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
                  </div>
                ))}
                {currentItemsGrouped.length === 0 && <div className="gm-empty">Ничего не найдено</div>}
              </div>
            )}
            {!loading && !error && isSearching && (
              <div className="gm-grid">
                {searchResults.map((e) => (
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
                {searchResults.length === 0 && <div className="gm-empty">Ничего не найдено</div>}
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  )
}