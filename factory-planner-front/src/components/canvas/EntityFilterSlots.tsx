import { useState } from 'react'
import type { PlacedEntity } from '../../store/canvasStore'
import { useCanvasStore } from '../../store/canvasStore'
import { useDerivedItems } from '../../hooks/useDerivedItems'
import { ItemPickerModal } from './ItemPickerModal'

interface Props {
  entity: PlacedEntity
  filterCount: number
}

// Общий блок "Использовать фильтры / Белый-Чёрный список / N слотов" —
// одинаковый у манипулятора и у погрузчика в реальной игре.
export function EntityFilterSlots({ entity, filterCount }: Props) {
  const updateEntityConfig = useCanvasStore((s) => s.updateEntityConfig)
  const items = useDerivedItems()
  const [pickerSlot, setPickerSlot] = useState<number | null>(null)

  if (filterCount <= 0) return null

  const config = entity.config ?? {}
  const useFilters = Boolean(config.useFilters)
  const filterMode = (config.filterMode as 'whitelist' | 'blacklist') ?? 'whitelist'
  const filters = (config.filters as (string | null)[] | undefined) ?? []

  function setFilterAt(index: number, itemName: string | null) {
    const next = Array.from({ length: filterCount }, (_, i) => filters[i] ?? null)
    next[index] = itemName
    updateEntityConfig(entity.id, { filters: next })
  }

  return (
    <>
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
          {Array.from({ length: filterCount }).map((_, i) => {
            const pickedName = filters[i] ?? null
            const pickedItem = pickedName ? items.find((it) => it.name === pickedName) : undefined
            return (
              <div
                key={i}
                className="mm-slot ins-filter-slot"
                title={pickedItem?.label ?? pickedName ?? 'Выбрать предмет'}
                onClick={() => setPickerSlot(i)}
              >
                {pickedItem && <img src={pickedItem.icon} alt={pickedItem.label} />}
                {pickedItem && (
                  <button
                    className="ins-filter-slot-clear"
                    onClick={(e) => {
                      e.stopPropagation()
                      setFilterAt(i, null)
                    }}
                    title="Убрать фильтр"
                  >
                    ✕
                  </button>
                )}
              </div>
            )
          })}
        </div>
      </div>

      {pickerSlot !== null && (
        <ItemPickerModal
          onPick={(itemName) => {
            setFilterAt(pickerSlot, itemName)
            setPickerSlot(null)
          }}
          onClose={() => setPickerSlot(null)}
        />
      )}
    </>
  )
}