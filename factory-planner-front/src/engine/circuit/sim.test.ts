import { describe, expect, it } from 'vitest'
import { arith } from './ops.ts'
import { createSimulation } from './sim.ts'
import type { SimEntity, SimModel, SimWire, WireColor } from './types.ts'

// ---- помощники ----------------------------------------------------------

const V = (name: string) => ({ name, type: 'virtual' as const })
const A = V('signal-A')
const B = V('signal-B')
const C = V('signal-C')
const X = V('signal-X')
const O = V('signal-O')
const EACH = V('signal-each')
const EVERYTHING = V('signal-everything')
const ANYTHING = V('signal-anything')
const key = (s: { name: string; type?: string }, q = 'normal') => `${s.type ?? 'item'}|${s.name}|${q}`

const arithE = (id: number, p: Record<string, unknown>): SimEntity =>
  ({ id, type: 'arithmetic-combinator', controlBehavior: { arithmetic_conditions: p } })
const deciderE = (id: number, dc: Record<string, unknown>): SimEntity =>
  ({ id, type: 'decider-combinator', controlBehavior: { decider_conditions: dc } })
const selectorE = (id: number, cb: Record<string, unknown>): SimEntity =>
  ({ id, type: 'selector-combinator', controlBehavior: cb })
const constE = (id: number, filters: { name: string; type?: string; count: number; quality?: string }[], extra: Record<string, unknown> = {}): SimEntity =>
  ({ id, type: 'constant-combinator', controlBehavior: { sections: { sections: [{ index: 1, filters: filters.map((f, i) => ({ index: i + 1, ...f })) }] }, ...extra } })
const poleE = (id: number): SimEntity => ({ id, type: 'electric-pole' })

let wid = 0
const w = (color: WireColor, a: number, ac: string, b: number, bc: string): SimWire =>
  ({ id: `w${wid++}`, color, a: { entityId: a, connector: ac }, b: { entityId: b, connector: bc } })
const IN = 'input'
const OUT = 'output'
const ONE = 'single'

function netValue(sim: ReturnType<typeof createSimulation>, color: WireColor, entityId: number, connector: string) {
  const net = sim.topology.entityNets[entityId]?.[color][connector]
  return new Map(net === undefined ? [] : sim.snapshot().nets[net] ?? [])
}
const outOf = (sim: ReturnType<typeof createSimulation>, id: number) => new Map(sim.snapshot().outs[id] ?? [])

// ---- 1. счётчик ----------------------------------------------------------

describe('счётчик с обратной связью', () => {
  // A + 1 -> A, выход соединён со своим входом красным проводом. Выход тика t
  // виден комбинатору на тике t+1 (задержка 1 тик), поэтому значение растёт
  // на 1 за тик: 1, 2, 3, ... (за 2 тика после старта — 2).
  it('растёт на 1 каждый тик', () => {
    const model: SimModel = {
      entities: [arithE(1, { first_signal: A, operation: '+', second_constant: 1, output_signal: A })],
      wires: [w('red', 1, OUT, 1, IN)],
    }
    const sim = createSimulation(model)
    const seen: number[] = []
    for (let t = 1; t <= 6; t++) {
      sim.step()
      seen.push(outOf(sim, 1).get(key(A)) ?? 0)
    }
    expect(seen).toEqual([1, 2, 3, 4, 5, 6])
    expect(sim.tick).toBe(6)
  })

  it('без провода обратной связи значение не растёт: выход не соединён со входом', () => {
    const sim = createSimulation({
      entities: [arithE(1, { first_signal: A, operation: '+', second_constant: 1, output_signal: A })],
      wires: [],
    })
    sim.step(5)
    expect(outOf(sim, 1).get(key(A))).toBe(1)
  })
})

// ---- 2. задержка ---------------------------------------------------------

describe('задержка 1 тик на комбинатор', () => {
  it('цепочка из 3 комбинаторов выдаёт результат через 3 тика', () => {
    // const A=7 -> (*2) -> (*3) -> (*5) -> столб-«датчик»; 7*2*3*5 = 210
    const model: SimModel = {
      entities: [
        constE(10, [{ ...A, count: 7 }]),
        arithE(1, { first_signal: A, operation: '*', second_constant: 2, output_signal: A }),
        arithE(2, { first_signal: A, operation: '*', second_constant: 3, output_signal: A }),
        arithE(3, { first_signal: A, operation: '*', second_constant: 5, output_signal: A }),
        poleE(20),
      ],
      wires: [
        w('red', 10, ONE, 1, IN),
        w('red', 1, OUT, 2, IN),
        w('red', 2, OUT, 3, IN),
        w('red', 3, OUT, 20, ONE),
      ],
    }
    const sim = createSimulation(model)
    const probe = () => netValue(sim, 'red', 20, ONE).get(key(A)) ?? 0
    sim.step(); expect(probe()).toBe(0); expect(outOf(sim, 1).get(key(A))).toBe(14)
    sim.step(); expect(probe()).toBe(0); expect(outOf(sim, 2).get(key(A))).toBe(42)
    sim.step(); expect(probe()).toBe(210)
  })
})

// ---- 3-4. сети -----------------------------------------------------------

describe('сети', () => {
  it('красная и зелёная сети не смешиваются, но суммируются на входе комбинатора', () => {
    const model: SimModel = {
      entities: [
        constE(10, [{ ...A, count: 5 }]), // красная сеть
        constE(11, [{ ...A, count: 3 }]), // зелёная сеть
        arithE(1, { first_signal: A, operation: '+', second_constant: 0, output_signal: A }),
        arithE(2, { first_signal: A, first_signal_networks: { red: true, green: false }, operation: '+', second_constant: 0, output_signal: A }),
        arithE(3, { first_signal: A, first_signal_networks: { red: false, green: true }, operation: '+', second_constant: 0, output_signal: A }),
      ],
      wires: [
        w('red', 10, ONE, 1, IN), w('green', 11, ONE, 1, IN),
        w('red', 10, ONE, 2, IN), w('green', 11, ONE, 2, IN),
        w('red', 10, ONE, 3, IN), w('green', 11, ONE, 3, IN),
      ],
    }
    const sim = createSimulation(model)
    sim.step()
    expect(netValue(sim, 'red', 1, IN).get(key(A))).toBe(5)
    expect(netValue(sim, 'green', 1, IN).get(key(A))).toBe(3)
    expect(outOf(sim, 1).get(key(A))).toBe(8) // 5 + 3
    expect(outOf(sim, 2).get(key(A))).toBe(5) // только красная
    expect(outOf(sim, 3).get(key(A))).toBe(3) // только зелёная
  })

  it('выход и вход одного комбинатора — разные сети; чужие сети цвета не пересекаются', () => {
    const sim = createSimulation({
      entities: [constE(10, [{ ...A, count: 1 }]), arithE(1, { first_signal: A, operation: '+', second_constant: 0, output_signal: B })],
      wires: [w('red', 10, ONE, 1, IN), w('green', 1, OUT, 10, ONE)],
    })
    sim.step()
    const t = sim.topology.entityNets
    expect(t[1].red[IN]).toBeDefined()
    expect(t[1].green[OUT]).toBeDefined()
    expect(t[1].red[OUT]).toBeUndefined()
    // красная сеть A, зелёная (выход -> константа) — B + A (константа тоже на ней)
    expect(netValue(sim, 'red', 1, IN).get(key(A))).toBe(1)
    expect(netValue(sim, 'green', 10, ONE).get(key(B))).toBe(1)
    expect(netValue(sim, 'green', 10, ONE).get(key(A))).toBe(1)
  })

  it('выходы нескольких комбинаторов на одну сеть суммируются', () => {
    const model: SimModel = {
      entities: [
        arithE(1, { first_constant: 3, operation: '+', second_constant: 4, output_signal: A }), // 7
        arithE(2, { first_constant: 10, operation: '*', second_constant: 2, output_signal: A }), // 20
        arithE(3, { first_constant: 1, operation: '+', second_constant: 1, output_signal: B }), // 2 (другой сигнал)
        poleE(20),
      ],
      wires: [w('red', 1, OUT, 20, ONE), w('red', 2, OUT, 20, ONE), w('red', 3, OUT, 20, ONE)],
    }
    const sim = createSimulation(model)
    sim.step()
    const net = netValue(sim, 'red', 20, ONE)
    expect(net.get(key(A))).toBe(27)
    expect(net.get(key(B))).toBe(2)
  })

  it('сигналы разного качества — разные ключи', () => {
    const sim = createSimulation({
      entities: [
        constE(10, [{ name: 'iron-plate', count: 5 }, { name: 'iron-plate', count: 7, quality: 'rare' }]),
        poleE(20),
      ],
      wires: [w('red', 10, ONE, 20, ONE)],
    })
    const net = netValue(sim, 'red', 20, ONE)
    expect(net.get('item|iron-plate|normal')).toBe(5)
    expect(net.get('item|iron-plate|rare')).toBe(7)
  })
})

// ---- 5. арифметика -------------------------------------------------------

describe('арифметика int32', () => {
  it('деление и остаток на 0 дают 0', () => {
    expect(arith('/', 10, 0)).toBe(0)
    expect(arith('%', 10, 0)).toBe(0)
    expect(arith('/', 0, 0)).toBe(0)
  })
  it('деление усекает к нулю, остаток — знак делимого (вики)', () => {
    expect(arith('/', 21, 10)).toBe(2)
    expect(arith('/', -21, 10)).toBe(-2)
    expect(arith('/', -19, 10)).toBe(-1)
    expect(arith('/', 21, -10)).toBe(-2)
    expect(arith('/', -21, -10)).toBe(2)
    expect(arith('%', 13, 3)).toBe(1)
    expect(arith('%', 13, -3)).toBe(1)
    expect(arith('%', -13, 3)).toBe(-1)
    expect(arith('%', -13, -3)).toBe(-1)
    expect(arith('/', -2147483648, -1)).toBe(-2147483648)
  })
  it('переполнение оборачивается', () => {
    expect(arith('+', 2147483647, 1)).toBe(-2147483648)
    expect(arith('+', 2147483647, 10)).toBe(-2147483639) // пример из вики
    expect(arith('-', -2147483648, 1)).toBe(2147483647)
    expect(arith('*', 2147483647, 2)).toBe(-2)
    expect(arith('*', 65536, 65536)).toBe(0)
    expect(arith('^', 3, 31)).toBe(Number(BigInt.asIntN(32, 3n ** 31n)))
    expect(arith('^', 2, 31)).toBe(-2147483648)
  })
  it('степень: 0^0=1, отрицательный показатель = 0 (кроме ±1)', () => {
    expect(arith('^', 2, 10)).toBe(1024)
    expect(arith('^', 0, 0)).toBe(1)
    expect(arith('^', 2, -1)).toBe(0)
    expect(arith('^', 1, -5)).toBe(1)
    expect(arith('^', -1, -3)).toBe(-1)
  })
  it('сдвиги: влево теряет старшие, вправо арифметический, величина по маске 31', () => {
    expect(arith('<<', 1, 31)).toBe(-2147483648)
    expect(arith('<<', 1, 32)).toBe(1)
    expect(arith('<<', 1, 33)).toBe(2)
    expect(arith('>>', -8, 1)).toBe(-4)
    expect(arith('>>', -1, 31)).toBe(-1)
    expect(arith('>>', 8, 1)).toBe(4)
    expect(arith('<<', 0x40000000, 1)).toBe(-2147483648)
  })
  it('битовые операции', () => {
    expect(arith('AND', 12, 10)).toBe(8)
    expect(arith('OR', 12, 10)).toBe(14)
    expect(arith('XOR', 12, 10)).toBe(6)
    expect(arith('AND', -1, 255)).toBe(255)
  })
  it('через симуляцию: деление на 0 не даёт сигнала, переполнение в выходе', () => {
    const sim = createSimulation({
      entities: [
        arithE(1, { first_constant: 10, operation: '/', second_constant: 0, output_signal: A }),
        arithE(2, { first_constant: 2147483647, operation: '+', second_constant: 1, output_signal: B }),
      ],
      wires: [],
    })
    sim.step()
    expect(outOf(sim, 1).size).toBe(0)
    expect(outOf(sim, 2).get(key(B))).toBe(-2147483648)
  })
})

// ---- 6. each / anything / everything -------------------------------------

function sim3(entities: SimEntity[], inputFilters: { name: string; type?: string; count: number }[], deciderIdx = 1) {
  void deciderIdx
  const model: SimModel = {
    entities: [constE(10, inputFilters), ...entities],
    wires: [w('red', 10, ONE, 1, IN)],
  }
  const sim = createSimulation(model)
  sim.step()
  return sim
}

describe('Each / Everything / Anything', () => {
  it('arithmetic: Each на входе и на выходе — по каждому сигналу', () => {
    const sim = sim3(
      [arithE(1, { first_signal: EACH, operation: '*', second_constant: 10, output_signal: EACH })],
      [{ ...A, count: 1 }, { ...B, count: 2 }, { ...C, count: 3 }],
    )
    expect(outOf(sim, 1)).toEqual(new Map([[key(A), 10], [key(B), 20], [key(C), 30]]))
  })
  it('arithmetic: Each на входе, конкретный сигнал на выходе — сумма результатов', () => {
    const sim = sim3(
      [arithE(1, { first_signal: EACH, operation: '*', second_constant: 2, output_signal: X })],
      [{ ...A, count: 1 }, { ...B, count: 2 }, { ...C, count: 3 }],
    )
    expect(outOf(sim, 1)).toEqual(new Map([[key(X), 12]]))
  })
  it('decider: Everything — истинно, только если выполнено для всех (пустой вход — истина)', () => {
    const dec = (n = 1) => deciderE(n, {
      conditions: [{ first_signal: EVERYTHING, comparator: '>', constant: 0 }],
      outputs: [{ signal: O, copy_count_from_input: false, constant: 1 }],
    })
    expect(outOf(sim3([dec()], [{ ...A, count: 5 }, { ...B, count: 3 }]), 1).get(key(O))).toBe(1)
    expect(outOf(sim3([dec()], [{ ...A, count: 5 }, { ...B, count: -3 }]), 1).get(key(O))).toBeUndefined()
    expect(outOf(sim3([dec()], []), 1).get(key(O))).toBe(1)
  })
  it('decider: Anything — истинно, если выполнено хотя бы для одного (пустой вход — ложь)', () => {
    const dec = () => deciderE(1, {
      conditions: [{ first_signal: ANYTHING, comparator: '<', constant: 0 }],
      outputs: [{ signal: O, copy_count_from_input: false, constant: 1 }],
    })
    expect(outOf(sim3([dec()], [{ ...A, count: 5 }, { ...B, count: -3 }]), 1).get(key(O))).toBe(1)
    expect(outOf(sim3([dec()], [{ ...A, count: 5 }, { ...B, count: 3 }]), 1).get(key(O))).toBeUndefined()
    expect(outOf(sim3([dec()], []), 1).get(key(O))).toBeUndefined()
  })
  it('decider: Each в условии — на каждый сигнал; выход Each копирует прошедшие, «иначе» — остальные', () => {
    const sim = sim3(
      [deciderE(1, {
        conditions: [{ first_signal: EACH, comparator: '>', constant: 3 }],
        outputs: [{ signal: EACH, copy_count_from_input: true }],
        else_outputs: [{ signal: X, copy_count_from_input: false, constant: 1 }],
      })],
      [{ ...A, count: 5 }, { ...B, count: 3 }, { ...C, count: 7 }],
    )
    // A=5, C=7 проходят и копируются; B=3 не проходит — «иначе» даёт X=1 (один сигнал)
    expect(outOf(sim, 1)).toEqual(new Map([[key(A), 5], [key(C), 7], [key(X), 1]]))
  })
  it('decider: Each в условии + конкретный выход = число подошедших сигналов', () => {
    const sim = sim3(
      [deciderE(1, {
        conditions: [{ first_signal: EACH, comparator: '>', constant: 3 }],
        outputs: [{ signal: O, copy_count_from_input: false, constant: 1 }],
      })],
      [{ ...A, count: 5 }, { ...B, count: 3 }, { ...C, count: 7 }],
    )
    expect(outOf(sim, 1).get(key(O))).toBe(2)
  })
  it('decider: выход Anything — ровно один подошедший сигнал; Everything — все', () => {
    const inputs = [{ ...A, count: 5 }, { ...B, count: 2 }, { ...C, count: 7 }]
    const one = sim3([deciderE(1, {
      conditions: [{ first_signal: ANYTHING, comparator: '>', constant: 4 }],
      outputs: [{ signal: ANYTHING, copy_count_from_input: true }],
    })], inputs)
    expect(outOf(one, 1)).toEqual(new Map([[key(A), 5]])) // первый подошедший (по ключу)
    const all = sim3([deciderE(1, {
      conditions: [{ first_signal: EVERYTHING, comparator: '>', constant: 0 }],
      outputs: [{ signal: EVERYTHING, copy_count_from_input: true }],
    })], inputs)
    expect(outOf(all, 1)).toEqual(new Map([[key(A), 5], [key(B), 2], [key(C), 7]]))
  })
  it('decider: and сильнее or; compare_type по умолчанию or', () => {
    // A>0 OR B>0 AND C>0   ==   A>0 OR (B>0 AND C>0)
    const dec = () => deciderE(1, {
      conditions: [
        { first_signal: A, comparator: '>', constant: 0 },
        { first_signal: B, comparator: '>', constant: 0, compare_type: 'or' },
        { first_signal: C, comparator: '>', constant: 0, compare_type: 'and' },
      ],
      outputs: [{ signal: O, copy_count_from_input: false, constant: 1 }],
    })
    expect(outOf(sim3([dec()], [{ ...A, count: 1 }]), 1).get(key(O))).toBe(1)
    expect(outOf(sim3([dec()], [{ ...B, count: 1 }]), 1).get(key(O))).toBeUndefined()
    expect(outOf(sim3([dec()], [{ ...B, count: 1 }, { ...C, count: 1 }]), 1).get(key(O))).toBe(1)
  })
  it('decider: выбор сети в условии и значение входа по выбранным проводам', () => {
    const model: SimModel = {
      entities: [
        constE(10, [{ ...A, count: 5 }]),
        constE(11, [{ ...A, count: -5 }]),
        deciderE(1, {
          conditions: [{ first_signal: A, first_signal_networks: { red: true, green: false }, comparator: '>', constant: 0 }],
          outputs: [{ signal: A, copy_count_from_input: true, networks: { red: false, green: true } }],
        }),
      ],
      wires: [w('red', 10, ONE, 1, IN), w('green', 11, ONE, 1, IN)],
    }
    const sim = createSimulation(model)
    sim.step()
    expect(outOf(sim, 1).get(key(A))).toBe(-5) // условие по красной, значение с зелёной
  })
})

// ---- 7. SR-защёлка --------------------------------------------------------

describe('SR-защёлка на двух decider', () => {
  // Q = NOR(R, B), B = NOR(S, Q): перекрёстные зелёные провода, S и R с
  // красных сетей от констант. Состояние держится после снятия S и R.
  const R = V('signal-R')
  const S = V('signal-S')
  const Q = V('signal-Q')
  const QB = V('signal-B')
  const build = () => {
    const model: SimModel = {
      entities: [
        constE(10, [{ ...S, count: 1 }]),
        constE(11, [{ ...R, count: 1 }], { is_on: false }),
        deciderE(1, { // Q
          conditions: [
            { first_signal: R, comparator: '=', constant: 0 },
            { first_signal: QB, comparator: '=', constant: 0, compare_type: 'and' },
          ],
          outputs: [{ signal: Q, copy_count_from_input: false, constant: 1 }],
        }),
        deciderE(2, { // B (not Q)
          conditions: [
            { first_signal: S, comparator: '=', constant: 0 },
            { first_signal: Q, comparator: '=', constant: 0, compare_type: 'and' },
          ],
          outputs: [{ signal: QB, copy_count_from_input: false, constant: 1 }],
        }),
      ],
      wires: [
        w('red', 11, ONE, 1, IN), // R -> Q
        w('red', 10, ONE, 2, IN), // S -> B
        w('green', 1, OUT, 2, IN),
        w('green', 2, OUT, 1, IN),
      ],
    }
    return createSimulation(model)
  }
  const state = (sim: ReturnType<typeof createSimulation>) => [outOf(sim, 1).get(key(Q)) ?? 0, outOf(sim, 2).get(key(QB)) ?? 0]

  it('set, hold, reset, hold', () => {
    const sim = build()
    sim.step(6)
    expect(state(sim)).toEqual([1, 0]) // set
    sim.setConstant(10, { is_on: false, sections: { sections: [] } })
    sim.step(20)
    expect(state(sim)).toEqual([1, 0]) // держит после снятия S
    sim.setConstant(11, { sections: { sections: [{ index: 1, filters: [{ index: 1, ...R, count: 1 }] }] } })
    sim.step(6)
    expect(state(sim)).toEqual([0, 1]) // reset
    sim.setConstant(11, { is_on: false })
    sim.step(20)
    expect(state(sim)).toEqual([0, 1]) // держит после снятия R
  })
})

// ---- 8. constant ---------------------------------------------------------

describe('constant combinator', () => {
  const probe = (cb: SimEntity) => {
    const sim = createSimulation({ entities: [cb, poleE(20)], wires: [w('red', cb.id, ONE, 20, ONE)] })
    return netValue(sim, 'red', 20, ONE)
  }
  it('включён — выдаёт, выключен — нет', () => {
    expect(probe(constE(10, [{ ...A, count: 4 }])).get(key(A))).toBe(4)
    expect(probe(constE(10, [{ ...A, count: 4 }], { is_on: true })).get(key(A))).toBe(4)
    expect(probe(constE(10, [{ ...A, count: 4 }], { is_on: false })).size).toBe(0)
  })
  it('секции: множитель, неактивная секция, суммирование одинаковых сигналов', () => {
    const cb: SimEntity = {
      id: 10,
      type: 'constant-combinator',
      controlBehavior: {
        sections: {
          sections: [
            { index: 1, multiplier: 3, filters: [{ index: 1, ...A, count: 2 }, { index: 2, ...A, count: 1 }] }, // (2+1)... каждый * 3 = 9
            { index: 2, active: false, filters: [{ index: 1, ...B, count: 100 }] },
            { index: 3, filters: [{ index: 1, ...A, count: 1 }] },
          ],
        },
      },
    }
    const net = probe(cb)
    expect(net.get(key(A))).toBe(2 * 3 + 1 * 3 + 1)
    expect(net.get(key(B))).toBeUndefined()
  })
  it('значения константы без задержки: видны на тике 0', () => {
    const sim = createSimulation({ entities: [constE(10, [{ ...A, count: 1 }]), poleE(20)], wires: [w('green', 10, ONE, 20, ONE)] })
    expect(sim.tick).toBe(0)
    expect(netValue(sim, 'green', 20, ONE).get(key(A))).toBe(1)
  })
})

// ---- 9. selector ---------------------------------------------------------

describe('selector combinator', () => {
  const run = (cb: Record<string, unknown>, filters: { name: string; type?: string; count: number; quality?: string }[], opts = {}) => {
    const sim = createSimulation({
      entities: [constE(10, filters), selectorE(1, cb)],
      wires: [w('red', 10, ONE, 1, IN)],
    }, opts)
    sim.step()
    return outOf(sim, 1)
  }
  const three = [{ ...A, count: 5 }, { ...B, count: 3 }, { ...C, count: 9 }]

  it('count: число различных входных сигналов', () => {
    expect(run({ operation: 'count', count_signal: X }, three)).toEqual(new Map([[key(X), 3]]))
    expect(run({ operation: 'count', count_signal: X }, [])).toEqual(new Map())
  })
  it('select: максимум (индекс 0), второй по величине, минимум', () => {
    expect(run({ operation: 'select', select_max: true, index_constant: 0 }, three)).toEqual(new Map([[key(C), 9]]))
    expect(run({ operation: 'select', index_constant: 1 }, three)).toEqual(new Map([[key(A), 5]]))
    expect(run({ operation: 'select', select_max: false, index_constant: 0 }, three)).toEqual(new Map([[key(B), 3]]))
  })
  it('select: индекс вне диапазона — ничего, единственный сигнал проходит всегда', () => {
    expect(run({ operation: 'select', index_constant: 3 }, three)).toEqual(new Map())
    expect(run({ operation: 'select', index_constant: 7 }, [{ ...A, count: 4 }])).toEqual(new Map([[key(A), 4]]))
  })
  it('select: индекс из сигнала', () => {
    const sim = createSimulation({
      entities: [constE(10, [...three, { ...X, count: 2 }]), selectorE(1, { operation: 'select', index_signal: X })],
      wires: [w('red', 10, ONE, 1, IN)],
    })
    sim.step()
    // входы: C=9, A=5, B=3, X=2 -> по убыванию: C, A, B, X; индекс 2 -> B
    expect(outOf(sim, 1)).toEqual(new Map([[key(B), 3]]))
  })
  it('stack-size и rocket-capacity используют данные каталога', () => {
    const opts = { stackSizes: { 'iron-plate': 100, 'coal': 50 }, rocketCapacity: { 'iron-plate': 1000 } }
    const inputs = [{ name: 'iron-plate', count: 3 }, { name: 'coal', count: 1 }, { ...A, count: 5 }]
    expect(run({ operation: 'stack-size' }, inputs, opts)).toEqual(new Map([['item|iron-plate|normal', 100], ['item|coal|normal', 50]]))
    expect(run({ operation: 'rocket-capacity' }, inputs, opts)).toEqual(new Map([['item|iron-plate|normal', 1000]]))
  })
  it('random: детерминирован по seed и держит выбор интервал тиков', () => {
    const picks = (seed: number) => {
      const sim = createSimulation({
        entities: [constE(10, three), selectorE(1, { operation: 'random', random_update_interval: 3 })],
        wires: [w('red', 10, ONE, 1, IN)],
      }, { seed })
      const seq: string[] = []
      for (let i = 0; i < 12; i++) { sim.step(); seq.push([...outOf(sim, 1).keys()][0]) }
      return seq
    }
    const a = picks(42)
    expect(picks(42)).toEqual(a)
    for (let g = 0; g < 4; g++) expect(new Set(a.slice(g * 3, g * 3 + 3)).size).toBe(1) // 3 тика подряд один сигнал
  })
  it('quality-filter: только сигналы с подходящим качеством', () => {
    const inputs = [
      { name: 'iron-plate', count: 1 },
      { name: 'iron-plate', count: 2, quality: 'rare' },
      { name: 'coal', count: 3, quality: 'legendary' },
    ]
    const opts = { qualityLevels: { normal: 0, uncommon: 1, rare: 2, epic: 3, legendary: 5 } }
    const got = run({ operation: 'quality-filter', quality_filter: { quality: 'rare', comparator: '>=' } }, inputs, opts)
    expect(got).toEqual(new Map([['item|iron-plate|rare', 2], ['item|coal|legendary', 3]]))
  })
  it('quality-transfer: качество переносится на целевой сигнал, если он есть на входе', () => {
    const inputs = [{ name: 'iron-plate', count: 4 }]
    expect(run({
      operation: 'quality-transfer',
      quality_destination_signal: { name: 'iron-plate' },
      quality_source_static: 'epic',
    }, inputs)).toEqual(new Map([['item|iron-plate|epic', 4]]))
    expect(run({
      operation: 'quality-transfer',
      quality_destination_signal: { name: 'copper-plate' },
      quality_source_static: 'epic',
    }, inputs)).toEqual(new Map())
  })
})

// ---- 10. производительность ----------------------------------------------

describe('производительность', () => {
  it('500 комбинаторов: средний тик намного короче кадра (16.7 мс на 60 тик/с)', () => {
    const N = 500
    const entities: SimEntity[] = [constE(1000, Array.from({ length: 10 }, (_, i) => ({ ...V(`signal-${i}`), count: i + 1 })))]
    const wires: SimWire[] = [w('red', 1000, ONE, 1, IN)]
    // кольцо: each + 1 -> each (10 сигналов), красный провод к соседу
    for (let i = 1; i <= N; i++) {
      entities.push(arithE(i, { first_signal: EACH, operation: '+', second_constant: 1, output_signal: EACH }))
      const next = i === N ? 1 : i + 1
      wires.push(w('red', i, OUT, next, IN))
    }
    const sim = createSimulation({ entities, wires })
    sim.step(60) // прогрев JIT
    const ticks = 600
    const t0 = performance.now()
    sim.step(ticks)
    const perTick = (performance.now() - t0) / ticks
    console.log(`500 комбинаторов: ${perTick.toFixed(3)} мс/тик`)
    expect(perTick).toBeLessThan(4)
    expect(Object.keys(sim.snapshot().outs).length).toBe(N + 1) // + константа
  })
})
