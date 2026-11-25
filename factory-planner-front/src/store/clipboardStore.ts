import { create } from 'zustand'
import type { PlacedEntity, PlacingWire } from './canvasStore'
import type { Wire } from '../lib/circuit/types'

interface ClipboardStore {
  buffer: Omit<PlacedEntity, 'id'>[]
  // Провода МЕЖДУ скопированными сущностями (концы — индексы в buffer);
  // провода наружу не копируются.
  wires: PlacingWire[]
  copy: (entities: PlacedEntity[], wires?: Wire[]) => void
}

export const useClipboardStore = create<ClipboardStore>((set) => ({
  buffer: [],
  wires: [],
  copy: (entities, wires = []) => {
    const indexById = new Map(entities.map((e, i) => [e.id, i]))
    const internal: PlacingWire[] = wires.flatMap((w) => {
      const ia = indexById.get(w.a.entityId)
      const ib = indexById.get(w.b.entityId)
      if (ia === undefined || ib === undefined) return []
      return [{ color: w.color, a: { index: ia, connector: w.a.connector }, b: { index: ib, connector: w.b.connector } }]
    })
    set({
      buffer: entities.map(({ id: _id, ...rest }) => rest),
      wires: internal,
    })
  },
}))
