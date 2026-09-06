import type { PlacedEntity } from '../../store/canvasStore'
import { EntityFilterSlots } from './EntityFilterSlots'

interface Props {
  entity: PlacedEntity
  filterCount: number
  onClose: () => void
}

export function LoaderInfoPanel({ entity, filterCount, onClose }: Props) {
  return (
    <div className="machine-modal-overlay" onClick={onClose}>
      <div className="machine-modal ins-modal" onClick={(e) => e.stopPropagation()}>
        <div className="mm-titlebar">
          <span className="mm-titlebar-name">{entity.label}</span>
          <div className="mm-titlebar-actions">
            <button className="mm-icon-btn" title="Связи">🔗</button>
            <button className="mm-close-btn" onClick={onClose} title="Закрыть">✕</button>
          </div>
        </div>

        {/* TODO(симуляция): "Работает"/"Остановлен" по факту потока предметов через погрузчик */}
        <div className="ins-status-ok">
          <span className="ins-status-dot" />
          Работает
        </div>

        <div className="mm-preview">
          <img src={entity.icon} alt={entity.label} />
        </div>

        <EntityFilterSlots entity={entity} filterCount={filterCount} />
      </div>
    </div>
  )
}
