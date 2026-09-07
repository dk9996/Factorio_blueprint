import type { PlacedEntity } from '../../store/canvasStore'
import type { CatalogEntity } from '../../store/entityCatalogStore'

interface Props {
  entity: PlacedEntity
  catalogEntry: CatalogEntity | undefined
  onClose: () => void
}

export function MiningDrillInfoPanel({ entity, catalogEntry, onClose }: Props) {
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

        {/* TODO(симуляция): под буром нет данных о реальном месторождении
            (тайлы карты не смоделированы) — статус и добываемый ресурс
            станут настоящими, когда появится модель ресурсных пятен. */}
        <div className="mm-warning">
          <span className="mm-warning-dot" />
          Требуется ресурс под буром
        </div>

        <div className="mm-preview">
          <img src={entity.icon} alt={entity.label} />
        </div>

        <div className="mm-recipe-row">
          <div className="mm-progress-track">
            <div className="mm-progress-fill" style={{ width: '0%' }} />
            <span className="mm-progress-label">0%</span>
          </div>
          <div className="mm-slot mm-output-slot mm-slot-empty" title="Добываемый ресурс">
            <span className="mm-slot-fallback">?</span>
          </div>
        </div>

        {typeof catalogEntry?.miningSpeed === 'number' && (
          <div className="ins-status-waiting" style={{ padding: '0 14px 10px' }}>
            Скорость добычи: {catalogEntry.miningSpeed}
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
