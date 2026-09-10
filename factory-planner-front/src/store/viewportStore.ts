import { create } from 'zustand'

interface ViewportStore {
  offsetX: number
  offsetY: number
  scale: number
  setOffset: (x: number, y: number) => void
  setScale: (scale: number) => void
  panBy: (dx: number, dy: number) => void
  reset: () => void
}

const MIN_SCALE = 0.25
const MAX_SCALE = 3

export const useViewportStore = create<ViewportStore>((set, get) => ({
  offsetX: 0,
  offsetY: 0,
  scale: 1,
  setOffset: (x, y) => set({ offsetX: x, offsetY: y }),
  setScale: (scale) => set({ scale: Math.min(MAX_SCALE, Math.max(MIN_SCALE, scale)) }),
  panBy: (dx, dy) => {
    const { offsetX, offsetY } = get()
    set({ offsetX: offsetX + dx, offsetY: offsetY + dy })
  },
  reset: () => set({ offsetX: 0, offsetY: 0, scale: 1 }),
}))