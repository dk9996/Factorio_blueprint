import { useUiStore } from '../../store/uiStore'

interface Props {
  onClose: () => void
}

export function SettingsPanel({ onClose }: Props) {
  const useRealSprites = useUiStore((s) => s.useRealSprites)
  const toggleRealSprites = useUiStore((s) => s.toggleRealSprites)
  const showIoHints = useUiStore((s) => s.showIoHints)
  const toggleIoHints = useUiStore((s) => s.toggleIoHints)
  const showDirectionArrow = useUiStore((s) => s.showDirectionArrow)
  const toggleDirectionArrow = useUiStore((s) => s.toggleDirectionArrow)
  const showTileLayer = useUiStore((s) => s.showTileLayer)
  const toggleTileLayer = useUiStore((s) => s.toggleTileLayer)
  const showWireLayer = useUiStore((s) => s.showWireLayer)
  const toggleWireLayer = useUiStore((s) => s.toggleWireLayer)

  return (
    <div className="settings-panel-overlay" onClick={onClose}>
      <div className="settings-panel" onClick={(e) => e.stopPropagation()}>
        <div className="settings-panel-title">Настройки</div>
        <label className="ins-checkbox-row">
          <input type="checkbox" checked={useRealSprites} onChange={toggleRealSprites} />
          Реальные спрайты (бета)
        </label>
        <label className="ins-checkbox-row">
          <input type="checkbox" checked={showIoHints} onChange={toggleIoHints} />
          Подсказки входов/выходов
        </label>
        <label className="ins-checkbox-row">
          <input type="checkbox" checked={showTileLayer} onChange={toggleTileLayer} />
          Слой плиток
        </label>
        <label className="ins-checkbox-row">
          <input type="checkbox" checked={showWireLayer} onChange={toggleWireLayer} />
          Слой проводов
        </label>
        <label className="ins-checkbox-row">
          <input type="checkbox" checked={showDirectionArrow} onChange={toggleDirectionArrow} />
          Стрелка направления (поворот)
        </label>
      </div>
    </div>
  )
}
