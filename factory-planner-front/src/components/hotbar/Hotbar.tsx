import { useFactoryStore } from '../../store/factoryStore'
import { useHotbarStore, type HotbarItem } from '../../store/hotbarStore'
import { useCanvasStore } from '../../store/canvasStore'
import { useUiStore } from '../../store/uiStore'
import { useTabsStore } from '../../store/tabsStore'
import { buildPlacingGroupFromEntities } from '../../lib/clipboard/buildPlacingGroup'
import { useState } from 'react'

export function Hotbar() {
  const factories = useFactoryStore((s) => s.factories)
  const rows = useHotbarStore((s) => s.rows)
  const pinnedRows = useHotbarStore((s) => s.pinnedRows)
  const setPinnedRow = useHotbarStore((s) => s.setPinnedRow)
  const assignSlot = useHotbarStore((s) => s.assignSlot)
  const placing = useCanvasStore((s) => s.placing)
  const setPlacing = useCanvasStore((s) => s.setPlacing)
  const openPicker = useUiStore((s) => s.openPicker)
  const openFactoryTab = useTabsStore((s) => s.openFactoryTab)

  const [expandedSlot, setExpandedSlot] = useState<0 | 1 | null>(null)

  function handleLabelClick(position: 0 | 1) {
    setExpandedSlot((prev) => (prev === position ? null : position))
  }

  function handleRowPick(rowIndex: number) {
    if (expandedSlot === null) return
    setPinnedRow(expandedSlot, rowIndex)
    setExpandedSlot(null)
  }

  function handleDrop(e: React.DragEvent, rowIndex: number, slotIndex: number) {
    e.preventDefault()
    const raw = e.dataTransfer.getData('application/x-hotbar-item')
    if (!raw) return
    const item: HotbarItem = JSON.parse(raw)
    assignSlot(rowIndex, slotIndex, item)
  }

  // одиночный клик — взять как призрак (и сущность, и чертёж ведут себя одинаково)
  function handleSlotClick(item: HotbarItem) {
    if (item.kind === 'entity') {
      const isSame = placing?.items.length === 1 && placing.items[0].typeId === item.typeId
      setPlacing(
        isSame
          ? null
          : { items: [{ typeId: item.typeId, icon: item.icon, label: item.label, width: item.width, height: item.height, offsetX: 0, offsetY: 0 }] },
      )
    } else {
      const factory = factories.find((f) => f.id === item.factoryId)
      if (!factory || factory.entities.length === 0) return
      const group = buildPlacingGroupFromEntities(factory.entities)
      setPlacing({ items: group })
    }
  }

  // двойной клик по чертежу в хотбаре — открыть на редактирование в отдельной вкладке
  function handleSlotDoubleClick(item: HotbarItem) {
    if (item.kind !== 'blueprint') return
    const factory = factories.find((f) => f.id === item.factoryId)
    if (!factory) return
    openFactoryTab(factory.id, factory.name, factory.entities)
  }

  function handleMiddleClick(e: React.MouseEvent, rowIndex: number, slotIndex: number) {
    if (e.button !== 1) return
    e.preventDefault()
    assignSlot(rowIndex, slotIndex, null)
  }

  function renderSlot(rowIndex: number, slotIndex: number) {
    const item = rows[rowIndex]?.[slotIndex] ?? null

    if (!item) {
      return (
        <div
          key={slotIndex}
          className="hb-slot empty"
          onClick={() => openPicker(rowIndex, slotIndex)}
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => handleDrop(e, rowIndex, slotIndex)}
        />
      )
    }

    if (item.kind === 'entity') {
      return (
        <div
          key={slotIndex}
          className={`hb-slot filled${placing?.items.length === 1 && placing.items[0].typeId === item.typeId ? ' active' : ''}`}
          title={item.label}
          onClick={() => handleSlotClick(item)}
          onMouseDown={(e) => handleMiddleClick(e, rowIndex, slotIndex)}
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => handleDrop(e, rowIndex, slotIndex)}
        >
          <img src={item.icon} alt={item.label} />
        </div>
      )
    }

    const factory = factories.find((f) => f.id === item.factoryId)
    if (!factory) return <div key={slotIndex} className="hb-slot empty" />

    return (
      <div
        key={slotIndex}
        className="hb-slot filled"
        title={`${factory.name} (чертёж) — клик: взять, 2×клик: открыть`}
        onClick={() => handleSlotClick(item)}
        onDoubleClick={() => handleSlotDoubleClick(item)}
        onMouseDown={(e) => handleMiddleClick(e, rowIndex, slotIndex)}
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => handleDrop(e, rowIndex, slotIndex)}
      >
        <img src={factory.icon} alt={factory.name} />
        <div className="hb-status" style={{ background: statusColor(factory.status) }} />
      </div>
    )
  }

  return (
    <div className="hotbar-outer">
      {expandedSlot !== null && (
        <div className="hotbar-expanded">
          {rows.map((row, idx) => (
            <div
              key={idx}
              className={`hotbar-row expanded-row${pinnedRows.includes(idx) ? ' is-pinned' : ''}`}
              onClick={() => handleRowPick(idx)}
            >
              <div className="hotbar-row-label">{idx}</div>
              <div className="hotbar-slots">
                {row.map((_, slotIndex) => renderSlot(idx, slotIndex))}
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="hotbar-wrap">
        {pinnedRows.map((rowIndex, position) => (
          <div className="hotbar-row" key={position}>
            <div
              className={`hotbar-row-label${expandedSlot === position ? ' active' : ''}`}
              onClick={() => handleLabelClick(position as 0 | 1)}
            >
              {rowIndex}
            </div>
            <div className="hotbar-slots">
              {rows[rowIndex]?.map((_, slotIndex) => renderSlot(rowIndex, slotIndex))}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

function statusColor(status: 'ok' | 'warn' | 'bad'): string {
  if (status === 'ok') return 'var(--ok)'
  if (status === 'warn') return 'var(--warn)'
  return 'var(--bad)'
}