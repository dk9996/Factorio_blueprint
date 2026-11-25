import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useCanvasStore, type PlacedEntity } from '../../store/canvasStore'
import { useEntityCatalogStore, type CatalogEntity } from '../../store/entityCatalogStore'
import { useRecipeCatalogStore } from '../../store/recipeCatalogStore'
import {
  EFFECT_KEYS,
  groupAllowedModules,
  isSlotInvalid,
  normalizeSlots,
  type ModuleSlot,
  sumModuleEffects,
  type EffectKey,
  type ModuleDef,
} from '../../lib/modules'
import { isBlankIcon } from '../../lib/api/client'
import { ItemIcon } from '../common/ItemIcon'
import { QualityRow } from '../common/QualityRow'
import { storedQuality } from '../../lib/quality'

interface Props {
  entity: PlacedEntity
  catalogEntry: CatalogEntity | undefined
}

const EFFECT_LABELS: Record<EffectKey, string> = {
  speed: 'Скорость',
  productivity: 'Продуктивность',
  consumption: 'Потребление',
  pollution: 'Загрязнение',
  quality: 'Качество',
}

// Для скорости/продуктивности/качества рост — хорошо, для потребления и
// загрязнения хорошо снижение (цвет суммы в панели).
const GOOD_WHEN_POSITIVE: Record<EffectKey, boolean> = {
  speed: true, productivity: true, quality: true, consumption: false, pollution: false,
}

function formatPercent(v: number): string {
  const pct = Math.round(v * 1000) / 10
  return `${pct > 0 ? '+' : pct < 0 ? '−' : ''}${Math.abs(pct)}%`
}

export function ModuleSlots({ entity, catalogEntry }: Props) {
  const slotCount = entity.moduleSlots ?? catalogEntry?.moduleSlots ?? 0
  const modules = useEntityCatalogStore((s) => s.modules)
  const recipes = useRecipeCatalogStore((s) => s.recipes)
  const setEntityModules = useCanvasStore((s) => s.setEntityModules)
  const [openSlot, setOpenSlot] = useState<number | null>(null)
  const [anchor, setAnchor] = useState<DOMRect | null>(null)
  // Качество, с которым модуль ляжет в слот (строка внизу поповера).
  const [pickQuality, setPickQuality] = useState<string | undefined>(undefined)
  const qualities = useEntityCatalogStore((s) => s.qualities)
  const popRef = useRef<HTMLDivElement>(null)

  const modulesByName = useMemo(() => new Map<string, ModuleDef>(modules.map((m) => [m.name, m])), [modules])
  const recipe = entity.recipe ? recipes.find((r) => r.name === entity.recipe) ?? null : null
  const entityInfo = {
    moduleSlots: slotCount,
    allowedEffects: catalogEntry?.allowedEffects,
    allowedModuleCategories: catalogEntry?.allowedModuleCategories,
  }
  const slots = normalizeSlots(entity.modules, slotCount)
  const groups = useMemo(
    () => groupAllowedModules(entityInfo, recipe, modules),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [slotCount, catalogEntry, recipe, modules],
  )
  const totals = sumModuleEffects(slots, modulesByName)
  const nonZero = EFFECT_KEYS.filter((k) => Math.abs(totals[k]) > 1e-9)

  // Esc / клик вне закрывают поповер. Esc перехватываем в capture-фазе окна
  // и гасим, чтобы он не дошёл до горячих клавиш холста (снятие выделения).
  useEffect(() => {
    if (openSlot === null) return
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        e.stopImmediatePropagation()
        e.preventDefault()
        setOpenSlot(null)
      }
    }
    function onDown(e: MouseEvent) {
      if (popRef.current && !popRef.current.contains(e.target as Node)) setOpenSlot(null)
    }
    window.addEventListener('keydown', onKey, true)
    document.addEventListener('mousedown', onDown, true)
    return () => {
      window.removeEventListener('keydown', onKey, true)
      document.removeEventListener('mousedown', onDown, true)
    }
  }, [openSlot])

  if (slotCount <= 0) return null

  function commit(next: (ModuleSlot | null)[]) {
    setEntityModules(entity.id, next)
  }

  function pick(slot: number, moduleName: string, fillAll: boolean) {
    const next = [...slots]
    // качество пишется только в профилях с DLC quality
    const quality = qualities.length > 0 ? storedQuality(pickQuality) : undefined
    const value: ModuleSlot = quality ? { name: moduleName, quality } : { name: moduleName }
    next[slot] = value
    if (fillAll) {
      next.forEach((m, i) => {
        if (m === null) next[i] = value
      })
    }
    commit(next)
    setOpenSlot(null)
  }

  function clear(slot: number) {
    if (slots[slot] === null) return
    const next = [...slots]
    next[slot] = null
    commit(next)
    setOpenSlot(null)
  }

  const popLeft = anchor ? Math.min(anchor.left, window.innerWidth - 276) : 0
  const popTop = anchor ? Math.min(anchor.bottom + 6, window.innerHeight - 320) : 0

  return (
    <div className="mod-slots">
      <div className="mm-module-row" style={{ padding: '4px 14px 6px' }}>
        {slots.map((slot, i) => {
          const name = slot?.name ?? null
          const def = name ? modulesByName.get(name) : undefined
          const invalid = isSlotInvalid(entityInfo, recipe, slot, modulesByName)
          return (
            <div
              key={i}
              className={`mm-slot mm-module-slot mod-cell${invalid ? ' mod-cell-invalid' : ''}${openSlot === i ? ' mod-cell-open' : ''}`}
              title={invalid ? 'Модуль не подходит к рецепту' : def?.label ?? 'Пустой слот — клик, чтобы выбрать модуль'}
              onClick={(e) => {
                setAnchor((e.currentTarget as HTMLElement).getBoundingClientRect())
                setPickQuality(slot?.quality)
                setOpenSlot(i)
              }}
              onContextMenu={(e) => {
                e.preventDefault()
                clear(i)
              }}
            >
              {def?.icon && !isBlankIcon(def.icon) ? (
                <ItemIcon src={def.icon} alt={def.label} quality={slot?.quality} />
              ) : name ? (
                <span className="mm-slot-fallback">?</span>
              ) : null}
            </div>
          )
        })}
      </div>

      <div className="mod-totals">
        {nonZero.length === 0 ? (
          <span className="mod-totals-empty">Модули не установлены</span>
        ) : (
          nonZero.map((k) => {
            const good = GOOD_WHEN_POSITIVE[k] ? totals[k] > 0 : totals[k] < 0
            return (
              <div key={k} className="mod-total-row">
                <span>{EFFECT_LABELS[k]}</span>
                <span className={good ? 'mod-good' : 'mod-bad'}>{formatPercent(totals[k])}</span>
              </div>
            )
          })
        )}
      </div>

      {openSlot !== null && anchor &&
        createPortal(
          <div
            ref={popRef}
            className="mod-popover"
            style={{ left: popLeft, top: popTop }}
            onContextMenu={(e) => e.preventDefault()}
          >
            {groups.length === 0 ? (
              <div className="mod-popover-empty">Нет доступных модулей</div>
            ) : (
              groups.map((g) => (
                <div key={g.category} className="mod-group">
                  <div className="mod-group-title">{g.label}</div>
                  {g.modules.map((m) => (
                    <button
                      key={m.name}
                      className={`mod-item${slots[openSlot]?.name === m.name ? ' mod-item-current' : ''}`}
                      title="Клик — поставить в слот, Shift+клик — заполнить все пустые слоты"
                      onClick={(e) => pick(openSlot, m.name, e.shiftKey)}
                    >
                      {m.icon && <ItemIcon src={m.icon} quality={qualities.length > 0 ? pickQuality : undefined} className="mod-item-icon" />}
                      <span className="mod-item-name">{m.label}</span>
                      <span className="mod-item-tier">T{m.tier}</span>
                    </button>
                  ))}
                </div>
              ))
            )}
            {slots[openSlot] !== null && (
              <button className="mod-remove" onClick={() => clear(openSlot)}>Убрать</button>
            )}
            <QualityRow value={pickQuality} onChange={setPickQuality} />
          </div>,
          document.body,
        )}
    </div>
  )
}
