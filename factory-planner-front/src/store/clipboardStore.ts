import { create } from 'zustand'
import type { PlacedEntity } from './canvasStore'

interface ClipboardStore {
  buffer: Omit<PlacedEntity, 'id'>[]
  copy: (entities: PlacedEntity[]) => void
}

export const useClipboardStore = create<ClipboardStore>((set) => ({
  buffer: [],
  copy: (entities) =>
    set({
      buffer: entities.map(({ id, ...rest }) => rest),
    }),
}))