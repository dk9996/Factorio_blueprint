import { useEffect, useMemo, useRef, useState } from 'react'
import { useCanvasStore, type PlacedEntity } from '../../store/canvasStore'
import { useEntityCatalogStore } from '../../store/entityCatalogStore'
import { useUiStore } from '../../store/uiStore'
import { readSetting, sameValue, type SettingPatch } from '../../lib/entitySettings/access'
import { settingsFor, type FieldCtx, type FieldDef, type FieldOption, type LayoutNode } from '../../lib/entitySettings/registry'
import { GameWindow, GhostLine, PreviewBox } from '../circuit/GameWindow'
import { SignalButton, SignalPickerModal } from '../circuit/SignalPicker'
import { signalKey, type SignalDef } from '../../lib/circuit/signals'
import type { SignalID } from '../../lib/circuit/types'
import { ItemIcon } from '../common/ItemIcon'

// Окно настроек сущностей, целиком построенное из реестра
// (lib/entitySettings/registry.ts). Редактирует сразу все выделенные
// сущности одного типа: значение берётся из первой, при расхождении
// показывается «разные». Каждое изменение поля — один шаг истории.

interface FieldProps {
  field: FieldDef
  values: unknown[]
  ctx: FieldCtx
  disabled?: boolean
  onWrite: (value: unknown) => void
}

const MIXED_LABEL = '— разные —'

function useSignalDefMap(): Map<string, SignalDef> {
  const signals = useEntityCatalogStore((s) => s.signals.signals)
  return useMemo(() => new Map(signals.map((s) => [signalKey(s.type, s.name), s])), [signals])
}

function isMixed(values: unknown[]): boolean {
  return values.some((v) => !sameValue(v, values[0]))
}

// ---- редакторы ---------------------------------------------------------

function optionsOf(field: FieldDef, ctx: FieldCtx): FieldOption[] {
  return typeof field.options === 'function' ? field.options(ctx) : field.options ?? []
}

function EnumField({ field, values, ctx, disabled, onWrite }: FieldProps) {
  const mixed = isMixed(values)
  const current = values[0] === undefined ? String(field.default ?? '') : String(values[0])
  const options = optionsOf(field, ctx)
  return (
    <select
      className="gw-select" disabled={disabled} value={mixed ? '__mixed' : current}
      onChange={(e) => onWrite(field.numeric ? Number(e.target.value) : e.target.value)}
    >
      {mixed && <option value="__mixed" disabled>{MIXED_LABEL}</option>}
      {current === '' && !mixed && <option value="">—</option>}
      {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
    </select>
  )
}

// ---- виды редакторов как в окне игры -----------------------------------

function Toggle({ on, onChange, disabled }: { on: boolean; onChange: (v: boolean) => void; disabled?: boolean }) {
  return <button type="button" disabled={disabled} className={`gw-switch${on ? ' on' : ''}`} onClick={() => onChange(!on)} aria-pressed={on} />
}

function Info({ text }: { text?: string }) {
  return text ? <span className="gw-info" title={text}>i</span> : null
}

// две подписи и переключатель между ними (Белый/Чёрный список, Выкл/Вкл)
function Switch2Field({ field, values, ctx, disabled, onWrite }: FieldProps) {
  const [a, b] = optionsOf(field, ctx)
  const mixed = isMixed(values)
  const cur = String(values[0] ?? field.default ?? a.value)
  const on = cur === b.value
  const commit = (isB: boolean) => onWrite(field.kind === 'bool' ? isB : (isB ? b.value : a.value))
  return (
    <span className="es-switch2">
      <span className={!on && !mixed ? 'active' : ''}>{a.label}</span>
      <Toggle on={on && !mixed} disabled={disabled} onChange={commit} />
      <span className={on && !mixed ? 'active' : ''}>{b.label}</span>
    </span>
  )
}

// флажок включает приоритет, переключатель выбирает сторону
function PriorityLRField({ field, values, ctx, disabled, onWrite }: FieldProps) {
  const [l, r] = optionsOf(field, ctx)
  const mixed = isMixed(values)
  const cur = values[0] as string | undefined
  const enabled = !mixed && (cur === 'left' || cur === 'right')
  return (
    <span className="es-inline">
      <label className="es-check"><input type="checkbox" disabled={disabled} checked={enabled} onChange={(e) => onWrite(e.target.checked ? 'left' : undefined)} />{field.label}</label>
      <span className={`es-switch2${enabled ? '' : ' off'}`}>
        <span className={cur === 'left' ? 'active' : ''}>{l.label}</span>
        <Toggle on={cur === 'right'} disabled={disabled || !enabled} onChange={(v) => onWrite(v ? 'right' : 'left')} />
        <span className={cur === 'right' ? 'active' : ''}>{r.label}</span>
      </span>
    </span>
  )
}

function RadioField({ field, values, ctx, disabled, onWrite }: FieldProps) {
  const mixed = isMixed(values)
  const cur = String(values[0] ?? field.default ?? '')
  return (
    <span className="es-radios">
      {optionsOf(field, ctx).map((o) => (
        <label key={o.value} className="es-check">
          <input type="radio" disabled={disabled} checked={!mixed && cur === o.value} onChange={() => onWrite(o.value)} />{o.label}
        </label>
      ))}
    </span>
  )
}

// «Приоритет свежести»: флажок + два радио
function SpoilField({ field, values, ctx, disabled, onWrite }: FieldProps) {
  const [first, second] = optionsOf(field, ctx)
  const mixed = isMixed(values)
  const cur = values[0] as string | undefined
  const enabled = !mixed && (cur === first.value || cur === second.value)
  return (
    <span className="es-inline">
      <label className="es-check"><input type="checkbox" disabled={disabled} checked={enabled} onChange={(e) => onWrite(e.target.checked ? second.value : undefined)} />{field.label}<Info text={field.info} /></label>
      {[first, second].map((o) => (
        <label key={o.value} className={`es-check${enabled ? '' : ' dim'}`}>
          <input type="radio" disabled={disabled || !enabled} checked={cur === o.value} onChange={() => onWrite(o.value)} />{o.label}
        </label>
      ))}
    </span>
  )
}

// ползунок + число; с enableLabel — ещё и флажок (значения нет = выключено).
// Значение пишется при отпускании ползунка (один шаг истории на жест).
function SliderField({ field, values, ctx, disabled, onWrite }: FieldProps) {
  const mixed = isMixed(values)
  const cur = values[0] as number | undefined
  const withCheck = field.variant === 'slider' && field.enableLabel
  const max = field.sliderMax ?? (typeof field.max === 'number' ? field.max : 100)
  const min = field.min ?? 0
  const enabled = !withCheck || (!mixed && cur !== undefined && (field.min === undefined || cur >= field.min) && cur > 0)
  const shown = mixed ? min : cur ?? (typeof field.default === 'number' ? field.default : min)
  const [local, setLocal] = useState<number>(shown)
  useEffect(() => setLocal(shown), [shown])
  const fieldMax = typeof field.max === 'function' ? field.max(ctx) : field.max
  const commit = (n: number) => {
    let v = field.integer ? Math.round(n) : Math.round(n * 1000) / 1000
    v = Math.max(min, v)
    if (fieldMax !== undefined) v = Math.min(fieldMax, v)
    setLocal(v)
    if (v !== cur || mixed) onWrite(v)
  }
  return (
    <span className="es-inline es-slider">
      {withCheck && (
        <label className="es-check">
          <input type="checkbox" disabled={disabled} checked={enabled} onChange={(e) => onWrite(e.target.checked ? (typeof field.default === 'number' ? field.default : Math.max(min, 1)) : undefined)} />
          {field.label}
        </label>
      )}
      {!withCheck && <span className="es-label-inline">{field.label}<Info text={field.info} /></span>}
      <input
        type="range" className="es-range" min={min} max={max} step={field.step ?? 1} value={Math.min(local, max)} disabled={disabled || !enabled}
        onChange={(e) => setLocal(Number(e.target.value))}
        onPointerUp={(e) => commit(Number((e.target as HTMLInputElement).value))}
        onKeyUp={(e) => commit(Number((e.target as HTMLInputElement).value))}
      />
      <input
        className="gw-num es-num-box" disabled={disabled || !enabled} value={mixed ? '' : String(local)} placeholder={mixed ? '…' : ''}
        onChange={(e) => { const n = Number(e.target.value); if (Number.isFinite(n)) setLocal(n) }}
        onBlur={() => commit(local)}
        onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
      />
    </span>
  )
}

function NumberField({ field, values, ctx, disabled, onWrite }: FieldProps) {
  const mixed = isMixed(values)
  const shown = mixed ? '' : values[0] === undefined ? '' : String(values[0])
  const [text, setText] = useState(shown)
  useEffect(() => setText(shown), [shown])
  const max = typeof field.max === 'function' ? field.max(ctx) : field.max
  function commit() {
    const t = text.trim()
    if (t === '') {
      if (!mixed && values[0] !== undefined) onWrite(undefined)
      else setText(shown)
      return
    }
    let n = Number(t.replace(',', '.'))
    if (!Number.isFinite(n)) return setText(shown)
    if (field.integer) n = Math.trunc(n)
    if (field.min !== undefined) n = Math.max(field.min, n)
    if (max !== undefined) n = Math.min(max, n)
    if (!sameValue(n, values[0]) || mixed) onWrite(n)
    setText(String(n))
  }
  return (
    <input
      className="gw-num" style={{ width: 110 }} disabled={disabled} value={text}
      placeholder={mixed ? 'разные' : field.default !== undefined ? String(field.default) : ''}
      onChange={(e) => setText(e.target.value)} onBlur={commit}
      onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
    />
  )
}

function BoolField({ field, values, disabled, onWrite }: FieldProps) {
  const mixed = isMixed(values)
  const ref = useRef<HTMLInputElement>(null)
  useEffect(() => { if (ref.current) ref.current.indeterminate = mixed }, [mixed])
  const checked = mixed ? false : Boolean(values[0] ?? field.default ?? false)
  return <input ref={ref} type="checkbox" disabled={disabled} checked={checked} onChange={(e) => onWrite(e.target.checked)} />
}

function TextField({ field, values, disabled, onWrite }: FieldProps) {
  const mixed = isMixed(values)
  const shown = mixed ? '' : typeof values[0] === 'string' ? (values[0] as string) : ''
  const [text, setText] = useState(shown)
  useEffect(() => setText(shown), [shown])
  if (field.variant === 'textarea') {
    return (
      <span className="es-textarea-wrap">
        <textarea
          className="es-textarea" disabled={disabled} value={text} placeholder={mixed ? 'разные' : ''}
          onChange={(e) => setText(e.target.value)} onBlur={() => { if (text !== shown) onWrite(text === '' ? undefined : text) }}
        />
        <button className="es-confirm" title="Применить" onClick={() => { if (text !== shown) onWrite(text === '' ? undefined : text) }}>✔</button>
      </span>
    )
  }
  return (
    <input
      className="gw-name-input es-text" disabled={disabled} value={text} placeholder={mixed ? 'разные' : field.default !== undefined ? String(field.default) : ''}
      onChange={(e) => setText(e.target.value)}
      onBlur={() => { if (text !== shown) onWrite(text === '' ? undefined : text) }}
      onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
    />
  )
}

// Color чертежа: {r,g,b,a}; компоненты 0..1 (или 0..255 — масштаб
// сохраняется, как был в чертеже).
type Rgba = { r?: number; g?: number; b?: number; a?: number }
function toHex(c: unknown): string | null {
  if (typeof c !== 'object' || c === null || Array.isArray(c)) return null
  const { r = 0, g = 0, b = 0 } = c as Rgba
  const wide = Math.max(r, g, b) > 1
  const h = (n: number) => Math.round(Math.min(255, Math.max(0, wide ? n : n * 255))).toString(16).padStart(2, '0')
  return `#${h(r)}${h(g)}${h(b)}`
}
function fromHex(hex: string, prev: unknown): Rgba {
  const p = (prev ?? {}) as Rgba
  const wide = Math.max(p.r ?? 0, p.g ?? 0, p.b ?? 0) > 1
  const ch = (i: number) => parseInt(hex.slice(1 + i * 2, 3 + i * 2), 16)
  const scale = (n: number) => (wide ? n : Math.round((n / 255) * 1000) / 1000)
  return { r: scale(ch(0)), g: scale(ch(1)), b: scale(ch(2)), a: p.a ?? (wide ? 255 : 1) }
}

function ColorField({ values, disabled, onWrite }: FieldProps) {
  const mixed = isMixed(values)
  const hex = mixed ? null : toHex(values[0])
  return (
    <span className="es-color">
      <input type="color" disabled={disabled} value={hex ?? '#cccccc'} className={hex || mixed ? '' : 'unset'} onChange={(e) => onWrite(fromHex(e.target.value, values[0]))} />
      <span className="es-muted">{mixed ? MIXED_LABEL : hex ?? 'не задан'}</span>
      {!mixed && hex && <button className="gw-x" title="Сбросить цвет" onClick={() => onWrite(undefined)}>✕</button>}
    </span>
  )
}

function SlotCell({ icon, label, quality, onClick, onClear, mixed, disabled }: {
  icon?: string | null; label?: string; quality?: string; onClick: () => void; onClear?: () => void; mixed?: boolean; disabled?: boolean
}) {
  return (
    <div className={`gw-cell es-slot${label ? ' set' : ''}`} title={mixed ? MIXED_LABEL : label ?? 'Выбрать'}>
      <button type="button" className="gw-cell-icon" disabled={disabled} onClick={onClick}>
        {mixed ? <span className="es-muted">…</span> : icon ? <ItemIcon src={icon} alt={label ?? ''} quality={quality} /> : label ? <span className="circ-signal-unknown">{label.slice(0, 4)}</span> : null}
      </button>
      {onClear && label && !mixed && <button className="es-slot-x" onClick={onClear} title="Убрать">✕</button>}
    </div>
  )
}

// itemFilter чертежа: строка или {name, quality?, comparator?}
function filterName(v: unknown): string | undefined {
  if (typeof v === 'string') return v
  if (typeof v === 'object' && v !== null) return (v as { name?: string }).name
  return undefined
}
function filterQuality(v: unknown): string | undefined {
  const q = typeof v === 'object' && v !== null ? (v as { quality?: string }).quality : undefined
  return q && q !== 'normal' ? q : undefined
}
const makeFilter = (s: SignalID, ctx: FieldCtx) =>
  ctx.hasQuality ? { name: s.name, quality: s.quality ?? 'normal', comparator: '=' } : { name: s.name }

function ItemFilterField({ values, ctx, disabled, onWrite }: FieldProps) {
  const defs = useSignalDefMap()
  const [open, setOpen] = useState(false)
  const mixed = isMixed(values)
  const name = mixed ? undefined : filterName(values[0])
  const def = name ? defs.get(signalKey('item', name)) : undefined
  return (
    <>
      <SlotCell icon={def?.icon} label={def?.label ?? name} quality={filterQuality(values[0])} mixed={mixed} disabled={disabled}
        onClick={() => setOpen(true)} onClear={() => onWrite(undefined)} />
      {open && (
        <SignalPickerModal types={['item']} initial={name ? { name, quality: filterQuality(values[0]) } : undefined}
          onClose={() => setOpen(false)} onClear={() => { onWrite(undefined); setOpen(false) }}
          onPick={(s) => { onWrite(makeFilter(s, ctx)); setOpen(false) }} />
      )}
    </>
  )
}

function FluidFilterField({ values, disabled, onWrite }: FieldProps) {
  const defs = useSignalDefMap()
  const [open, setOpen] = useState(false)
  const mixed = isMixed(values)
  const name = mixed || typeof values[0] !== 'string' ? undefined : (values[0] as string)
  const def = name ? defs.get(signalKey('fluid', name)) : undefined
  return (
    <>
      <SlotCell icon={def?.icon} label={def?.label ?? name} mixed={mixed} disabled={disabled} onClick={() => setOpen(true)} onClear={() => onWrite(undefined)} />
      {open && (
        <SignalPickerModal types={['fluid']} initial={name ? { name, type: 'fluid' } : undefined}
          onClose={() => setOpen(false)} onClear={() => { onWrite(undefined); setOpen(false) }}
          onPick={(s) => { onWrite(s.name); setOpen(false) }} />
      )}
    </>
  )
}

function SignalField({ values, disabled, onWrite }: FieldProps) {
  const mixed = isMixed(values)
  const v = mixed ? undefined : (values[0] as SignalID | undefined)
  if (disabled) return <span className="es-muted">—</span>
  return mixed ? <span className="es-muted">{MIXED_LABEL}</span> : (
    <SignalButton value={v?.name ? v : undefined} onChange={(s) => onWrite(s ? s : undefined)} />
  )
}

type FilterEntry = { index?: number; name?: string; quality?: string; comparator?: string }

// Слоты фильтров: [{index (с 1), name, quality?, comparator?}] — как в чертеже.
function ItemListField({ field, values, ctx, disabled, onWrite }: FieldProps) {
  const defs = useSignalDefMap()
  const [slot, setSlot] = useState<number | null>(null)
  const n = field.slots?.(ctx) ?? 0
  const lists = values.map((v) => (Array.isArray(v) ? (v as FilterEntry[]) : []))
  const at = (list: FilterEntry[], i: number) => list.find((f) => (f.index ?? 0) === i + 1)
  const base = lists[0] ?? []
  const write = (i: number, entry: FilterEntry | null) => {
    // каждой выделенной сущности — её собственный список с заменой одного слота
    onWrite((cur: unknown) => {
      const list = (Array.isArray(cur) ? (cur as FilterEntry[]) : []).filter((f) => (f.index ?? 0) !== i + 1)
      const next = entry ? [...list, { index: i + 1, ...entry }].sort((a, b) => (a.index ?? 0) - (b.index ?? 0)) : list
      return next.length > 0 ? next : undefined
    })
  }
  if (n <= 0) return <span className="es-muted">нет слотов</span>
  return (
    <>
      <div className="es-slots">
        {Array.from({ length: n }, (_, i) => {
          const mixedSlot = lists.some((l) => !sameValue(at(l, i), at(base, i)))
          const e = at(base, i)
          const def = e?.name ? defs.get(signalKey('item', e.name)) : undefined
          return (
            <SlotCell key={i} icon={def?.icon} label={def?.label ?? e?.name} quality={e?.quality && e.quality !== 'normal' ? e.quality : undefined}
              mixed={mixedSlot} disabled={disabled} onClick={() => setSlot(i)} onClear={() => write(i, null)} />
          )
        })}
      </div>
      {slot !== null && (
        <SignalPickerModal types={['item']} initial={at(base, slot)?.name ? { name: at(base, slot)!.name, quality: at(base, slot)!.quality } : undefined}
          onClose={() => setSlot(null)} onClear={() => { write(slot, null); setSlot(null) }}
          onPick={(s) => { write(slot, makeFilter(s, ctx) as FilterEntry); setSlot(null) }} />
      )}
    </>
  )
}

const EDITORS: Record<FieldDef['kind'], (p: FieldProps) => JSX.Element> = {
  enum: EnumField, number: NumberField, bool: BoolField, text: TextField, color: ColorField,
  itemFilter: ItemFilterField, fluidFilter: FluidFilterField, signal: SignalField, itemList: ItemListField,
}

const VARIANTS: Record<NonNullable<FieldDef['variant']>, ((p: FieldProps) => JSX.Element) | null> = {
  switch2: Switch2Field, priorityLR: PriorityLRField, radio: RadioField, spoil: SpoilField,
  slider: SliderField, sliderPlain: SliderField, textarea: null, // textarea — вид текстового поля (TextField)
}

function editorFor(field: FieldDef): (p: FieldProps) => JSX.Element {
  const v = field.variant ? VARIANTS[field.variant] : null
  return v ?? EDITORS[field.kind]
}

// Подпись в раскладке «как в игре»: у этих редакторов подпись уже внутри
// (флажок, переключатель, ползунок), у остальных — слева от поля.
function labelInside(field: FieldDef): boolean {
  if (field.variant === 'switch2') return field.kind !== 'bool' // Выкл/Вкл — с подписью «Положение»
  if (field.kind === 'bool' || field.kind === 'itemList' || field.kind === 'color') return true
  if (field.variant === 'priorityLR' || field.variant === 'spoil' || field.variant === 'slider' || field.variant === 'sliderPlain') return true
  if (field.variant === 'textarea') return true
  return field.key === 'station' // имя станции — поле без подписи, как в игре
}

// ---- окно -----------------------------------------------------------------

export function EntitySettingsPanel() {
  const ids = useUiStore((s) => s.settingsEntityIds)
  const close = useUiStore((s) => s.closeEntitySettings)
  const entities = useCanvasStore((s) => s.entities)
  const patch = useCanvasStore((s) => s.patchEntitySettings)
  const catalog = useEntityCatalogStore((s) => s.entities)
  const qualities = useEntityCatalogStore((s) => s.qualities)
  const profile = useEntityCatalogStore((s) => s.activeProfile) ?? 'base'

  const targets: PlacedEntity[] = useMemo(() => {
    const set = new Set(ids ?? [])
    return entities.filter((e) => set.has(e.id))
  }, [ids, entities])
  const first = targets[0]
  const def = first ? settingsFor(first) : undefined

  useEffect(() => {
    if (!ids) return
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        e.stopImmediatePropagation()
        close()
        return
      }
      // горячие клавиши холста (R, Delete, Q, E…) не должны срабатывать под окном
      const active = document.activeElement
      const typing = active instanceof HTMLInputElement || active instanceof HTMLTextAreaElement
      if (!typing && !(e.ctrlKey || e.metaKey) && ['KeyR', 'KeyQ', 'KeyE', 'Delete', 'Backspace'].includes(e.code)) e.stopImmediatePropagation()
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [ids, close])

  // сущности удалены/окно без описания — закрываем
  useEffect(() => {
    if (ids && (!first || !def)) close()
  }, [ids, first, def, close])

  if (!ids || !first || !def) return null
  const ctx: FieldCtx = {
    entity: first,
    catalog: catalog.find((c) => c.typeId === first.typeId),
    hasQuality: qualities.length > 0,
    hasSpaceAge: profile.split('+').includes('space-age'),
    hasElevatedRails: profile.split('+').includes('er'),
  }

  const byKey = new Map(def.fields.map((f) => [f.key, f]))
  const isLive = (f: FieldDef) =>
    !f.stage2 && (!f.visibleIf || f.visibleIf(ctx)) && (!f.unverified || targets.some((e) => readSetting(e, f.key) !== undefined))
  const live = def.fields.filter(isLive)
  const stubs = def.fields.filter((f) => f.stage2)

  function write(field: FieldDef, value: unknown) {
    const ids = targets.map((e) => e.id)
    if (typeof value === 'function') {
      // itemList: результат считается от текущего значения КАЖДОЙ сущности,
      // всё равно один шаг истории
      const fn = value as (cur: unknown) => unknown
      patch(ids, (e) => [{ path: field.key, value: fn(readSetting(e, field.key)), seed: field.seed }])
      return
    }
    const patches: SettingPatch[] = [{ path: field.key, value, seed: field.seed }]
    for (const [path, v] of Object.entries(field.resets ?? {})) patches.push({ path, value: v, seed: field.seed })
    patch(ids, patches)
  }

  const editor = (f: FieldDef) => {
    const Editor = editorFor(f)
    const values = targets.map((e) => readSetting(e, f.key))
    return <Editor field={f} values={values} ctx={ctx} onWrite={(v) => write(f, v)} />
  }

  // поле в раскладке «как в игре»
  const layoutField = (key: string) => {
    const f = byKey.get(key)
    if (!f || !isLive(f)) return null
    const inside = labelInside(f)
    const stack = f.kind === 'fluidFilter' || f.kind === 'text' && f.variant === 'textarea'
    return (
      <div className={`es-lf${stack ? ' stack' : ''}`} key={key} title={f.hint}>
        {!inside && <span className="es-label-inline">{f.label}</span>}
        {f.kind === 'bool' && !f.variant ? (
          <label className="es-check">
            <span className="es-check-box">{editor(f)}</span>{f.label}<Info text={f.info} />
          </label>
        ) : editor(f)}
      </div>
    )
  }

  const renderNode = (node: LayoutNode, i: number) => {
    if (typeof node === 'string') return <div className="es-lrow" key={i}>{layoutField(node)}</div>
    return (
      <div className="es-lrow cols" key={i}>
        {node.map((col, j) =>
          typeof col === 'string'
            ? <div className="es-lcol" key={j}>{layoutField(col)}</div>
            : <div className="es-lcol stack" key={j}>{col.map((k) => layoutField(k))}</div>,
        )}
      </div>
    )
  }

  const laidOut = new Set<string>()
  const collect = (n: LayoutNode) => (typeof n === 'string' ? laidOut.add(n) : n.forEach((c) => (typeof c === 'string' ? laidOut.add(c) : c.forEach((k) => laidOut.add(k)))))
  def.layout?.forEach(collect)
  const rest = live.filter((f) => !laidOut.has(f.key))

  return (
    <GameWindow title={`${def.title}${targets.length > 1 ? ` ×${targets.length}` : ''}`} onClose={close}>
      <div className="es-body">
        {def.status && <GhostLine />}
        {def.layout && <PreviewBox entity={first} arrows={false} />}
        {def.layout?.map(renderNode)}
        {live.length === 0 && <div className="es-muted">Для этой сущности пока нет доступных настроек.</div>}
        {rest.map((f) => {
          const values = targets.map((e) => readSetting(e, f.key))
          const Editor = editorFor(f)
          return (
            <div className="es-row" key={f.key} title={f.hint}>
              <span className="es-label">{f.label}</span>
              <span className="es-control"><Editor field={f} values={values} ctx={ctx} onWrite={(v) => write(f, v)} /></span>
            </div>
          )
        })}
        {stubs.length > 0 && (
          <details className="es-stubs">
            <summary>После этапа схем ({stubs.length}) — пока недоступно</summary>
            {stubs.map((f) => (
              <div className="es-row disabled" key={f.key}>
                <span className="es-label">{f.label}</span>
                <span className="es-control es-muted">после этапа схем</span>
              </div>
            ))}
          </details>
        )}
      </div>
    </GameWindow>
  )
}
