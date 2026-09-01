import { useMemo, useState } from 'react'
import { useFactoryStore, type Factory } from '../../store/factoryStore'
import { useUiStore } from '../../store/uiStore'
import { FactoryListItem } from './FactoryListItem'
import { useCanvasStore } from '../../store/canvasStore'
import { useTabsStore } from '../../store/tabsStore'
import { buildPlacingGroupFromEntities } from '../../lib/clipboard/buildPlacingGroup'

export function FactoryList() {
  const setPlacing = useCanvasStore((s) => s.setPlacing)
  const openFactoryTab = useTabsStore((s) => s.openFactoryTab)

  function startPlacingFactory(factory: Factory) {
    if (factory.entities.length === 0) return
    const group = buildPlacingGroupFromEntities(factory.entities)
    setPlacing({ items: group })
  }

  const loading = useFactoryStore((s) => s.loading)
  const error = useFactoryStore((s) => s.error)
  const factories = useFactoryStore((s) => s.factories)
  const activeId = useFactoryStore((s) => s.activeId)
  const listCollapsed = useUiStore((s) => s.listCollapsed)
  const toggleList = useUiStore((s) => s.toggleList)

  const [query, setQuery] = useState('')

  const grouped = useMemo(() => {
    const filtered = factories.filter((f) =>
      f.name.toLowerCase().includes(query.toLowerCase()),
    )
    const groups = new Map<string, typeof filtered>()
    for (const f of filtered) {
      const arr = groups.get(f.folder) ?? []
      arr.push(f)
      groups.set(f.folder, arr)
    }
    return groups
  }, [factories, query])

  return (
    <>
      <div className={`factory-list${listCollapsed ? ' collapsed' : ''}`}>
        <div className="fl-header">
          <div className="fl-title">Мои заводы</div>
          <input
            className="fl-search"
            placeholder="Поиск по имени, тегу…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
        <div className="fl-body">
          {loading && <div className="fl-status-msg">Загрузка…</div>}
          {error && <div className="fl-status-msg fl-error">Ошибка: {error}</div>}
          {!loading && !error && factories.length === 0 && (
            <div className="fl-status-msg">Пока нет сохранённых заводов</div>
          )}
          {Array.from(grouped.entries()).map(([folder, items]) => (
            <div key={folder}>
              <div className="fl-folder">{folder}</div>
              {items.map((factory) => (
                <FactoryListItem
                  key={factory.id}
                  factory={factory}
                  active={factory.id === activeId}
                  onSingleClick={() => startPlacingFactory(factory)}
                  onDoubleClick={() => openFactoryTab(factory.id, factory.name, factory.entities)}
                />
              ))}
            </div>
          ))}
        </div>
      </div>
      <div
        className={`collapse-tab${listCollapsed ? ' collapsed' : ''}`}
        onClick={toggleList}
      >
        {listCollapsed ? '›' : '‹'}
      </div>
    </>
  )
}