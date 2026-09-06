import type { ReactNode } from 'react'
import type { PlacedEntity } from '../../store/canvasStore'
import { useCanvasStore } from '../../store/canvasStore'
import { EntityFilterSlots } from './EntityFilterSlots'

interface Props {
  entity: PlacedEntity
  filterCount: number
  onClose: () => void
  // Доп. панель мод-конфигурации (например "массовый манипулятор"),
  // рисуется рядом справа, в одном ряду — см. BulkInserterConfigPanel.
  extra?: ReactNode
}

export function InserterInfoPanel({ entity, filterCount, onClose, extra }: Props) {
  const updateEntityConfig = useCanvasStore((s) => s.updateEntityConfig)
  const config = entity.config ?? {}
  const overrideStackSize = Boolean(config.overrideStackSize)
  const stackSizeOverride = typeof config.stackSizeOverride === 'number' ? config.stackSizeOverride : 1

  return (
    <div className="machine-modal-overlay" onClick={onClose}>
      <div className="modal-row" onClick={(e) => e.stopPropagation()}>
        <div className="machine-modal ins-modal">
          <div className="mm-titlebar">
            <span className="mm-titlebar-name">{entity.label}</span>
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
            <img src={entity.icon} alt={entity.label} />
          </div>

          <EntityFilterSlots entity={entity} filterCount={filterCount} />

          <div className="ins-stack-override">
            <label className="ins-checkbox-row">
              <input
                type="checkbox"
                checked={overrideStackSize}
                onChange={(e) => updateEntityConfig(entity.id, { overrideStackSize: e.target.checked })}
              />
              Переопределить размер пачки
            </label>
            <div className="ins-stack-row">
              <input
                type="range"
                min={1}
                max={12}
                value={stackSizeOverride}
                disabled={!overrideStackSize}
                onChange={(e) => updateEntityConfig(entity.id, { stackSizeOverride: Number(e.target.value) })}
              />
              <div className="ins-stack-value">{stackSizeOverride}</div>
            </div>
          </div>
        </div>

        {extra}
      </div>
    </div>
  )
}
