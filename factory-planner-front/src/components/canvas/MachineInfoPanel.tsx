import { useState } from 'react'
import type { PlacedEntity } from '../../store/canvasStore'
import { useCanvasStore } from '../../store/canvasStore'
import { useRecipeCatalogStore } from '../../store/recipeCatalogStore'
import { RecipePickerModal } from './RecipePickerModal'

interface Props {
  entity: PlacedEntity
  onClose: () => void
}

export function MachineInfoPanel({ entity, onClose }: Props) {
  const recipes = useRecipeCatalogStore((s) => s.recipes)
  const setEntityRecipe = useCanvasStore((s) => s.setEntityRecipe)
  const [pickerOpen, setPickerOpen] = useState(false)

  const currentRecipe = recipes.find((r) => r.name === entity.recipe)
  const moduleSlots = entity.moduleSlots ?? 0
  const hasOutput = !!currentRecipe // позже, с симуляцией, станет "выход реально произведён"

  function handlePick(recipeName: string) {
    setEntityRecipe(entity.id, recipeName)
    setPickerOpen(false)
  }

  return (
    <>
      <div className="machine-modal-overlay" onClick={onClose}>
        <div className="machine-modal" onClick={(e) => e.stopPropagation()}>
          <div className="mm-titlebar">
            <span className="mm-titlebar-name">{entity.label}</span>
            <div className="mm-titlebar-actions">
              <button className="mm-icon-btn" title="Поиск">🔍</button>
              <button className="mm-icon-btn" title="Связи">🔗</button>
              <button className="mm-close-btn" onClick={onClose} title="Закрыть">✕</button>
            </div>
          </div>

          {!currentRecipe && (
            <div className="mm-warning">
              <span className="mm-warning-dot" />
              Рецепт не выбран
            </div>
          )}

          <div className="mm-preview">
            <img src={entity.icon} alt={entity.label} />
          </div>

          {/* название станка + кнопка смены рецепта справа */}
           <div className="mm-name-row">
            <div
              className="mm-product-inline"
              onClick={() => setPickerOpen(true)}
              title="Нажмите, чтобы сменить рецепт"
            >
              {currentRecipe?.icon ? (
                <img src={currentRecipe.icon} alt={currentRecipe.label} className="mm-product-icon" />
              ) : (
                <span className="mm-product-plus">+</span>
              )}
              <span className="mm-product-label">
                {currentRecipe ? currentRecipe.label : 'Выбрать рецепт'}
              </span>
            </div>
            <button className="mm-recipe-change-btn" onClick={() => setPickerOpen(true)} title="Сменить рецепт">
              ⚙
            </button>
          </div>

          {/* ингредиент слева от прогресса / прогресс-бар / выход справа */}
          <div className="mm-recipe-row">
            <div className="mm-slot mm-ingredient-slot mm-slot-empty-warning" title="Ингредиент">
              {/* иконку конкретного ингредиента добавим отдельно */}
            </div>

            <div className="mm-progress-track">
              <div className="mm-progress-fill" style={{ width: '0%' }} />
              <span className="mm-progress-label">0%</span>
            </div>

            <div className={`mm-slot mm-output-slot${!hasOutput ? ' mm-slot-empty' : ''}`} title="Результат">
              {currentRecipe?.icon && <img src={currentRecipe.icon} alt="" />}
            </div>
          </div>

          {/* модули — внизу */}
          {moduleSlots > 0 && (
            <div className="mm-module-row">
              {Array.from({ length: moduleSlots }).map((_, i) => (
                <div key={i} className="mm-slot mm-module-slot" />
              ))}
            </div>
          )}
        </div>
      </div>

      {pickerOpen && entity.craftingCategories && (
        <RecipePickerModal
          craftingCategories={entity.craftingCategories}
          onPick={handlePick}
          onClose={() => setPickerOpen(false)}
        />
      )}
    </>
  )
}