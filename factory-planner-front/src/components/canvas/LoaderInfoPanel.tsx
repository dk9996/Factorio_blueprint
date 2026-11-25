import { EntityTitle } from './EntityTitle'
import { EntityPreview } from './EntityPreview'
import { EntityQuality } from './EntityQuality'
import type { PlacedEntity } from '../../store/canvasStore'
import { useUiStore } from '../../store/uiStore'

interface Props {
  entity: PlacedEntity
  filterCount: number
  onClose: () => void
}

export function LoaderInfoPanel({ entity, onClose }: Props) {
  return (
    <div
      className="machine-modal-overlay"
      onClick={(e) => {
        // второй клик двойного клика по сущности — сразу окно настроек
        onClose()
        if (e.detail >= 2) useUiStore.getState().openEntitySettings([entity.id])
      }}
    >
      <div className="machine-modal ins-modal" onClick={(e) => e.stopPropagation()}>
        <div className="mm-titlebar">
          <EntityTitle entity={entity} />
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
          <EntityPreview entity={entity} />
        </div>
        <EntityQuality entity={entity} />

        <button
          className="ie-btn es-panel-btn"
          onClick={() => { onClose(); useUiStore.getState().openEntitySettings([entity.id]) }}
        >
          ⚙ Настройки: фильтры, размер стака…
        </button>
      </div>
    </div>
  )
}
