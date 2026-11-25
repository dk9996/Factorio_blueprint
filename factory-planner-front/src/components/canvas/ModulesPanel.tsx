import { EntityTitle } from './EntityTitle'
import { EntityPreview } from './EntityPreview'
import { EntityQuality } from './EntityQuality'
import type { PlacedEntity } from '../../store/canvasStore'
import type { CatalogEntity as CatalogEntry } from '../../store/entityCatalogStore'
import { ModuleSlots } from './ModuleSlots'

interface Props {
  entity: PlacedEntity
  catalogEntry: CatalogEntry | undefined
  onClose: () => void
}

// Общая панель для сущностей со слотами модулей, у которых нет своей
// панели (маяк, сельхозбашня и т.п.) — без списка по именам: попадает
// сюда всё, у чего moduleSlots > 0 и нет специальной панели/рецептов.
export function ModulesPanel({ entity, catalogEntry, onClose }: Props) {
  return (
    <div className="machine-modal-overlay" onClick={onClose}>
      <div className="machine-modal" onClick={(e) => e.stopPropagation()}>
        <div className="mm-titlebar">
          <EntityTitle entity={entity} />
          <div className="mm-titlebar-actions">
            <button className="mm-close-btn" onClick={onClose} title="Закрыть">✕</button>
          </div>
        </div>
        <div className="mm-preview" style={{ height: 150 }}>
          <EntityPreview entity={entity} />
        </div>
        <EntityQuality entity={entity} />
        <ModuleSlots entity={entity} catalogEntry={catalogEntry} />
      </div>
    </div>
  )
}
