import type { PlacedEntity } from '../../store/canvasStore'
import type { CatalogEntity } from '../../store/entityCatalogStore'

interface Props {
  entity: PlacedEntity
  catalogEntry: CatalogEntity | undefined
  onClose: () => void
}

export function RoboportInfoPanel({ entity, catalogEntry, onClose }: Props) {
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

        <div className="mm-preview">
          <img src={entity.icon} alt={entity.label} />
        </div>

        <div style={{ padding: '4px 14px 14px', display: 'flex', flexDirection: 'column', gap: 4 }}>
          {typeof catalogEntry?.logisticRadius === 'number' && (
            <div className="ins-status-waiting" style={{ padding: 0 }}>
              Радиус логистической сети: {catalogEntry.logisticRadius}
            </div>
          )}
          {typeof catalogEntry?.constructionRadius === 'number' && (
            <div className="ins-status-waiting" style={{ padding: 0 }}>
              Радиус стройки: {catalogEntry.constructionRadius}
            </div>
          )}
        </div>

        {/* TODO(симуляция): роботов, ремкомплектов и логистических запросов
            в приложении пока нет — слоты робопорта появятся вместе с
            моделью логистической сети. */}
        <div className="mm-module-row">
          <div className="mm-slot" title="Строительные роботы"><span className="mm-slot-fallback">🤖</span></div>
          <div className="mm-slot" title="Логистические роботы"><span className="mm-slot-fallback">📦</span></div>
          <div className="mm-slot" title="Ремонтные наборы"><span className="mm-slot-fallback">🔧</span></div>
        </div>
      </div>
    </div>
  )
}
