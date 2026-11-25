import { useEffect, useState } from 'react'
import { useCanvasStore, type PlacedEntity } from '../../store/canvasStore'
import { useEntityCatalogStore } from '../../store/entityCatalogStore'
import { SignalButton, SignalPickerModal } from './SignalPicker'
import { DescriptionBlock, GameWindow, GhostLine, GwPanel, PreviewBox, RGChecks, SignalSlots, StatusBar, type LiveSignal } from './GameWindow'
import { useSimStore } from '../../store/simStore'
import { SimMiniBar } from './SimPanel'
import { entityNetRefs, netValues, sortedValues } from '../../lib/circuit/simView'
import { ItemIcon } from '../common/ItemIcon'
import {
  signalKey, type SignalDef,
} from '../../lib/circuit/signals'
import type {
  ArithmeticControlBehavior, ArithmeticOperation, ArithmeticParameters, Comparator, ConstantControlBehavior,
  ConstantFilter, ConstantSection, ControlBehavior, DeciderCondition, DeciderControlBehavior, DeciderOutput,
  NetworkSelection, SelectorControlBehavior, SelectorOperation, SignalID,
} from '../../lib/circuit/types'

// Окно настройки комбинаторов (клик по сущности без предмета в руке) в
// стиле игры: арифметический, decider (формат 2.0), constant, selector.
// control_behavior хранится в ТОМ ЖЕ JSON, что в чертеже Factorio 2.0.
export const CONFIGURABLE_TYPES = new Set([
  'arithmetic-combinator', 'decider-combinator', 'constant-combinator', 'selector-combinator',
])

const ARITH_OPS: ArithmeticOperation[] = ['+', '-', '*', '/', '%', '^', '<<', '>>', 'AND', 'OR', 'XOR']
const COMPARATORS: Comparator[] = ['>', '<', '=', '>=', '<=', '!=']
const SELECTOR_OPS: { value: SelectorOperation; label: string; hint: string }[] = [
  { value: 'select', label: 'Выбрать вход', hint: 'Выбирает определённый сигнал из всех входящих сигналов на основе критериев.' },
  { value: 'count', label: 'Подсчитать входы', hint: 'Выводит количество различных входящих сигналов.' },
  { value: 'random', label: 'Случайный вход', hint: 'Выбирает случайный сигнал из входящих и обновляет выбор через заданный интервал.' },
  { value: 'stack-size', label: 'Размер стака', hint: 'Преобразует входящие предметы в размер их стака.' },
  { value: 'rocket-capacity', label: 'Вместимость ракеты', hint: 'Преобразует входящие предметы в число, помещающееся в одну ракету.' },
  { value: 'quality-filter', label: 'Фильтр качества', hint: 'Пропускает только сигналы с подходящим качеством.' },
  { value: 'quality-transfer', label: 'Перенос качества', hint: 'Переносит качество одного сигнала на другие.' },
]
const COMPARATOR_LABEL: Record<string, string> = { '>=': '≥', '<=': '≤', '!=': '≠' }

// ---- общие мелкие компоненты --------------------------------------------

// Число: правка локально, запись (и шаг истории) — по blur/Enter.
export function NumberField({ value, onCommit, placeholder, width = 64, allowEmpty = true }: {
  value: number | undefined
  onCommit: (v: number | undefined) => void
  placeholder?: string
  width?: number
  allowEmpty?: boolean
}) {
  const [text, setText] = useState(value === undefined ? '' : String(value))
  useEffect(() => setText(value === undefined ? '' : String(value)), [value])
  function commit() {
    const t = text.trim()
    if (t === '') {
      if (allowEmpty) onCommit(undefined)
      else setText(value === undefined ? '' : String(value))
      return
    }
    const n = Math.trunc(Number(t))
    if (Number.isFinite(n)) onCommit(n)
    else setText(value === undefined ? '' : String(value))
  }
  return (
    <input
      className="gw-num"
      style={{ width }}
      value={text}
      placeholder={placeholder}
      inputMode="numeric"
      onChange={(e) => setText(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
    />
  )
}

// Операнд: сигнал ИЛИ константа (выбор сигнала сбрасывает константу и
// наоборот); у сигнала — стопка R/G.
export function Operand({ signal, constant, networks, onChange }: {
  signal: SignalID | undefined
  constant: number | undefined
  networks: NetworkSelection | undefined
  onChange: (next: { signal?: SignalID; constant?: number; networks?: NetworkSelection }) => void
}) {
  return (
    <span className="gw-operand">
      <SignalButton value={signal} onChange={(s) => onChange({ signal: s, constant: s ? undefined : constant ?? 0, networks })} />
      {signal?.name
        ? <RGChecks value={networks} onChange={(n) => onChange({ signal, constant: undefined, networks: n })} />
        : <NumberField value={constant} allowEmpty={false} placeholder="0" onCommit={(v) => onChange({ signal: undefined, constant: v, networks })} />}
    </span>
  )
}

export function CmpSelect({ value, onChange, list = COMPARATORS }: { value: string | undefined; onChange: (c: Comparator) => void; list?: Comparator[] }) {
  return (
    <select className="gw-select sq" value={value ?? '<'} onChange={(e) => onChange(e.target.value as Comparator)}>
      {list.map((x) => <option key={x} value={x}>{COMPARATOR_LABEL[x] ?? x}</option>)}
    </select>
  )
}

// ---- значения из симуляции ----------------------------------------------

function toLive(values: ReturnType<typeof sortedValues>, color: LiveSignal['color']): LiveSignal[] {
  return values.map((v) => ({ signal: { name: v.name, type: v.type as SignalID['type'], quality: v.quality === 'normal' ? undefined : v.quality }, color, count: v.value }))
}

// Входящие (по проводам входа, красные и зелёные раздельно) и исходящие
// (то, что комбинатор сейчас выдаёт) сигналы; пусто, пока симуляция не запущена.
function LiveSlots({ entityId, kind, rows }: { entityId: number; kind: 'in' | 'out'; rows: number }) {
  const snapshot = useSimStore((s) => s.snapshot)
  const topology = useSimStore((s) => s.topology)
  let signals: LiveSignal[] = []
  if (kind === 'in') {
    for (const r of entityNetRefs(topology, entityId)) {
      if (r.connector === 'input') signals = signals.concat(toLive(netValues(snapshot, r.net), r.color))
    }
  } else {
    const outs = toLive(sortedValues(snapshot?.outs[entityId]), 'plain')
    const colors = entityNetRefs(topology, entityId).filter((r) => r.connector === 'output').map((r) => r.color)
    signals = colors.length === 0 ? outs : colors.flatMap((c) => outs.map((o) => ({ ...o, color: c })))
  }
  return <SignalSlots title={kind === 'in' ? 'Входящие сигналы' : 'Исходящие сигналы'} rows={rows} signals={signals} />
}

// ---- арифметический ----------------------------------------------------

function ArithmeticForm({ cb, update, entityId }: { cb: ArithmeticControlBehavior; update: (cb: ControlBehavior) => void; entityId: number }) {
  const p: ArithmeticParameters = cb.arithmetic_conditions ?? {}
  const set = (patch: Partial<ArithmeticParameters>) => {
    const next = { ...p, ...patch }
    for (const k of Object.keys(next) as (keyof ArithmeticParameters)[]) if (next[k] === undefined) delete next[k]
    update({ ...cb, arithmetic_conditions: next })
  }
  return (
    <>
      <div className="gw-two">
        <GwPanel title="Вход" className="grow">
          <div className="gw-line">
            <Operand
              signal={p.first_signal} constant={p.first_constant} networks={p.first_signal_networks}
              onChange={(o) => set({ first_signal: o.signal, first_constant: o.constant, first_signal_networks: o.networks })}
            />
            <select className="gw-select op" value={p.operation ?? '*'} onChange={(e) => set({ operation: e.target.value as ArithmeticOperation })}>
              {ARITH_OPS.map((op) => <option key={op} value={op}>{op}</option>)}
            </select>
            <Operand
              signal={p.second_signal} constant={p.second_constant} networks={p.second_signal_networks}
              onChange={(o) => set({ second_signal: o.signal, second_constant: o.constant, second_signal_networks: o.networks })}
            />
          </div>
        </GwPanel>
        <GwPanel title="Выход" className="side">
          <div className="gw-line"><SignalButton value={p.output_signal} onChange={(s) => set({ output_signal: s })} /></div>
        </GwPanel>
      </div>
      <div className="gw-two">
        <LiveSlots entityId={entityId} kind="in" rows={1} />
        <LiveSlots entityId={entityId} kind="out" rows={1} />
      </div>
    </>
  )
}

// ---- decider (2.0: условия and/or + несколько выходов) ------------------

function OutputRow({ out, onChange, onRemove }: {
  out: DeciderOutput
  onChange: (patch: Partial<DeciderOutput>) => void
  onRemove: () => void
}) {
  const fromInput = out.copy_count_from_input !== false // по умолчанию true (runtime-api)
  return (
    <div className="gw-out-row">
      <SignalButton value={out.signal} onChange={(s) => onChange({ signal: s })} />
      <div className="gw-out-modes">
        <label className="gw-radio">
          <input type="radio" checked={!fromInput} onChange={() => onChange({ copy_count_from_input: false })} />
          <NumberField value={out.constant ?? 1} allowEmpty={false} width={52} onCommit={(v) => onChange({ constant: v })} />
        </label>
        <label className="gw-radio">
          <input type="radio" checked={fromInput} onChange={() => onChange({ copy_count_from_input: true })} />
          Входное количество
          <RGChecks value={out.networks} onChange={(n) => onChange({ networks: n })} />
        </label>
      </div>
      <button className="gw-x" title="Удалить выход" onClick={onRemove}>✕</button>
    </div>
  )
}

function DeciderForm({ cb, update, entityId }: { cb: DeciderControlBehavior; update: (cb: ControlBehavior) => void; entityId: number }) {
  const dc = cb.decider_conditions ?? {}
  const conditions = dc.conditions ?? []
  const outputs = dc.outputs ?? []
  const elseOutputs = dc.else_outputs ?? []
  const write = (patch: { conditions?: DeciderCondition[]; outputs?: DeciderOutput[]; else_outputs?: DeciderOutput[] }) => {
    const next = { ...dc, ...patch }
    if (next.else_outputs && next.else_outputs.length === 0) delete next.else_outputs
    update({ ...cb, decider_conditions: next })
  }
  const setCond = (i: number, patch: Partial<DeciderCondition>) => {
    const list = conditions.map((c, idx) => {
      if (idx !== i) return c
      const next = { ...c, ...patch }
      for (const k of Object.keys(next) as (keyof DeciderCondition)[]) if (next[k] === undefined) delete next[k]
      return next
    })
    write({ conditions: list })
  }
  const patchOut = (list: DeciderOutput[], i: number, patch: Partial<DeciderOutput>) =>
    list.map((o, idx) => {
      if (idx !== i) return o
      const next = { ...o, ...patch }
      for (const k of Object.keys(next) as (keyof DeciderOutput)[]) if (next[k] === undefined) delete next[k]
      return next
    })
  const newOutput: DeciderOutput = { copy_count_from_input: false, constant: 1 }
  return (
    <>
      <div className="gw-two">
        <GwPanel title="Условия" className="grow">
          <div className="gw-list">
            {conditions.map((c, i) => (
              <div className="gw-cond-row" key={i}>
                {i > 0 && (
                  <button className="gw-btn small" onClick={() => setCond(i, { compare_type: c.compare_type === 'and' ? 'or' : 'and' })}>
                    {c.compare_type === 'and' ? 'И' : 'ИЛИ'}
                  </button>
                )}
                <Operand
                  signal={c.first_signal} constant={undefined} networks={c.first_signal_networks}
                  onChange={(o) => setCond(i, { first_signal: o.signal, first_signal_networks: o.networks })}
                />
                <CmpSelect value={c.comparator} onChange={(x) => setCond(i, { comparator: x })} />
                <Operand
                  signal={c.second_signal} constant={c.constant} networks={c.second_signal_networks}
                  onChange={(o) => setCond(i, { second_signal: o.signal, constant: o.constant, second_signal_networks: o.networks })}
                />
                <button className="gw-x" title="Удалить условие" onClick={() => write({ conditions: conditions.filter((_, idx) => idx !== i) })}>✕</button>
              </div>
            ))}
            <button className="gw-btn wide" onClick={() => write({ conditions: [...conditions, { comparator: '>', constant: 0, compare_type: 'or' }] })}>
              + Добавить условие
            </button>
          </div>
        </GwPanel>
        <GwPanel title="Выходы" className="grow">
          <div className="gw-list">
            {outputs.map((o, i) => (
              <OutputRow key={i} out={o}
                onChange={(patch) => write({ outputs: patchOut(outputs, i, patch) })}
                onRemove={() => write({ outputs: outputs.filter((_, idx) => idx !== i) })} />
            ))}
            <button className="gw-btn wide" onClick={() => write({ outputs: [...outputs, { ...newOutput }] })}>
              + Добавить выход
            </button>
            <div className="gw-subhead" title="Выходы, которые выводятся, когда условие НЕ выполнено">Выходы "иначе" <span className="gw-info">i</span></div>
            {elseOutputs.map((o, i) => (
              <OutputRow key={i} out={o}
                onChange={(patch) => write({ else_outputs: patchOut(elseOutputs, i, patch) })}
                onRemove={() => write({ else_outputs: elseOutputs.filter((_, idx) => idx !== i) })} />
            ))}
            <button className="gw-btn wide" onClick={() => write({ else_outputs: [...elseOutputs, { ...newOutput }] })}>
              + Добавить "иначе"
            </button>
          </div>
        </GwPanel>
      </div>
      <div className="gw-two">
        <LiveSlots entityId={entityId} kind="in" rows={2} />
        <LiveSlots entityId={entityId} kind="out" rows={1} />
      </div>
    </>
  )
}

// ---- constant-combinator -----------------------------------------------

const SLOTS_PER_ROW = 10

function ConstantForm({ cb, update }: { cb: ConstantControlBehavior; update: (cb: ControlBehavior) => void }) {
  const sections: ConstantSection[] = cb.sections?.sections?.length ? cb.sections.sections : [{ index: 1, filters: [] }]
  const [editing, setEditing] = useState<{ section: number; slot: number } | null>(null)
  const [renaming, setRenaming] = useState<number | null>(null)
  const { signals } = useEntityCatalogStore((s) => s.signals)
  const [counts, setCounts] = useState<Record<string, string>>({})
  const defs = new Map<string, SignalDef>(signals.map((s) => [signalKey(s.type, s.name), s]))

  const write = (next: ConstantSection[]) => update({ ...cb, sections: { ...cb.sections, sections: next } })
  const patchSection = (si: number, patch: Partial<ConstantSection>) =>
    write(sections.map((s, i) => (i === si ? { ...s, ...patch } : s)))

  function setFilter(si: number, slot: number, filter: ConstantFilter | null) {
    const sec = sections[si]
    const rest = (sec.filters ?? []).filter((f) => f.index !== slot + 1)
    patchSection(si, { filters: filter ? [...rest, { ...filter, index: slot + 1 }].sort((a, b) => (a.index ?? 0) - (b.index ?? 0)) : rest })
  }

  return (
    <>
      <GwPanel title="Выход">
        <div className="gw-toggle-row">
          <span className={cb.is_on === false ? 'on' : ''}>Выкл</span>
          <button className={`gw-switch${cb.is_on !== false ? ' on' : ''}`} onClick={() => update({ ...cb, is_on: cb.is_on === false })} aria-label="Выход вкл/выкл" />
          <span className={cb.is_on !== false ? 'on' : ''}>Вкл</span>
        </div>
      </GwPanel>
      {sections.map((sec, si) => {
        const maxIndex = Math.max(0, ...(sec.filters ?? []).map((f) => f.index ?? 0))
        const slotCount = Math.max(SLOTS_PER_ROW, Math.ceil((maxIndex + 1) / SLOTS_PER_ROW) * SLOTS_PER_ROW)
        return (
          <div className="gw-section" key={si}>
            <div className="gw-section-head">
              <input type="checkbox" checked={sec.active !== false} title="Секция активна" onChange={(e) => patchSection(si, { active: e.target.checked })} />
              {renaming === si ? (
                <input
                  className="gw-name-input" autoFocus defaultValue={sec.group ?? ''}
                  onBlur={(e) => { patchSection(si, { group: e.target.value || undefined }); setRenaming(null) }}
                  onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
                />
              ) : (
                <span className="gw-section-name">{sec.group ? sec.group : '[Группа не назначена]'}</span>
              )}
              <button className="gw-pencil" title="Переименовать" onClick={() => setRenaming(si)}>✎</button>
              <span className="gw-stripes" />
              <span className="gw-mult" title="Множитель секции">×
                <input
                  className="gw-num" style={{ width: 44 }} defaultValue={sec.multiplier ?? 1} key={`m${si}-${sec.multiplier}`}
                  onBlur={(e) => {
                    const v = Number(e.target.value)
                    if (Number.isFinite(v)) patchSection(si, { multiplier: v })
                  }}
                />
              </span>
              {sections.length > 1 && (
                <button className="gw-trash" title="Удалить секцию" onClick={() => write(sections.filter((_, i) => i !== si).map((s, i) => ({ ...s, index: i + 1 })))}>🗑</button>
              )}
            </div>
            <div className="gw-grid">
              {Array.from({ length: slotCount }, (_, slot) => {
                const f = (sec.filters ?? []).find((x) => x.index === slot + 1)
                const def = f ? defs.get(signalKey(f.type, f.name ?? '')) : undefined
                const ckey = `${si}-${slot}`
                return (
                  <div key={slot} className={`gw-cell${f ? ' set' : ''}`} onContextMenu={(e) => { e.preventDefault(); setFilter(si, slot, null) }}>
                    <button type="button" className="gw-cell-icon" title={def?.label ?? f?.name ?? 'Выбрать сигнал'} onClick={() => setEditing({ section: si, slot })}>
                      {def?.icon ? <ItemIcon src={def.icon} alt={def.label} quality={f?.quality} /> : f ? <span className="circ-signal-unknown">{(f.name ?? '').slice(0, 5)}</span> : null}
                    </button>
                    {f && (
                      <input
                        className="gw-cell-count"
                        value={counts[ckey] ?? String(f.count ?? 0)}
                        onChange={(e) => setCounts({ ...counts, [ckey]: e.target.value })}
                        onBlur={() => {
                          const n = Math.trunc(Number(counts[ckey] ?? f.count ?? 0))
                          setCounts((c) => { const { [ckey]: _drop, ...rest } = c; return rest })
                          if (Number.isFinite(n) && n !== f.count) setFilter(si, slot, { ...f, count: n })
                        }}
                        onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
                      />
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        )
      })}
      <button className="gw-btn wide" onClick={() => write([...sections, { index: sections.length + 1, filters: [] }])}>Добавить группу</button>
      <div className="gw-hint">ПКМ по ячейке — очистить</div>
      {editing && (
        <SignalPickerModal
          initial={(() => {
            const f = (sections[editing.section].filters ?? []).find((x) => x.index === editing.slot + 1)
            return f ? { name: f.name, type: f.type, quality: f.quality } : undefined
          })()}
          onClose={() => setEditing(null)}
          onClear={() => { setFilter(editing.section, editing.slot, null); setEditing(null) }}
          onPick={(s) => {
            const old = (sections[editing.section].filters ?? []).find((x) => x.index === editing.slot + 1)
            setFilter(editing.section, editing.slot, {
              ...(s.type ? { type: s.type } : {}),
              name: s.name,
              quality: s.quality ?? 'normal',
              comparator: '=',
              count: old?.count ?? 1,
            })
            setEditing(null)
          }}
        />
      )}
    </>
  )
}

// ---- selector-combinator -----------------------------------------------

function SelectorForm({ cb, update, entityId }: { cb: SelectorControlBehavior; update: (cb: ControlBehavior) => void; entityId: number }) {
  const qualities = useEntityCatalogStore((s) => s.qualities)
  const op = cb.operation ?? 'select'
  const set = (patch: Partial<SelectorControlBehavior>) => {
    const next = { ...cb, ...patch }
    for (const k of Object.keys(next)) if ((next as Record<string, unknown>)[k] === undefined) delete (next as Record<string, unknown>)[k]
    update(next)
  }
  const qualityOps = qualities.length > 0
  const ops = SELECTOR_OPS.filter((o) => qualityOps || !o.value.startsWith('quality'))
  const hint = SELECTOR_OPS.find((o) => o.value === op)?.hint
  return (
    <>
      <div className="gw-mode-row">
        <span className="gw-label gold">Режим работы</span>
        <select className="gw-select wide" value={op} onChange={(e) => set({ operation: e.target.value as SelectorOperation })}>
          {ops.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
      </div>
      {hint && <div className="gw-hint block">{hint}</div>}
      <div className="gw-sep" />
      {op === 'select' && (
        <>
          <div className="gw-line">
            <span className="gw-text">Индекс</span>
            <CmpSelect value={cb.index_comparator ?? '='} list={['=', '>', '<', '>=', '<=', '!=']} onChange={(x) => set({ index_comparator: x })} />
            <SignalButton value={cb.index_signal} onChange={(s) => set({ index_signal: s, index_constant: s ? undefined : cb.index_constant ?? 0 })} />
            {!cb.index_signal?.name && <NumberField value={cb.index_constant} allowEmpty={false} placeholder="0" onCommit={(v) => set({ index_constant: v, index_signal: undefined })} />}
          </div>
          <div className="gw-toggle-row">
            <span className="gw-label gold">Сортировка по убыванию</span>
            <button className={`gw-switch${cb.select_max === false ? ' on' : ''}`} onClick={() => set({ select_max: cb.select_max === false })} aria-label="Направление сортировки" />
            <span className="gw-text">Сортировка по возрастанию</span>
          </div>
        </>
      )}
      {op === 'count' && (
        <div className="gw-line">
          <span className="gw-text">Выходной сигнал</span>
          <SignalButton value={cb.count_signal} onChange={(s) => set({ count_signal: s })} />
        </div>
      )}
      {op === 'random' && (
        <div className="gw-line">
          <span className="gw-text">Интервал обновления, тиков</span>
          <NumberField value={cb.random_update_interval} allowEmpty={false} placeholder="0" onCommit={(v) => set({ random_update_interval: v })} />
        </div>
      )}
      {op === 'quality-filter' && (
        <div className="gw-line">
          <span className="gw-text">Качество</span>
          <CmpSelect value={cb.quality_filter?.comparator ?? '='} list={['=', '>', '<', '>=', '<=', '!=']} onChange={(x) => set({ quality_filter: { ...cb.quality_filter, comparator: x } })} />
          <select className="gw-select" value={cb.quality_filter?.quality ?? 'normal'} onChange={(e) => set({ quality_filter: { ...cb.quality_filter, quality: e.target.value } })}>
            {qualities.map((q) => <option key={q.name} value={q.name}>{q.localizedName}</option>)}
          </select>
        </div>
      )}
      {op === 'quality-transfer' && (
        <>
          <div className="gw-line">
            <span className="gw-text">Куда (сигнал)</span>
            <SignalButton value={cb.quality_destination_signal} onChange={(s) => set({ quality_destination_signal: s })} />
          </div>
          <div className="gw-line">
            <label className="gw-radio"><input type="checkbox" checked={!!cb.select_quality_from_signal} onChange={(e) => set({ select_quality_from_signal: e.target.checked })} /> качество из сигнала</label>
            {cb.select_quality_from_signal ? (
              <SignalButton value={cb.quality_source_signal} onChange={(s) => set({ quality_source_signal: s })} />
            ) : (
              <select className="gw-select" value={cb.quality_source_static ?? 'normal'} onChange={(e) => set({ quality_source_static: e.target.value })}>
                {qualities.map((q) => <option key={q.name} value={q.name}>{q.localizedName}</option>)}
              </select>
            )}
          </div>
        </>
      )}
      {(op === 'stack-size' || op === 'rocket-capacity') && <div className="gw-hint">Без дополнительных настроек.</div>}
      <div className="gw-two">
        <LiveSlots entityId={entityId} kind="in" rows={1} />
        <LiveSlots entityId={entityId} kind="out" rows={1} />
      </div>
    </>
  )
}

// ---- окно -----------------------------------------------------------------

const TITLES: Record<string, string> = {
  'arithmetic-combinator': 'Арифметический комбинатор',
  'decider-combinator': 'Сравнивающий комбинатор',
  'constant-combinator': 'Постоянный комбинатор',
  'selector-combinator': 'Выбирающий комбинатор',
}
const WIDE = new Set(['arithmetic-combinator', 'decider-combinator'])

export function CombinatorConfigModal({ entity, onClose }: { entity: PlacedEntity; onClose: () => void }) {
  const setControlBehavior = useCanvasStore((s) => s.setControlBehavior)
  const close = onClose
  const cb = (entity.controlBehavior ?? {}) as ControlBehavior
  const update = (next: ControlBehavior) => setControlBehavior(entity.id, next)
  const type = entity.type ?? ''

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        e.stopImmediatePropagation()
        close()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  return (
    <GameWindow title={TITLES[type] ?? entity.label} wide={WIDE.has(type)} onClose={close}>
      <StatusBar entity={entity} io={type !== 'constant-combinator'} />
      <GhostLine />
      <SimMiniBar />
      <PreviewBox entity={entity} arrows={type !== 'constant-combinator'} />
      {type === 'arithmetic-combinator' && <ArithmeticForm entityId={entity.id} cb={cb as ArithmeticControlBehavior} update={update} />}
      {type === 'decider-combinator' && <DeciderForm entityId={entity.id} cb={cb as DeciderControlBehavior} update={update} />}
      {type === 'constant-combinator' && <ConstantForm cb={cb as ConstantControlBehavior} update={update} />}
      {type === 'selector-combinator' && <SelectorForm entityId={entity.id} cb={cb as SelectorControlBehavior} update={update} />}
      <DescriptionBlock entity={entity} />
    </GameWindow>
  )
}
