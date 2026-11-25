import { useMemo, useState } from 'react'
import { useEntityCatalogStore, type CatalogEntity } from '../../store/entityCatalogStore'
import { useCanvasStore } from '../../store/canvasStore'
import { useUiStore, SIDEBAR_WIDTH } from '../../store/uiStore'
import { HIDDEN_CATEGORY_IDS } from '../../hiddenCategories'
import { ItemIcon } from '../common/ItemIcon'
import { QualityRow } from '../common/QualityRow'
import { storedQuality } from '../../lib/quality'
import { tilePseudoEntities } from '../../lib/tileCatalog'

export function EntityPalette() {
  const entities = useEntityCatalogStore((s) => s.entities)
  const tileDefs = useEntityCatalogStore((s) => s.tiles)
  // плитки — отдельная категория «Плитки» (type === 'tile')
  const tileItems = useMemo(() => tilePseudoEntities(tileDefs), [tileDefs])
  const loading = useEntityCatalogStore((s) => s.loading)
  const error = useEntityCatalogStore((s) => s.error)
  const setPlacing = useCanvasStore((s) => s.setPlacing)
  const placing = useCanvasStore((s) => s.placing)
  const sidebarCollapsed = useUiStore((s) => s.sidebarCollapsed)
  const toggleSidebar = useUiStore((s) => s.toggleSidebar)
  const selectedQuality = useUiStore((s) => s.selectedQuality)
  const setSelectedQuality = useUiStore((s) => s.setSelectedQuality)
  const hasQualities = useEntityCatalogStore((s) => s.qualities.length > 0)
  // качество, с которым сущность берётся в курсор (только профили с quality)
  const pickQuality = hasQualities ? storedQuality(selectedQuality) : undefined

  const [searchOpen, setSearchOpen] = useState(false)
  const [query, setQuery] = useState('')

  const categories = useMemo(() => {
    const map = new Map<string, CatalogEntity[]>()
    for (const e of entities) {
      if (HIDDEN_CATEGORY_IDS.has(e.categoryId)) continue
      const arr = map.get(e.category) ?? []
      arr.push(e)
      map.set(e.category, arr)
    }
    if (tileItems.length > 0) map.set(tileItems[0].category, tileItems)
    return Array.from(map.entries()).sort((a, b) => {
      const orderA = a[1][0]?.categoryOrder ?? 'zzz'
      const orderB = b[1][0]?.categoryOrder ?? 'zzz'
      return orderA.localeCompare(orderB)
    })
  }, [entities, tileItems])
  const catalog = useMemo(() => [...entities, ...tileItems], [entities, tileItems])

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
    placing?.items.length === 1 &&
    (placing.items[0].type === 'tile' || placing.items[0].quality === pickQuality)
      ? placing.items[0].typeId
      : null

  function pick(entity: CatalogEntity) {
    if (entity.type === 'tile') {
      // плитка: слой под сущностями, без качества/поворота/подземных механик
      const isSameTile = placing?.items.length === 1 && placing.items[0].typeId === entity.typeId
      setPlacing(
        isSameTile
          ? null
          : {
              items: [{
                typeId: entity.typeId, type: 'tile', icon: entity.icon, label: entity.label,
                width: 32, height: 32, offsetX: 0, offsetY: 0,
              }],
            },
      )
      return
    }
    setPlacing(
      activeTypeId === entity.typeId
        ? null
        : {
            items: [
              {
                typeId: entity.typeId,
                type: entity.type,          // ← добавить
                icon: entity.entitySprite ?? entity.icon,
                label: entity.label,
                width: entity.width,
                height: entity.height,
                offsetX: 0,
                offsetY: 0,
                craftingCategories: entity.craftingCategories ?? undefined,
                moduleSlots: entity.moduleSlots,
                quality: pickQuality,
              },
            ],
            // Свежий выбор из палитры — включаем двухшаговую постановку
            // подземных конвейеров/труб (см. src/lib/underground.ts).
            undergroundAutoCycle: entity.ioHints?.undergroundMaxDistance != null,
          },
    )
  }

    function handleDragStart(e: React.DragEvent, entity: CatalogEntity) {
    e.dataTransfer.setData(
      'application/x-hotbar-item',
      JSON.stringify({
        kind: 'entity',
        typeId: entity.typeId,
        type: entity.type,                      // ← добавить
        icon: entity.entitySprite ?? entity.icon,
        label: entity.label,
        width: entity.width,
        height: entity.height,
        craftingCategories: entity.craftingCategories ?? undefined, // ← добавить
        moduleSlots: entity.moduleSlots,                             // ← добавить
        quality: entity.type === 'tile' ? undefined : pickQuality,
      }),
    )
  }

  return (
    <>
      {/* Палитра по умолчанию открыта на максимальную ширину (SIDEBAR_WIDTH
          в uiStore); сворачивается кнопкой, ширину вручную не меняем */}
      <div
        className={`sidebar-collapse-tab${sidebarCollapsed ? ' collapsed' : ''}`}
        style={{ right: sidebarCollapsed ? 0 : `min(${SIDEBAR_WIDTH}px, 45vw)` }}
        onClick={toggleSidebar}
      >
        {sidebarCollapsed ? '‹' : '›'}
      </div>
      <div className={`factory-sidebar${sidebarCollapsed ? ' collapsed' : ''}`} style={{ width: sidebarCollapsed ? 0 : SIDEBAR_WIDTH }}>
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
                        <ItemIcon src={e.icon} alt={e.label} quality={e.type === 'tile' ? undefined : pickQuality} />
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
                    <ItemIcon src={e.icon} alt={e.label} quality={e.type === 'tile' ? undefined : pickQuality} />
                  </div>
                ))}
                {searchResults.length === 0 && <div className="gm-empty">Ничего не найдено</div>}
              </div>
            )}
          </div>
          <QualityRow value={selectedQuality} onChange={setSelectedQuality} />
        </div>
      </div>
    </>
  )
}