import { useEffect, useMemo, useState } from 'react'
import { useEntityCatalogStore } from '../../store/entityCatalogStore'
import { signalDefFor, signalKey, toSignalId, type SignalDef } from '../../lib/circuit/signals'
import type { SignalID } from '../../lib/circuit/types'
import { ItemIcon } from '../common/ItemIcon'
import { QualityRow } from '../common/QualityRow'
import { NORMAL_QUALITY } from '../../lib/quality'

// Окно выбора сигнала как в игре: вкладки групп (предметы, жидкости,
// сигналы и т.д.), поиск, сетка иконок; в профилях с Quality — строка
// качества (применяется к предметам). Поддерживает виртуальные и особые
// сигналы (signal-each / signal-everything / signal-anything).
interface PickerProps {
  initial?: SignalID
  // ограничить выбор типами сигналов (например только предметы или жидкости)
  types?: SignalDef['type'][]
  onPick: (signal: SignalID) => void
  onClear?: () => void
  onClose: () => void
}

export function SignalPickerModal({ initial, types, onPick, onClear, onClose }: PickerProps) {
  const { groups: allGroups, signals: allSignals } = useEntityCatalogStore((s) => s.signals)
  const signals = useMemo(() => (types ? allSignals.filter((s) => types.includes(s.type)) : allSignals), [allSignals, types])
  const groups = useMemo(() => {
    if (!types) return allGroups
    const used = new Set(signals.map((s) => s.group))
    return allGroups.filter((g) => used.has(g.name))
  }, [allGroups, signals, types])
  const hasQuality = useEntityCatalogStore((s) => s.qualities.length > 0)
  const [query, setQuery] = useState('')
  const [quality, setQuality] = useState<string | undefined>(initial?.quality)
  const initialDef = signals.find((s) => s.name === initial?.name && s.type === (initial?.type ?? 'item'))
  const [group, setGroup] = useState<string | null>(initialDef?.group ?? groups[0]?.name ?? null)

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        e.stopImmediatePropagation()
        onClose()
      }
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [onClose])

  const searching = query.trim().length > 0
  const visible = useMemo(() => {
    const q = query.trim().toLowerCase()
    return signals.filter((s) =>
      searching ? s.label.toLowerCase().includes(q) || s.name.toLowerCase().includes(q) : s.group === group,
    )
  }, [signals, searching, query, group])

  // подгруппы — строками, как в игре
  const rows = useMemo(() => {
    const map = new Map<string, SignalDef[]>()
    for (const s of visible) {
      const key = `${s.subgroupOrder}|${s.subgroup}`
      map.set(key, [...(map.get(key) ?? []), s])
    }
    return [...map.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([, v]) => v)
  }, [visible])

  const effectiveQuality = hasQuality && (!types || types.includes('item')) ? quality : undefined

  return (
    <div className="picker-overlay circuit-overlay" onClick={onClose}>
      <div className="picker-modal signal-picker" onClick={(e) => e.stopPropagation()} onWheel={(e) => e.stopPropagation()}>
        <div className="grid-menu">
          <div className="gm-header">
            <span className="gm-title">Выбор сигнала</span>
            {onClear && initial?.name && (
              <button className="ie-btn" onClick={onClear}>Очистить</button>
            )}
            <button className="gm-icon-btn" onClick={onClose}>✕</button>
          </div>
          <div className="gm-search-row">
            <input className="gm-search-input" placeholder="Поиск сигнала…" value={query} onChange={(e) => setQuery(e.target.value)} autoFocus />
          </div>
          {!searching && (
            <div className="gm-categories">
              {groups.map((g) => (
                <div key={g.name} className={`gm-cat-cell${g.name === group ? ' active' : ''}`} title={g.label} onClick={() => setGroup(g.name)}>
                  {g.icon ? <img src={g.icon} alt={g.label} /> : g.label.slice(0, 2)}
                </div>
              ))}
            </div>
          )}
          <div className="gm-body">
            {(() => {
              const cell = (s: SignalDef) => (
                <div
                  key={signalKey(s.type, s.name)}
                  className={`gm-cell${initial?.name === s.name && (initial?.type ?? 'item') === s.type ? ' active' : ''}`}
                  title={s.label}
                  onClick={() => onPick(toSignalId(s, s.type === 'item' ? effectiveQuality : undefined))}
                >
                  {s.icon && <ItemIcon src={s.icon} alt={s.label} quality={s.type === 'item' ? effectiveQuality : undefined} />}
                </div>
              )
              if (searching) {
                return (
                  <div className="gm-grid">
                    {visible.map(cell)}
                    {visible.length === 0 && <div className="gm-empty">Ничего не найдено</div>}
                  </div>
                )
              }
              return (
                <div className="gm-rows">
                  {rows.map((row) => (
                    <div className="gm-row" key={row[0].subgroup}>{row.map(cell)}</div>
                  ))}
                  {rows.length === 0 && <div className="gm-empty">Ничего не найдено</div>}
                </div>
              )
            })()}
          </div>
          {(!types || types.includes('item')) && <QualityRow value={quality} onChange={(q) => setQuality(q === NORMAL_QUALITY ? undefined : q)} />}
        </div>
      </div>
    </div>
  )
}

interface ButtonProps {
  value?: SignalID
  onChange: (signal: SignalID | undefined) => void
  placeholder?: string
}

// Кнопка-слот сигнала: иконка выбранного сигнала (с цветом качества) или «+»;
// клик открывает окно выбора.
export function SignalButton({ value, onChange, placeholder = 'Сигнал' }: ButtonProps) {
  const [open, setOpen] = useState(false)
  const { signals } = useEntityCatalogStore((s) => s.signals)
  const map = useMemo(() => new Map(signals.map((s) => [signalKey(s.type, s.name), s])), [signals])
  const def = signalDefFor(map, value)
  return (
    <>
      <button
        type="button"
        className={`circ-signal-btn${value?.name ? ' set' : ''}`}
        title={def ? def.label : value?.name ? value.name : placeholder}
        onClick={() => setOpen(true)}
      >
        {def?.icon ? (
          <ItemIcon src={def.icon} alt={def.label} quality={value?.quality} />
        ) : value?.name ? (
          <span className="circ-signal-unknown">{value.name.slice(0, 6)}</span>
        ) : (
          <span className="circ-signal-plus">+</span>
        )}
      </button>
      {open && (
        <SignalPickerModal
          initial={value}
          onClose={() => setOpen(false)}
          onPick={(s) => {
            onChange(s)
            setOpen(false)
          }}
          onClear={() => {
            onChange(undefined)
            setOpen(false)
          }}
        />
      )}
    </>
  )
}
