import type { PlacedEntity } from '../../store/canvasStore'
import type { CatalogEntity } from '../../store/entityCatalogStore'

interface Props {
  entity: PlacedEntity
  catalogEntry: CatalogEntity | undefined
  onClose: () => void
}

export function LabInfoPanel({ entity, catalogEntry, onClose }: Props) {
  const moduleSlots = entity.moduleSlots ?? catalogEntry?.moduleSlots ?? 0

  return (
    <div className="machine-modal-overlay" onClick={onClose}>
      <div className="machine-modal" onClick={(e) => e.stopPropagation()}>
        <div className="mm-titlebar">
          <span className="mm-titlebar-name">{entity.label}</span>
          <div className="mm-titlebar-actions">
            <button className="mm-icon-btn" title="Связи">🔗</button>
            <button className="mm-close-btn" onClick={onClose} title="Закрыть">✕</button>
          </div>
        </div>

        {/* TODO(симуляция): дерева технологий/текущего исследования в
            приложении пока нет — колбы науки и прогресс появятся вместе
            с этим механизмом. */}
        <div className="mm-warning">
          <span className="mm-warning-dot" />
          Нет активного исследования
        </div>

        <div className="mm-preview">
          <img src={entity.icon} alt={entity.label} />
        </div>

        <div className="mm-recipe-row">
          <div className="mm-progress-track">
            <div className="mm-progress-fill" style={{ width: '0%' }} />
            <span className="mm-progress-label">0%</span>
          </div>
        </div>

        {typeof catalogEntry?.researchingSpeed === 'number' && (
          <div className="ins-status-waiting" style={{ padding: '0 14px 10px' }}>
            Скорость исследования: {catalogEntry.researchingSpeed}
          </div>
        )}

        {moduleSlots > 0 && (
          <div className="mm-module-row">
            {Array.from({ length: moduleSlots }).map((_, i) => (
              <div key={i} className="mm-slot mm-module-slot" />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
