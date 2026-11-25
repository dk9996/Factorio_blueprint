import { useEffect, useLayoutEffect, useRef, useState } from 'react'

interface Props {
  anchorRect: DOMRect
  onClose: () => void
  onOpen: () => void
  onRename: () => void
  onDuplicate: () => void
  onExport: () => void
  onSettings: () => void
  onDelete: () => void
}

const MENU_WIDTH = 190
const MARGIN = 8

/**
 * Выпадающее меню карточки проекта (⋯). Паттерн клика снаружи — как у
 * SettingsPanel.tsx (прозрачный fixed-оверлей + stopPropagation на самом
 * меню), плюс свой Escape/стрелки и clamp к границам экрана по реальным
 * размерам после первого рендера (см. useLayoutEffect ниже).
 */
export function ProjectCardMenu({ anchorRect, onClose, onOpen, onRename, onDuplicate, onExport, onSettings, onDelete }: Props) {
  const menuRef = useRef<HTMLDivElement>(null)
  const [style, setStyle] = useState<{ top: number; left: number }>(() => ({
    top: anchorRect.bottom + 4,
    left: Math.min(anchorRect.right - MENU_WIDTH, window.innerWidth - MENU_WIDTH - MARGIN),
  }))

  useLayoutEffect(() => {
    const el = menuRef.current
    if (!el) return
    const rect = el.getBoundingClientRect()
    let top = anchorRect.bottom + 4
    let left = anchorRect.right - rect.width
    if (top + rect.height > window.innerHeight - MARGIN) {
      top = Math.max(MARGIN, anchorRect.top - rect.height - 4)
    }
    left = Math.min(Math.max(left, MARGIN), window.innerWidth - rect.width - MARGIN)
    top = Math.min(Math.max(top, MARGIN), window.innerHeight - rect.height - MARGIN)
    setStyle({ top, left })
    const first = el.querySelector<HTMLButtonElement>('button')
    first?.focus()
  }, [anchorRect])

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        e.stopPropagation()
        onClose()
        return
      }
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault()
        const el = menuRef.current
        if (!el) return
        const items = Array.from(el.querySelectorAll<HTMLButtonElement>('button'))
        const idx = items.indexOf(document.activeElement as HTMLButtonElement)
        const next = e.key === 'ArrowDown' ? (idx + 1) % items.length : (idx - 1 + items.length) % items.length
        items[next]?.focus()
      }
    }
    document.addEventListener('keydown', handleKeyDown, true)
    return () => document.removeEventListener('keydown', handleKeyDown, true)
  }, [onClose])

  function item(label: string, onClick: () => void, danger = false) {
    return (
      <button
        className={`pcm-item${danger ? ' danger' : ''}`}
        onClick={(e) => {
          e.stopPropagation()
          onClick()
        }}
      >
        {label}
      </button>
    )
  }

  return (
    <div className="pcm-overlay" onClick={(e) => { e.stopPropagation(); onClose() }}>
      <div
        ref={menuRef}
        className="pcm-menu"
        style={{ top: style.top, left: style.left, width: MENU_WIDTH }}
        onClick={(e) => e.stopPropagation()}
        role="menu"
      >
        {item('Открыть / Редактировать', onOpen)}
        {item('Переименовать', onRename)}
        {item('Дублировать', onDuplicate)}
        {item('Экспортировать', onExport)}
        {item('Настройки', onSettings)}
        {item('Удалить', onDelete, true)}
      </div>
    </div>
  )
}
