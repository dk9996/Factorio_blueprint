import { create } from 'zustand'

interface PickerTarget {
  rowIndex: number
  slotIndex: number
}

interface UiStore {
  listCollapsed: boolean
  sidebarCollapsed: boolean
  sidebarWidth: number
  selectedEntityIds: Set<number>
  lastSelectionSource: 'click' | 'other'
  deleteHoldProgress: number | null
  selectionToolActive: boolean
  pickerTarget: PickerTarget | null
  toggleList: () => void
  toggleSidebar: () => void
  setSidebarWidth: (width: number) => void
  selectOnly: (id: number) => void
  toggleSelection: (id: number) => void
  setSelection: (ids: number[]) => void
  addToSelection: (ids: number[]) => void
  clearSelection: () => void
  setDeleteHoldProgress: (progress: number | null) => void
  toggleSelectionTool: () => void
  openPicker: (rowIndex: number, slotIndex: number) => void
  closePicker: () => void
}

export const useUiStore = create<UiStore>((set) => ({
  sidebarWidth: 220,
  setSidebarWidth: (width) => set({ sidebarWidth: Math.min(480, Math.max(160, width)) }),
  listCollapsed: false,
  sidebarCollapsed: false,
  selectedEntityIds: new Set(),
  lastSelectionSource: 'other',
  deleteHoldProgress: null,
  selectionToolActive: false,
  pickerTarget: null,
  toggleList: () => set((s) => ({ listCollapsed: !s.listCollapsed })),
  toggleSidebar: () => set((s) => ({ sidebarCollapsed: !s.sidebarCollapsed })),
  selectOnly: (id) => set({ selectedEntityIds: new Set([id]), lastSelectionSource: 'click' }),
  toggleSelection: (id) =>
    set((s) => {
      const next = new Set(s.selectedEntityIds)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return { selectedEntityIds: next, lastSelectionSource: 'other' }
    }),
  setSelection: (ids) => set({ selectedEntityIds: new Set(ids), lastSelectionSource: 'other' }),
  addToSelection: (ids) =>
    set((s) => {
      const next = new Set(s.selectedEntityIds)
      ids.forEach((id) => next.add(id))
      return { selectedEntityIds: next, lastSelectionSource: 'other' }
    }),
  clearSelection: () => set({ selectedEntityIds: new Set(), lastSelectionSource: 'other' }),
  setDeleteHoldProgress: (progress) => set({ deleteHoldProgress: progress }),
  toggleSelectionTool: () =>
    set((s) => {
      const next = !s.selectionToolActive
      return {
        selectionToolActive: next,
        // выключили инструмент — снимаем текущее выделение, иначе останется
        // "подвисшее" выделение, с которым больше нельзя ничего сделать
        selectedEntityIds: next ? s.selectedEntityIds : new Set(),
        lastSelectionSource: next ? s.lastSelectionSource : 'other',
      }
    }),
  openPicker: (rowIndex, slotIndex) => set({ pickerTarget: { rowIndex, slotIndex } }),
  closePicker: () => set({ pickerTarget: null }),
}))