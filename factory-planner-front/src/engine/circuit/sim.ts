import type { ArithmeticParameters, SelectorControlBehavior } from '../../lib/circuit/types.ts'
import {
  evalArithmetic, evalConstant, evalDecider, evalSelector, newSelectorState, type CombInput, type SelectorState,
} from './combinators.ts'
import { addTo } from './signals.ts'
import { buildTopology } from './topology.ts'
import type { SignalList, SignalMap, SimModel, SimOptions, SimSnapshot, SimTopology } from './types.ts'

// Дискретные тики с двойной буферизацией: на тике t все комбинаторы читают
// значения сетей, посчитанные из выходов тика t (+ константы), и пишут новые
// выходы, которые станут видны на тике t+1 — задержка ровно 1 тик на каждый
// комбинатор (вики: «one tick of latency»). Значение сети = сумма выходов
// всех подключённых к ней output-коннекторов + константы, по ключу сигнала.
interface Comb {
  id: number
  type: string
  cb: Record<string, unknown> | undefined
  inRed: number
  inGreen: number
  outNets: number[]
  state?: SelectorState
}

interface ConstSrc {
  id: number
  nets: number[]
  value: SignalMap
}

export interface Simulation {
  readonly topology: SimTopology
  readonly tick: number
  step(n?: number): void
  snapshot(): SimSnapshot
  // Подменить настройки константного комбинатора БЕЗ сброса состояния
  // (для тестов и будущего переключения на лету).
  setConstant(entityId: number, cb: Record<string, unknown> | undefined): void
}

const toList = (m: SignalMap): SignalList => [...m.entries()]

export function createSimulation(model: SimModel, opts: SimOptions = {}): Simulation {
  const topology = buildTopology(model)
  const seed = opts.seed ?? 1
  const combs: Comb[] = []
  const consts = new Map<number, ConstSrc>()

  for (const e of model.entities) {
    const nets = topology.entityNets[e.id]
    if (e.type === 'constant-combinator') {
      const attached = [nets?.red.single, nets?.green.single].filter((n): n is number => n !== undefined)
      consts.set(e.id, { id: e.id, nets: attached, value: evalConstant(e.controlBehavior) })
    } else if (e.type === 'arithmetic-combinator' || e.type === 'decider-combinator' || e.type === 'selector-combinator') {
      combs.push({
        id: e.id,
        type: e.type,
        cb: e.controlBehavior,
        inRed: nets?.red.input ?? -1,
        inGreen: nets?.green.input ?? -1,
        outNets: [nets?.red.output, nets?.green.output].filter((n): n is number => n !== undefined),
        state: e.type === 'selector-combinator' ? newSelectorState((seed ^ Math.imul(e.id, 2654435761)) >>> 0) : undefined,
      })
    }
  }

  // источники сети: какие комбинаторы пишут в неё выходом
  const netSources: number[][] = Array.from({ length: topology.netCount }, () => [])
  combs.forEach((c, i) => c.outNets.forEach((n) => netSources[n].push(i)))

  let outs: SignalMap[] = combs.map(() => new Map())
  let tick = 0

  function netValues(): (SignalMap | undefined)[] {
    const vals: (SignalMap | undefined)[] = new Array(topology.netCount)
    for (const c of consts.values()) {
      if (c.value.size === 0) continue
      for (const n of c.nets) {
        const m = (vals[n] ??= new Map())
        for (const [k, v] of c.value) addTo(m, k, v)
      }
    }
    for (let n = 0; n < netSources.length; n++) {
      for (const ci of netSources[n]) {
        const o = outs[ci]
        if (o.size === 0) continue
        const m = (vals[n] ??= new Map())
        for (const [k, v] of o) addTo(m, k, v)
      }
    }
    return vals
  }

  function step(n = 1): void {
    for (let s = 0; s < n; s++) {
      const vals = netValues()
      const next: SignalMap[] = new Array(combs.length)
      for (let i = 0; i < combs.length; i++) {
        const c = combs[i]
        const input: CombInput = {
          red: c.inRed >= 0 ? vals[c.inRed] : undefined,
          green: c.inGreen >= 0 ? vals[c.inGreen] : undefined,
        }
        if (c.type === 'arithmetic-combinator') {
          next[i] = evalArithmetic((c.cb as { arithmetic_conditions?: ArithmeticParameters } | undefined)?.arithmetic_conditions, input)
        } else if (c.type === 'decider-combinator') {
          next[i] = evalDecider((c.cb as { decider_conditions?: Parameters<typeof evalDecider>[0] } | undefined)?.decider_conditions, input)
        } else {
          next[i] = evalSelector(c.cb as SelectorControlBehavior | undefined, input, opts, c.state!, tick)
        }
      }
      outs = next
      tick++
    }
  }

  return {
    topology,
    get tick() { return tick },
    step,
    setConstant(entityId, cb) {
      const c = consts.get(entityId)
      if (c) c.value = evalConstant(cb)
    },
    snapshot() {
      const vals = netValues()
      const nets: Record<number, SignalList> = {}
      vals.forEach((m, i) => { if (m && m.size > 0) nets[i] = toList(m) })
      const o: Record<number, SignalList> = {}
      combs.forEach((c, i) => { if (outs[i].size > 0) o[c.id] = toList(outs[i]) })
      for (const c of consts.values()) if (c.value.size > 0) o[c.id] = toList(c.value)
      return { tick, nets, outs: o }
    },
  }
}
