import { create } from 'zustand'

interface PickerTarget {
  rowIndex: number
  slotIndex: number
}

interface UiStore {
  listCollapsed: boolean
  sidebarCollapsed: boolean
  selectedEntityIds: Set<number>
  pickerTarget: PickerTarget | null
  toggleList: () => void
  toggleSidebar: () => void
  selectOnly: (id: number) => void
  toggleSelection: (id: number) => void
  setSelection: (ids: number[]) => void
  addToSelection: (ids: number[]) => void
  clearSelection: () => void
  openPicker: (rowIndex: number, slotIndex: number) => void
  closePicker: () => void
}

export const useUiStore = create<UiStore>((set) => ({
  listCollapsed: false,
  sidebarCollapsed: false,
  selectedEntityIds: new Set(),
  pickerTarget: null,
  toggleList: () => set((s) => ({ listCollapsed: !s.listCollapsed })),
  toggleSidebar: () => set((s) => ({ sidebarCollapsed: !s.sidebarCollapsed })),
  selectOnly: (id) => set({ selectedEntityIds: new Set([id]) }),
  toggleSelection: (id) =>
    set((s) => {
      const next = new Set(s.selectedEntityIds)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return { selectedEntityIds: next }
    }),
  setSelection: (ids) => set({ selectedEntityIds: new Set(ids) }),
  addToSelection: (ids) =>
    set((s) => {
      const next = new Set(s.selectedEntityIds)
      ids.forEach((id) => next.add(id))
      return { selectedEntityIds: next }
    }),
  clearSelection: () => set({ selectedEntityIds: new Set() }),
  openPicker: (rowIndex, slotIndex) => set({ pickerTarget: { rowIndex, slotIndex } }),
  closePicker: () => set({ pickerTarget: null }),
}))