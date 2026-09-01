import { useTabsStore } from '../../store/tabsStore'

export function TabsBar() {
  const tabs = useTabsStore((s) => s.tabs)
  const activeTabId = useTabsStore((s) => s.activeTabId)
  const switchTab = useTabsStore((s) => s.switchTab)
  const closeTab = useTabsStore((s) => s.closeTab)
  const openBlankTab = useTabsStore((s) => s.openBlankTab)
  const isTabDirty = useTabsStore((s) => s.isTabDirty)

  function handleClose(e: React.MouseEvent, tabId: string) {
    e.stopPropagation()
    if (isTabDirty(tabId)) {
      const ok = window.confirm(
        'В этой вкладке есть несохранённые изменения. Закрыть без сохранения?',
      )
      if (!ok) return
    }
    closeTab(tabId)
  }

  return (
    <div className="tabs-bar">
      {tabs.map((tab) => {
        const dirty = isTabDirty(tab.id)
        return (
          <div
            key={tab.id}
            className={`tab-item${tab.id === activeTabId ? ' active' : ''}`}
            onClick={() => switchTab(tab.id)}
          >
            {dirty && <span className="tab-dirty-dot" title="Есть несохранённые изменения" />}
            <span className="tab-title">{tab.title}</span>
            <button className="tab-close" onClick={(e) => handleClose(e, tab.id)}>
              ✕
            </button>
          </div>
        )
      })}
      <button className="tab-add" onClick={openBlankTab} title="Новая вкладка">
        +
      </button>
    </div>
  )
}