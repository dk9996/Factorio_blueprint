import type { PlacedEntity } from '../../store/canvasStore'
import type { CatalogEntity } from '../../store/entityCatalogStore'

interface Props {
  entity: PlacedEntity
  catalogEntry: CatalogEntity | undefined
  onClose: () => void
}

export function RocketSiloInfoPanel({ entity, catalogEntry, onClose }: Props) {
  const moduleSlots = entity.moduleSlots ?? catalogEntry?.moduleSlots ?? 0
  const partsRequired = catalogEntry?.rocketPartsRequired ?? null

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

        {/* TODO(симуляция): сборка частей ракеты — это по сути отдельный
            рецепт (rocket-part), который сейчас нигде не привязан к этой
            сущности. Прогресс/счётчик частей станут настоящими вместе
            с общим расчётом производства. */}
        <div className="mm-warning">
          <span className="mm-warning-dot" />
          Сборка частей ракеты не начата
        </div>

        <div className="mm-preview">
          <img src={entity.icon} alt={entity.label} />
        </div>

        <div className="ins-status-waiting" style={{ padding: '0 14px 6px' }}>
          Частей ракеты собрано: 0{partsRequired ? ` / ${partsRequired}` : ''}
        </div>

        <div className="mm-recipe-row">
          <div className="mm-progress-track">
            <div className="mm-progress-fill" style={{ width: '0%' }} />
            <span className="mm-progress-label">0%</span>
          </div>
        </div>

        <div style={{ padding: '4px 14px 14px' }}>
          <button className="select-tool-btn" disabled title="Недоступно — части ракеты не собраны">
            🚀 Запустить ракету
          </button>
        </div>

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
