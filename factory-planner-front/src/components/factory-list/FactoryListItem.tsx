import type { Factory } from '../../store/factoryStore'
import { BlueprintThumb } from '../common/BlueprintThumb'

interface Props {
  factory: Factory
  active: boolean
  onSingleClick: () => void
  onDoubleClick: () => void
}

export function FactoryListItem({ factory, active, onSingleClick, onDoubleClick }: Props) {
  function handleDragStart(e: React.DragEvent) {
    e.dataTransfer.setData(
      'application/x-hotbar-item',
      JSON.stringify({ kind: 'blueprint', factoryId: factory.id }),
    )
  }

  return (
    <div
      className={`fl-item${active ? ' active' : ''}`}
      onClick={onSingleClick}
      onDoubleClick={onDoubleClick}
      draggable
      onDragStart={handleDragStart}
    >
      <BlueprintThumb icons={factory.previewIcons} size={32} />
      <div className="fl-meta">
        <div className="fl-name">{factory.name}</div>
        <div className="fl-sub">
          {factory.width}×{factory.height}
        </div>
      </div>
      <div className={`fl-status ${factory.status}`} />
    </div>
  )
}