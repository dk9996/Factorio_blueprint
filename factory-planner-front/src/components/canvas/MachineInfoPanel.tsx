import { EntityTitle } from './EntityTitle'
import { EntityPreview } from './EntityPreview'
import { EntityQuality } from './EntityQuality'
import { ItemIcon } from '../common/ItemIcon'
import { useState } from 'react'
import type { PlacedEntity } from '../../store/canvasStore'
import { useCanvasStore } from '../../store/canvasStore'
import { useRecipeCatalogStore } from '../../store/recipeCatalogStore'
import { RecipePickerModal } from './RecipePickerModal'
import { ModuleSlots } from './ModuleSlots'
import type { CatalogEntity } from '../../store/entityCatalogStore'
import { isBlankIcon } from '../../lib/api/client'

interface Props {
  entity: PlacedEntity
  catalogEntry?: CatalogEntity
  onClose: () => void
}

export function MachineInfoPanel({ entity, catalogEntry, onClose }: Props) {
  const recipes = useRecipeCatalogStore((s) => s.recipes)
  const setEntityRecipe = useCanvasStore((s) => s.setEntityRecipe)
  const [pickerOpen, setPickerOpen] = useState(false)

  const currentRecipe = recipes.find((r) => r.name === entity.recipe)
  const moduleSlots = entity.moduleSlots ?? catalogEntry?.moduleSlots ?? 0
  const hasOutput = !!currentRecipe // позже, с симуляцией, станет "выход реально произведён"

  function handlePick(recipeName: string, quality: string | undefined) {
    setEntityRecipe(entity.id, recipeName, quality ?? null)
    setPickerOpen(false)
  }

  return (
    <>
      <div className="machine-modal-overlay" onClick={onClose}>
        <div className="machine-modal" onClick={(e) => e.stopPropagation()}>
          <div className="mm-titlebar">
            <EntityTitle entity={entity} />
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
            <EntityPreview entity={entity} />
          </div>
        <EntityQuality entity={entity} />

          {/* название станка + кнопка смены рецепта справа */}
           <div className="mm-name-row">
            <div
              className="mm-product-inline"
              onClick={() => setPickerOpen(true)}
              title="Нажмите, чтобы сменить рецепт"
            >
              {currentRecipe?.icon && !isBlankIcon(currentRecipe.icon) ? (
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
                    {/* ингредиенты слева от прогресса / прогресс-бар / выход справа */}
          <div className="mm-recipe-row">
            <div className="mm-ingredients-group">
              {currentRecipe && currentRecipe.ingredients.length > 0 ? (
                currentRecipe.ingredients.map((ing) => (
                  // TODO(симуляция): пока нет расчёта потока ресурсов, слот всегда
                  // отображается как "пусто" (красный, без цифры). Когда появится
                  // реальное количество ресурса в машине — убрать mm-slot-empty-warning
                  // при amount > 0 и рендерить <span className="mm-slot-amount">{amount}</span>.
                  <div
                    key={ing.name}
                    className="mm-slot mm-ingredient-slot mm-slot-empty-warning"
                    title={ing.name}
                  >
                    {ing.icon && !isBlankIcon(ing.icon) ? (
                      // качество ингредиентов рецепта (recipeQuality) — только у
                      // предметов, у жидкостей качества нет
                      <ItemIcon
                        src={ing.icon}
                        alt={ing.name}
                        quality={ing.type === 'item' ? entity.recipeQuality : undefined}
                      />
                    ) : (
                      <span className="mm-slot-fallback">?</span>
                    )}
                  </div>
                ))
              ) : (
                <div className="mm-slot mm-ingredient-slot mm-slot-empty-warning" title="Ингредиент" />
              )}
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
          {moduleSlots > 0 && <ModuleSlots entity={entity} catalogEntry={catalogEntry} />}
        </div>
      </div>

      {pickerOpen && entity.craftingCategories && (
        <RecipePickerModal
          craftingCategories={entity.craftingCategories}
          initialQuality={entity.recipeQuality}
          onPick={handlePick}
          onClose={() => setPickerOpen(false)}
        />
      )}
    </>
  )
}