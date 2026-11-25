import { EntityTitle } from './EntityTitle'
import { EntityPreview } from './EntityPreview'
import { EntityQuality } from './EntityQuality'
import { EntityNetsBlock } from '../circuit/SimNets'
import type { ReactNode } from 'react'
import type { PlacedEntity } from '../../store/canvasStore'
import { useUiStore } from '../../store/uiStore'

interface Props {
  entity: PlacedEntity
  filterCount: number
  onClose: () => void
  // Доп. панель мод-конфигурации (например "массовый манипулятор"),
  // рисуется рядом справа, в одном ряду — см. BulkInserterConfigPanel.
  extra?: ReactNode
}

export function InserterInfoPanel({ entity, onClose, extra }: Props) {

  return (
    <div
      className="machine-modal-overlay"
      onClick={(e) => {
        // второй клик двойного клика по сущности — сразу окно настроек
        onClose()
        if (e.detail >= 2) useUiStore.getState().openEntitySettings([entity.id])
      }}
    >
      <div className="modal-row" onClick={(e) => e.stopPropagation()}>
        <div className="machine-modal ins-modal">
          <div className="mm-titlebar">
            <EntityTitle entity={entity} />
            <div className="mm-titlebar-actions">
              <button className="mm-icon-btn" title="Поиск">🔍</button>
              <button className="mm-icon-btn" title="Связи">🔗</button>
              <button className="mm-close-btn" onClick={onClose} title="Закрыть">✕</button>
            </div>
          </div>

          {/* TODO(симуляция): статус сейчас статичная заглушка — станет
              "Работает" / "Ожидает предметы" по факту прохождения предметов
              через манипулятор, когда появится расчёт потока. */}
          <div className="mm-warning">
            <span className="mm-warning-dot" />
            Ожидает предметы
          </div>

          <div className="mm-preview">
            <EntityPreview entity={entity} />
          </div>
        <EntityQuality entity={entity} />
        <EntityNetsBlock entityId={entity.id} />

          <button
            className="ie-btn es-panel-btn"
            onClick={() => { onClose(); useUiStore.getState().openEntitySettings([entity.id]) }}
          >
            ⚙ Настройки: фильтры, размер стака…
          </button>
        </div>

        {extra}
      </div>
    </div>
  )
}
