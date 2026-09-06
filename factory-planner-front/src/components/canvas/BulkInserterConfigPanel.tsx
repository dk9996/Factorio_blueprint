import type { PlacedEntity } from '../../store/canvasStore'
import { useCanvasStore } from '../../store/canvasStore'

interface Props {
  entity: PlacedEntity
}

const GRID_COLS = 6
const GRID_ROWS = 6
const HOME_COL = 2
const HOME_ROW = 3

const OFFSET_COLS = 3
const OFFSET_ROWS = 2

interface CellPos {
  col: number
  row: number
}

function GridPicker({
  arrow,
  selected,
  onPick,
}: {
  arrow: '▲' | '▼'
  selected: CellPos | null
  onPick: (pos: CellPos) => void
}) {
  const cells = []
  for (let row = 0; row < GRID_ROWS; row++) {
    for (let col = 0; col < GRID_COLS; col++) {
      const isHome = col === HOME_COL && row === HOME_ROW
      const isSelected = selected?.col === col && selected?.row === row
      cells.push(
        <div
          key={`${row}-${col}`}
          className={`bulk-cfg-cell${isHome ? ' home' : ''}${isSelected ? ' selected' : ''}`}
          onClick={() => !isHome && onPick({ col, row })}
        >
          {isHome && <span className="bulk-cfg-home-icon">🦾</span>}
          {isSelected && <span className="bulk-cfg-arrow">{arrow}</span>}
        </div>,
      )
    }
  }
  return <div className="bulk-cfg-grid">{cells}</div>
}

// Доп. интерфейс, который "подключает" мод, добавляющий манипулятору
// подробную настройку зоны забора/выгрузки (см. скриншот с "Drop lane" +
// "Конфигурация массовый манипулятор"). Рисуется рядом с базовой панелью
// манипулятора (InserterInfoPanel), а не вместо неё.
export function BulkInserterConfigPanel({ entity }: Props) {
  const updateEntityConfig = useCanvasStore((s) => s.updateEntityConfig)
  const config = entity.config ?? {}
  const dropLane = (config.dropLane as 'near' | 'far') ?? 'near'
  const pickupOffset = (config.bulkPickupOffset as CellPos | undefined) ?? null
  const dropOffset = (config.bulkDropOffset as CellPos | undefined) ?? null
  const lateralOffset = (config.bulkLateralOffset as CellPos | undefined) ?? null

  return (
    <div className="bulk-cfg-panel">
      <div className="mm-titlebar">
        <span className="mm-titlebar-name">Drop lane</span>
      </div>
      <div className="bulk-cfg-droplane-row">
        <span className={dropLane === 'near' ? 'active' : undefined}>Near</span>
        <button
          className={`ins-toggle${dropLane === 'far' ? ' on' : ''}`}
          onClick={() => updateEntityConfig(entity.id, { dropLane: dropLane === 'near' ? 'far' : 'near' })}
        >
          <span className="ins-toggle-knob" />
        </button>
        <span className={dropLane === 'far' ? 'active' : undefined}>Far</span>
      </div>

      <div className="mm-titlebar">
        <span className="mm-titlebar-name">Конфигурация {entity.label}</span>
      </div>

      <div className="bulk-cfg-grids-row">
        <div className="bulk-cfg-col">
          <div className="bulk-cfg-col-title">Принимающая часть.</div>
          <GridPicker
            arrow="▲"
            selected={pickupOffset}
            onPick={(pos) => updateEntityConfig(entity.id, { bulkPickupOffset: pos })}
          />
        </div>
        <div className="bulk-cfg-col">
          <div className="bulk-cfg-col-title">Выгружающая часть.</div>
          <GridPicker
            arrow="▼"
            selected={dropOffset}
            onPick={(pos) => updateEntityConfig(entity.id, { bulkDropOffset: pos })}
          />
        </div>
        <div className="bulk-cfg-offset-col">
          <div className="bulk-cfg-col-title">Смещение.</div>
          <div className="bulk-cfg-offset-grid">
            {Array.from({ length: OFFSET_ROWS }).map((_, row) =>
              Array.from({ length: OFFSET_COLS }).map((_, col) => {
                const isSelected = lateralOffset?.col === col && lateralOffset?.row === row
                return (
                  <div
                    key={`${row}-${col}`}
                    className={`bulk-cfg-offset-cell${isSelected ? ' selected' : ''}`}
                    onClick={() => updateEntityConfig(entity.id, { bulkLateralOffset: { col, row } })}
                  >
                    {isSelected && '✓'}
                  </div>
                )
              }),
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
