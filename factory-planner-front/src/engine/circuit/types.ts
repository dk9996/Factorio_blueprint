// Симуляция схемной сети Factorio 2.0 (этап 2). Весь каталог engine/circuit —
// чистые функции без React и без стора; исполняется в Web Worker
// (worker.ts), но так же запускается напрямую в тестах (vitest).

export type SignalMap = Map<string, number>

// Ключ сигнала в сети: `type|name|quality` (type по умолчанию item, quality
// по умолчанию normal) — сигналы разного качества суммируются раздельно.
export type SignalKey = string

export type WireColor = 'red' | 'green'

export interface SimEntity {
  id: number
  type: string
  // control_behavior как в чертеже 2.0 (PlacedEntity.controlBehavior)
  controlBehavior?: Record<string, unknown>
}

export interface SimWire {
  id: string
  color: WireColor
  a: { entityId: number; connector: string }
  b: { entityId: number; connector: string }
}

export interface SimModel {
  entities: SimEntity[]
  wires: SimWire[]
}

// Данные каталога, нужные режимам селектора.
export interface SimOptions {
  // имя предмета -> размер стака
  stackSizes?: Record<string, number>
  // имя предмета -> вместимость ракеты (штук); нет в карте — не грузится
  rocketCapacity?: Record<string, number>
  // имя качества -> level (normal=0 …)
  qualityLevels?: Record<string, number>
  // зерно детерминированного random-режима селектора
  seed?: number
}

export const COMBINATOR_TYPES = new Set([
  'arithmetic-combinator', 'decider-combinator', 'selector-combinator',
])

// Сети коннекторов сущности по цветам: { red: { input: 3, output: 4 }, green: {...} }
export type EntityNets = Record<WireColor, Record<string, number>>

export interface SimTopology {
  netCount: number
  netColor: Record<number, WireColor>
  wireNet: Record<string, number>
  entityNets: Record<number, EntityNets>
}

export type SignalList = [SignalKey, number][]

export interface SimSnapshot {
  tick: number
  // сеть -> значения (только непустые сети)
  nets: Record<number, SignalList>
  // комбинатор/константа -> то, что он сейчас выдаёт на выход
  outs: Record<number, SignalList>
}
