import type { PlacedEntity } from '../../store/canvasStore'
import type { SimModel, SimOptions } from '../../engine/circuit/types'
import type { SignalCatalog } from './signals'
import type { Wire } from './types'
import type { QualityDef } from '../quality'

// Состояние редактора -> вход симуляции. В модель попадают комбинаторы и
// сущности, к которым подключены провода; остальное симуляции не нужно.
const ALWAYS = new Set(['arithmetic-combinator', 'decider-combinator', 'constant-combinator', 'selector-combinator'])

export function buildSimModel(entities: PlacedEntity[], wires: Wire[]): SimModel {
  const wired = new Set<number>()
  for (const w of wires) {
    wired.add(w.a.entityId)
    wired.add(w.b.entityId)
  }
  return {
    entities: entities
      .filter((e) => wired.has(e.id) || ALWAYS.has(e.type ?? ''))
      .map((e) => ({ id: e.id, type: e.type ?? '', controlBehavior: e.controlBehavior as Record<string, unknown> | undefined })),
    wires: wires.map((w) => ({ id: w.id, color: w.color, a: w.a, b: w.b })),
  }
}

// Данные каталога для режимов селектора (размер стака, вместимость ракеты,
// уровни качества).
export function buildSimOptions(catalog: SignalCatalog, qualities: QualityDef[]): SimOptions {
  const stackSizes: Record<string, number> = {}
  const rocketCapacity: Record<string, number> = {}
  for (const s of catalog.signals) {
    if (s.type !== 'item') continue
    if (s.stackSize !== undefined) stackSizes[s.name] = s.stackSize
    if (s.rocketCapacity !== undefined) rocketCapacity[s.name] = s.rocketCapacity
  }
  const qualityLevels: Record<string, number> = {}
  for (const q of qualities) qualityLevels[q.name] = q.level
  return { stackSizes, rocketCapacity, qualityLevels, seed: 1 }
}
