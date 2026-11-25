import type { RawWire } from '../../types/blueprint.ts'
import type { Wire, WireColor } from './types.ts'
import { newWireId } from './connectors.ts'

// Идентификаторы коннекторов в blueprint.wires (формат 2.0):
//   [entity_number_a, connector_a, entity_number_b, connector_b]
// Значения (из задачи; НЕ подтверждены настоящей строкой из игры — см.
// отчёт, нужен тестовый чертёж): circuit_red=1, circuit_green=2,
// combinator_input_red=3, combinator_input_green=4, combinator_output_red=5,
// combinator_output_green=6, pole_copper=5. Номер 5 у столба — медь, у
// комбинатора — выход (красный): трактовка зависит от типа сущности.
export const WIRE_CONNECTOR = {
  circuit_red: 1,
  circuit_green: 2,
  combinator_input_red: 3,
  combinator_input_green: 4,
  combinator_output_red: 5,
  combinator_output_green: 6,
  pole_copper: 5,
} as const

const COMBINATOR_TYPES = new Set(['arithmetic-combinator', 'decider-combinator', 'selector-combinator'])

export interface ClassifiedConnector {
  circuit: true
  color: WireColor
  connector: 'single' | 'input' | 'output'
}

// entityType — type прототипа ('electric-pole', 'arithmetic-combinator', ...).
// null — не схемный провод (медь столбов и т.п.): хранится как есть.
export function classifyConnector(entityType: string | undefined, id: number): ClassifiedConnector | null {
  const isCombinator = !!entityType && COMBINATOR_TYPES.has(entityType)
  if (id === 1 || id === 2) return { circuit: true, color: id === 1 ? 'red' : 'green', connector: 'single' }
  if (isCombinator) {
    if (id === 3 || id === 4) return { circuit: true, color: id === 3 ? 'red' : 'green', connector: 'input' }
    if (id === 5 || id === 6) return { circuit: true, color: id === 5 ? 'red' : 'green', connector: 'output' }
  }
  return null
}

export function connectorId(entityType: string | undefined, connector: string, color: WireColor): number {
  if (connector === 'input') return color === 'red' ? WIRE_CONNECTOR.combinator_input_red : WIRE_CONNECTOR.combinator_input_green
  if (connector === 'output') return color === 'red' ? WIRE_CONNECTOR.combinator_output_red : WIRE_CONNECTOR.combinator_output_green
  void entityType
  return color === 'red' ? WIRE_CONNECTOR.circuit_red : WIRE_CONNECTOR.circuit_green
}

export interface ParsedWires {
  wires: Wire[]
  // Остальные провода (медь столбов, power switch, нераспознанные) — как
  // есть, ссылаются на ОРИГИНАЛЬНЫЕ entity_number.
  passthrough: RawWire[]
}

// raw.wires -> провода модели (красные/зелёные) + остаток. Красный провод
// соединяет коннекторы ОДНОГО цвета (оба конца red либо оба green); пары
// с разными цветами считаются нераспознанными и сохраняются в passthrough.
export function parseBlueprintWires(
  rawWires: RawWire[] | undefined,
  entityNumberToId: Record<number, number>,
  typeOfEntityNumber: (entityNumber: number) => string | undefined,
): ParsedWires {
  const wires: Wire[] = []
  const passthrough: RawWire[] = []
  for (const raw of rawWires ?? []) {
    const [na, ca, nb, cb] = raw
    const ida = entityNumberToId[na]
    const idb = entityNumberToId[nb]
    const A = classifyConnector(typeOfEntityNumber(na), ca)
    const B = classifyConnector(typeOfEntityNumber(nb), cb)
    if (ida === undefined || idb === undefined || !A || !B || A.color !== B.color) {
      passthrough.push(raw)
      continue
    }
    wires.push({
      id: newWireId(),
      color: A.color,
      a: { entityId: ida, connector: A.connector },
      b: { entityId: idb, connector: B.connector },
    })
  }
  return { wires, passthrough }
}

export function serializeWires(
  wires: Wire[],
  placedIdToNumber: Map<number, number>,
  typeOfPlacedId: (placedId: number) => string | undefined,
): RawWire[] {
  const out: RawWire[] = []
  for (const w of wires) {
    const na = placedIdToNumber.get(w.a.entityId)
    const nb = placedIdToNumber.get(w.b.entityId)
    if (na === undefined || nb === undefined) continue
    out.push([
      na,
      connectorId(typeOfPlacedId(w.a.entityId), w.a.connector, w.color),
      nb,
      connectorId(typeOfPlacedId(w.b.entityId), w.b.connector, w.color),
    ])
  }
  return out
}
