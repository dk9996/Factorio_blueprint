import type {
  ArithmeticParameters, DeciderCondition, DeciderOutput, NetworkSelection, SelectorControlBehavior, SignalID,
} from '../../lib/circuit/types.ts'
import { arith, compare } from './ops.ts'
import {
  addTo, isAnything, isEach, isEverything, makeKey, mergeMaps, parseKey, sigKey, sortedKeys, wrap32,
} from './signals.ts'
import type { SignalKey, SignalMap, SimOptions } from './types.ts'

// Вход комбинатора: значения красной и зелёной сети входа.
export interface CombInput {
  red: SignalMap | undefined
  green: SignalMap | undefined
}

const useRed = (n?: NetworkSelection) => n?.red !== false
const useGreen = (n?: NetworkSelection) => n?.green !== false

// Значение сигнала с учётом выбора сетей (в 2.0 — по операнду/условию;
// не задано = обе сети суммируются).
function valueOf(input: CombInput, key: SignalKey, sel?: NetworkSelection): number {
  let v = 0
  if (useRed(sel)) v += input.red?.get(key) ?? 0
  if (useGreen(sel)) v += input.green?.get(key) ?? 0
  return wrap32(v)
}

// Все сигналы выбранных сетей с ненулевой суммой (для Each/Everything/Anything).
function merged(input: CombInput, sel?: NetworkSelection): SignalMap {
  return mergeMaps(useRed(sel) ? input.red : undefined, useGreen(sel) ? input.green : undefined)
}

// ---- арифметический ------------------------------------------------------

export function evalArithmetic(p: ArithmeticParameters | undefined, input: CombInput): SignalMap {
  const out: SignalMap = new Map()
  if (!p) return out
  const outKey = sigKey(p.output_signal)
  const outEach = isEach(p.output_signal)
  const firstEach = isEach(p.first_signal)
  const secondEach = isEach(p.second_signal)
  if (!outKey && !outEach) return out
  const op = p.operation ?? '*'

  const operandValue = (signal: SignalID | undefined, constant: number | undefined, sel: NetworkSelection | undefined, eachKey: SignalKey | null): number => {
    if (isEach(signal)) return eachKey ? valueOf(input, eachKey, sel) : 0
    const k = sigKey(signal)
    if (k) return valueOf(input, k, sel)
    return wrap32(constant ?? 0)
  }

  if (!firstEach && !secondEach) {
    if (outEach) return out // Each на выходе без Each во входе — недопустимо
    const r = arith(op, operandValue(p.first_signal, p.first_constant, p.first_signal_networks, null),
      operandValue(p.second_signal, p.second_constant, p.second_signal_networks, null))
    addTo(out, outKey!, r)
    return out
  }

  // Each: операция по каждому входному сигналу; Each на выходе — результаты
  // под теми же сигналами, конкретный сигнал на выходе — сумма результатов.
  const keys = new Set<SignalKey>()
  if (firstEach) for (const k of merged(input, p.first_signal_networks).keys()) keys.add(k)
  if (secondEach) for (const k of merged(input, p.second_signal_networks).keys()) keys.add(k)
  for (const k of [...keys].sort()) {
    const r = arith(op,
      operandValue(p.first_signal, p.first_constant, p.first_signal_networks, k),
      operandValue(p.second_signal, p.second_constant, p.second_signal_networks, k))
    addTo(out, outEach ? k : outKey!, r)
  }
  return out
}

// ---- decider -------------------------------------------------------------

interface DeciderCtx {
  // ключ, под который сработало условие с Each (контекст конкретного сигнала)
  eachKey: SignalKey | null
  // сигнал, на котором выполнилось условие Anything
  anythingKey: SignalKey | null
}

function evalCondition(c: DeciderCondition, input: CombInput, eachKey: SignalKey | null, ctx: DeciderCtx): boolean {
  const rhs = (key: SignalKey | null): number => {
    if (c.second_signal?.name) {
      if (isEach(c.second_signal)) return key ? valueOf(input, key, c.second_signal_networks) : 0
      const k = sigKey(c.second_signal)
      return k ? valueOf(input, k, c.second_signal_networks) : 0
    }
    return wrap32(c.constant ?? 0)
  }
  const cmp = (lhs: number, key: SignalKey | null) => compare(c.comparator ?? '<', lhs, rhs(key))

  if (isEach(c.first_signal)) {
    if (!eachKey) return false
    return cmp(valueOf(input, eachKey, c.first_signal_networks), eachKey)
  }
  if (isEverything(c.first_signal) || isAnything(c.first_signal)) {
    const keys = sortedKeys(merged(input, c.first_signal_networks))
    if (isEverything(c.first_signal)) {
      // пустой вход: Everything истинно (пустое «для всех»)
      return keys.every((k) => cmp(valueOf(input, k, c.first_signal_networks), k))
    }
    for (const k of keys) {
      if (cmp(valueOf(input, k, c.first_signal_networks), k)) {
        if (!ctx.anythingKey) ctx.anythingKey = k
        return true
      }
    }
    return false
  }
  const k = sigKey(c.first_signal)
  if (!k) return cmp(0, null) // нет первого сигнала: сравнивается 0
  return cmp(valueOf(input, k, c.first_signal_networks), k)
}

// and над or: and сильнее; compare_type условия описывает связь с предыдущим
// (по умолчанию «or»). Пустой список условий — ложь.
function evalConditions(conditions: DeciderCondition[], input: CombInput, eachKey: SignalKey | null, ctx: DeciderCtx): boolean {
  if (conditions.length === 0) return false
  let anyGroup = false
  let group = true
  conditions.forEach((c, i) => {
    if (i > 0 && c.compare_type !== 'and') {
      anyGroup = anyGroup || group
      group = true
    }
    // условия вычисляются все (чтобы Anything нашёл свой сигнал) — без
    // короткого замыкания по результату группы
    const r = evalCondition(c, input, eachKey, ctx)
    group = group && r
  })
  return anyGroup || group
}

function applyOutput(o: DeciderOutput, input: CombInput, out: SignalMap, ctx: DeciderCtx): void {
  if (!o.signal?.name) return
  const copy = o.copy_count_from_input !== false // по умолчанию true (runtime-api)
  const constant = wrap32(o.constant ?? 1)
  const count = (key: SignalKey) => valueOf(input, key, o.networks)
  const emit = (key: SignalKey) => addTo(out, key, copy ? count(key) : constant)

  if (isEach(o.signal)) {
    if (ctx.eachKey) emit(ctx.eachKey)
    return
  }
  if (isEverything(o.signal)) {
    if (ctx.eachKey) return // Everything на выходе при Each в условиях недопустимо
    for (const k of sortedKeys(merged(input, o.networks))) emit(k)
    return
  }
  if (isAnything(o.signal)) {
    const key = ctx.eachKey ?? ctx.anythingKey ?? sortedKeys(merged(input, o.networks))[0]
    if (key) emit(key)
    return
  }
  const k = sigKey(o.signal)
  if (k) emit(k)
}

export function evalDecider(
  dc: { conditions?: DeciderCondition[]; outputs?: DeciderOutput[]; else_outputs?: DeciderOutput[] } | undefined,
  input: CombInput,
): SignalMap {
  const out: SignalMap = new Map()
  if (!dc) return out
  const conditions = dc.conditions ?? []
  const outputs = dc.outputs ?? []
  const elseOutputs = dc.else_outputs ?? []

  const eachConds = conditions.filter((c) => isEach(c.first_signal))
  if (eachConds.length === 0) {
    const ctx: DeciderCtx = { eachKey: null, anythingKey: null }
    const pass = evalConditions(conditions, input, null, ctx)
    for (const o of pass ? outputs : elseOutputs) applyOutput(o, input, out, ctx)
    return out
  }

  // Each в условиях: условия вычисляются для каждого входного сигнала,
  // каждый сигнал активирует обычные либо «иначе» выходы.
  const keys = new Set<SignalKey>()
  for (const c of eachConds) for (const k of merged(input, c.first_signal_networks).keys()) keys.add(k)
  for (const k of [...keys].sort()) {
    const ctx: DeciderCtx = { eachKey: k, anythingKey: null }
    const pass = evalConditions(conditions, input, k, ctx)
    for (const o of pass ? outputs : elseOutputs) applyOutput(o, input, out, ctx)
  }
  return out
}

// ---- constant ------------------------------------------------------------

export function evalConstant(cb: Record<string, unknown> | undefined): SignalMap {
  const out: SignalMap = new Map()
  if (!cb || cb.is_on === false) return out
  const sections = ((cb.sections as { sections?: unknown[] } | undefined)?.sections ?? []) as {
    active?: boolean
    multiplier?: number
    filters?: { name?: string; type?: string; quality?: string; count?: number }[]
  }[]
  for (const sec of sections) {
    if (sec.active === false) continue
    const mult = sec.multiplier ?? 1
    for (const f of sec.filters ?? []) {
      const key = sigKey(f)
      if (!key) continue
      addTo(out, key, Math.imul(wrap32(f.count ?? 0), wrap32(mult)))
    }
  }
  return out
}

// ---- selector ------------------------------------------------------------

const DEFAULT_QUALITY_LEVELS: Record<string, number> = { normal: 0, uncommon: 1, rare: 2, epic: 3, legendary: 5 }

// Детерминированный ГПСЧ (mulberry32) — random-режим воспроизводим по seed.
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export interface SelectorState {
  nextPick: number
  key: SignalKey | null
  rng: () => number
}

export function newSelectorState(seed: number): SelectorState {
  return { nextPick: 0, key: null, rng: mulberry32(seed) }
}

export function evalSelector(
  cb: SelectorControlBehavior | undefined,
  input: CombInput,
  opts: SimOptions,
  state: SelectorState,
  tick: number,
): SignalMap {
  const out: SignalMap = new Map()
  const inputs = mergeMaps(input.red, input.green) // у селектора обе сети суммируются
  const op = cb?.operation ?? 'select'
  const levels = { ...DEFAULT_QUALITY_LEVELS, ...(opts.qualityLevels ?? {}) }
  const levelOf = (q: string) => levels[q] ?? 0

  switch (op) {
    case 'select': {
      // Сортировка по значению (по убыванию — select_max по умолчанию true);
      // при равных значениях — по ключу (детерминированно; вики порядок не
      // описывает). Индекс 0-based; индекс вне диапазона — ничего, кроме
      // случая единственного входного сигнала (проходит всегда).
      const sorted = [...inputs.entries()].sort((a, b) =>
        (cb?.select_max === false ? a[1] - b[1] : b[1] - a[1]) || (a[0] < b[0] ? -1 : 1))
      if (sorted.length === 0) return out
      const idxKey = sigKey(cb?.index_signal)
      const index = idxKey ? valueOf(input, idxKey) : cb?.index_constant ?? 0
      const comparator = cb?.index_comparator ?? '='
      if (sorted.length === 1 && comparator === '=') {
        out.set(sorted[0][0], sorted[0][1])
        return out
      }
      sorted.forEach(([k, v], pos) => {
        if (compare(comparator === '=' ? '=' : comparator, pos, index)) out.set(k, v)
      })
      return out
    }
    case 'count': {
      const k = sigKey(cb?.count_signal)
      if (k) addTo(out, k, inputs.size)
      return out
    }
    case 'random': {
      const interval = Math.max(1, cb?.random_update_interval ?? 1)
      if (tick >= state.nextPick || (state.key && !inputs.has(state.key))) {
        const keys = sortedKeys(inputs)
        state.key = keys.length > 0 ? keys[Math.floor(state.rng() * keys.length)] : null
        state.nextPick = tick + interval
      }
      if (state.key && inputs.has(state.key)) out.set(state.key, inputs.get(state.key)!)
      return out
    }
    case 'stack-size':
    case 'rocket-capacity': {
      const table = op === 'stack-size' ? opts.stackSizes : opts.rocketCapacity
      for (const key of inputs.keys()) {
        const { type, name } = parseKey(key)
        const v = type === 'item' ? table?.[name] : undefined
        if (v !== undefined && v !== 0) addTo(out, key, v)
      }
      return out
    }
    case 'quality-filter': {
      const q = cb?.quality_filter?.quality
      for (const [key, v] of inputs) {
        if (!q || q === 'any' || compare(cb?.quality_filter?.comparator ?? '=', levelOf(parseKey(key).quality), levelOf(q))) out.set(key, v)
      }
      return out
    }
    case 'quality-select': {
      const highest = cb?.select_highest_quality !== false
      const best = new Map<string, SignalKey>()
      for (const key of sortedKeys(inputs)) {
        const { type, name, quality } = parseKey(key)
        const base = `${type}|${name}`
        const cur = best.get(base)
        if (!cur || (highest ? levelOf(quality) > levelOf(parseKey(cur).quality) : levelOf(quality) < levelOf(parseKey(cur).quality))) best.set(base, key)
      }
      for (const key of best.values()) out.set(key, inputs.get(key)!)
      return out
    }
    case 'quality-transfer': {
      const dest = cb?.quality_destination_signal
      if (!dest?.name) return out
      const destType = dest.type ?? 'item'
      const find = (name: string, type: string, quality?: string): SignalKey | undefined => {
        const exact = quality ? makeKey(type, name, quality) : undefined
        if (exact && inputs.has(exact)) return exact
        return sortedKeys(inputs).find((k) => {
          const p = parseKey(k)
          return p.type === type && p.name === name
        })
      }
      const target = find(dest.name, destType, dest.quality)
      if (!target) return out
      let quality: string | undefined
      if (cb?.select_quality_from_signal) {
        const src = cb.quality_source_signal
        const srcKey = src?.name ? find(src.name, src.type ?? 'item', src.quality) : undefined
        quality = srcKey ? parseKey(srcKey).quality : undefined // нужны оба сигнала
      } else {
        quality = cb?.quality_source_static ?? 'normal'
      }
      if (quality) {
        const t = parseKey(target)
        addTo(out, makeKey(t.type, t.name, quality), inputs.get(target)!)
      }
      return out
    }
    default:
      return out // time и неизвестные режимы не симулируются
  }
}
