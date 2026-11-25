import { useCanvasStore } from '../../store/canvasStore'
import { useEntityCatalogStore } from '../../store/entityCatalogStore'
import { useUiStore } from '../../store/uiStore'

// Кнопки красного/зелёного провода у хотбара (инструмент схемной сети).
// Иконка — предмет red-wire / green-wire из каталога сигналов профиля, если
// он есть, иначе цветной кружок. Повторное нажатие или Esc выключает.
export function WireToolButtons() {
  const wireTool = useUiStore((s) => s.wireTool)
  const setWireTool = useUiStore((s) => s.setWireTool)
  const setPlacing = useCanvasStore((s) => s.setPlacing)
  const signals = useEntityCatalogStore((s) => s.signals.signals)

  function toggle(color: 'red' | 'green') {
    if (wireTool === color) {
      setWireTool(null)
      return
    }
    setPlacing(null) // инструмент провода и постановка из курсора взаимоисключающи
    setWireTool(color)
  }

  return (
    <div className="wire-tool-buttons">
      {(['red', 'green'] as const).map((color) => {
        const icon = signals.find((s) => s.type === 'item' && s.name === `${color}-wire`)?.icon
        return (
          <button
            key={color}
            className={`wire-tool-btn ${color}${wireTool === color ? ' active' : ''}`}
            title={color === 'red' ? 'Красный провод' : 'Зелёный провод'}
            onClick={() => toggle(color)}
          >
            {icon ? <img src={icon} alt="" /> : <span className={`wire-tool-dot ${color}`} />}
          </button>
        )
      })}
    </div>
  )
}
