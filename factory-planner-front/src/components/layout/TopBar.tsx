import { useFactoryStore } from '../../store/factoryStore'
import { useUiStore } from '../../store/uiStore'
import { placeTestEntitiesRow } from '../../lib/testLayout'
import { TEST_ENTITY_TYPE_IDS } from '../../testEntities'

export function TopBar() {
  const activeId = useFactoryStore((s) => s.activeId)
  const factories = useFactoryStore((s) => s.factories)
  const active = factories.find((f) => f.id === activeId)
  const selectionToolActive = useUiStore((s) => s.selectionToolActive)
  const toggleSelectionTool = useUiStore((s) => s.toggleSelectionTool)

  return (
    <div className="topbar">
      <div className="logo">⛭ FACTORY PLANNER</div>
      <div className="breadcrumb">
        Заводы / <b>{active ? active.name : 'не выбрано'}</b>
      </div>
      <div className="spacer" />
      <button
        className="select-tool-btn"
        onClick={() => placeTestEntitiesRow(TEST_ENTITY_TYPE_IDS)}
        title="Открыть новый чертёж и разложить в ряд сущности из src/testEntities.ts — для быстрой проверки спрайтов после пересборки"
      >
        🧪 Тест
      </button>
      <button
        className={`select-tool-btn${selectionToolActive ? ' active' : ''}`}
        onClick={toggleSelectionTool}
        title="Инструмент выделения: клик и рамка выделяют сущности. Перемещение, ПКМ-удержание-удаление и Shift-копирование/вставка рецепта работают вне зависимости от него."
      >
        ⬚ Выделение
      </button>
      <div className="sim-status">
        <span className="dot" /> симуляция актуальна · 60 тик/с
      </div>
    </div>
  )
}