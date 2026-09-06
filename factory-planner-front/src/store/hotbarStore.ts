import { create } from 'zustand'

export type HotbarItem =
  | {
      kind: 'entity'
      typeId: string
      type?: string                 // ← добавить
      icon: string
      label: string
      width: number
      height: number
      craftingCategories?: string[] // ← добавить
      moduleSlots?: number          // ← добавить
    }
  | { kind: 'blueprint'; factoryId: string }
const ROWS = 10
const SLOTS_PER_ROW = 10

function emptyRow(): (HotbarItem | null)[] {
  return Array(SLOTS_PER_ROW).fill(null)
}

interface HotbarStore {
  rows: (HotbarItem | null)[][]
  pinnedRows: [number, number]
  assignSlot: (rowIndex: number, slotIndex: number, item: HotbarItem | null) => void
  setPinnedRow: (position: 0 | 1, rowIndex: number) => void
}

export const useHotbarStore = create<HotbarStore>((set) => ({
  rows: Array.from({ length: ROWS }, () => emptyRow()),
  pinnedRows: [0, 1],
  assignSlot: (rowIndex, slotIndex, item) =>
    set((state) => {
      const rows = state.rows.map((r) => [...r])
      rows[rowIndex][slotIndex] = item
      return { rows }
    }),
  setPinnedRow: (position, rowIndex) =>
    set((state) => {
      const pinnedRows = [...state.pinnedRows] as [number, number]
      pinnedRows[position] = rowIndex
      return { pinnedRows }
    }),
}))