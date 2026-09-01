import { useRef } from 'react'
import type { PlacedEntity } from '../../store/canvasStore'
import { useCanvasStore } from '../../store/canvasStore'

interface Props {
  entity: PlacedEntity
  selected: boolean
  onSelect: (shiftKey: boolean) => void
}

export function EntityNode({ entity, selected, onSelect }: Props) {
  const moveEntityLive = useCanvasStore((s) => s.moveEntityLive)
  const commitMove = useCanvasStore((s) => s.commitMove)
  const dragRef = useRef<{ startX: number; startY: number; origX: number; origY: number; moved: boolean } | null>(null)

  function handleMouseDown(e: React.MouseEvent) {
    e.stopPropagation()
    dragRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      origX: entity.x,
      origY: entity.y,
      moved: false,
    }
    window.addEventListener('mousemove', handleMouseMove)
    window.addEventListener('mouseup', handleMouseUp)
  }

  function handleMouseMove(e: MouseEvent) {
    if (!dragRef.current) return
    const dx = e.clientX - dragRef.current.startX
    const dy = e.clientY - dragRef.current.startY
    if (Math.abs(dx) > 2 || Math.abs(dy) > 2) dragRef.current.moved = true
    moveEntityLive(entity.id, dragRef.current.origX + dx, dragRef.current.origY + dy)
  }

  function handleMouseUp(e: MouseEvent) {
    if (dragRef.current) {
      if (dragRef.current.moved) {
        commitMove(entity.id, dragRef.current.origX, dragRef.current.origY)
      } else {
        onSelect(e.shiftKey)
      }
    }
    dragRef.current = null
    window.removeEventListener('mousemove', handleMouseMove)
    window.removeEventListener('mouseup', handleMouseUp)
  }

  const classNames = [
    'entity',
    selected ? 'e-selected' : '',
    entity.bottleneck ? 'e-bottleneck' : '',
  ]
    .filter(Boolean)
    .join(' ')

  return (
    <div
      className={classNames}
      data-entity-id={entity.id}
      style={{
        left: entity.x,
        top: entity.y,
        width: entity.width,
        height: entity.height,
      }}
      onMouseDown={handleMouseDown}
      onClick={(e) => e.stopPropagation()}
    >
      <img src={entity.icon} alt={entity.label} className="entity-sprite" />
      {selected && (
        <div className="dim-tag" style={{ top: -24, left: 0 }}>
          {entity.width / 32} × {entity.height / 32}
        </div>
      )}
    </div>
  )
}