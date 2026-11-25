import type { SignalList, SimSnapshot, SimTopology, WireColor } from '../../engine/circuit/types'
import { parseKey } from '../../engine/circuit/signals'

// Чтение снимка симуляции для UI.
export interface NetValue {
  key: string
  type: string
  name: string
  quality: string
  value: number
}

export function sortedValues(list: SignalList | undefined): NetValue[] {
  return (list ?? [])
    .map(([key, value]) => ({ key, ...parseKey(key), value }))
    .sort((a, b) => b.value - a.value || (a.key < b.key ? -1 : 1))
}

export function netValues(snapshot: SimSnapshot | null, net: number | undefined): NetValue[] {
  return net === undefined ? [] : sortedValues(snapshot?.nets[net])
}

export interface EntityNetRef {
  color: WireColor
  connector: string
  net: number
}

// Сети, к которым подключена сущность (по коннекторам и цветам).
export function entityNetRefs(topology: SimTopology | null, entityId: number): EntityNetRef[] {
  const nets = topology?.entityNets[entityId]
  if (!nets) return []
  const out: EntityNetRef[] = []
  for (const color of ['red', 'green'] as WireColor[]) {
    for (const [connector, net] of Object.entries(nets[color])) out.push({ color, connector, net })
  }
  return out
}
