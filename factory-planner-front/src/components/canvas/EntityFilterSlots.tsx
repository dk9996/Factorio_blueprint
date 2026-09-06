import type { PlacedEntity } from '../../store/canvasStore'
import { useCanvasStore } from '../../store/canvasStore'

interface Props {
  entity: PlacedEntity
  filterCount: number
}

// Общий блок "Использовать фильтры / Белый-Чёрный список / N слотов" —
// одинаковый у манипулятора и у погрузчика в реальной игре.
export function EntityFilterSlots({ entity, filterCount }: Props) {
  const updateEntityConfig = useCanvasStore((s) => s.updateEntityConfig)

  if (filterCount <= 0) return null

  const config = entity.config ?? {}
  const useFilters = Boolean(config.useFilters)
  const filterMode = (config.filterMode as 'whitelist' | 'blacklist') ?? 'whitelist'

  return (
    <div className="ins-filters-row">
      <div className="ins-filters-left">
        <label className="ins-checkbox-row">
          <input
            type="checkbox"
            checked={useFilters}
            onChange={(e) => updateEntityConfig(entity.id, { useFilters: e.target.checked })}
          />
          Использовать фильтры
        </label>
        <div className="ins-filter-mode-row">
          <span className={filterMode === 'whitelist' ? 'active' : undefined}>Белый список</span>
          <button
            className={`ins-toggle${filterMode === 'blacklist' ? ' on' : ''}`}
            onClick={() =>
              updateEntityConfig(entity.id, {
                filterMode: filterMode === 'whitelist' ? 'blacklist' : 'whitelist',
              })
            }
          >
            <span className="ins-toggle-knob" />
          </button>
          <span className={filterMode === 'blacklist' ? 'active' : undefined}>Чёрный список</span>
        </div>
      </div>
      <div className="ins-filter-slots">
        {/* TODO: клик по слоту должен открывать выбор предмета — нужен отдельный
            ItemPickerModal (каталога предметов пока нет, только сущности/рецепты) */}
        {Array.from({ length: filterCount }).map((_, i) => (
          <div key={i} className="mm-slot ins-filter-slot" />
        ))}
      </div>
    </div>
  )
}
