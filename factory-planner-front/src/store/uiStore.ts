import { create } from 'zustand'

interface PickerTarget {
  rowIndex: number
  slotIndex: number
}

// Единственная пока настройка, которую храним в localStorage — остальной
// uiStore не персистится совсем (Set в selectedEntityIds и т.п. не нужно
// переживать перезагрузку страницы), поэтому вместо общей persist-мидлвари
// на весь store — точечное чтение/запись одного ключа.
const REAL_SPRITES_STORAGE_KEY = 'fp.useRealSprites'
const IO_HINTS_STORAGE_KEY = 'fp.showIoHints'
const DIRECTION_ARROW_STORAGE_KEY = 'fp.showDirectionArrow'

function loadUseRealSprites(): boolean {
  try {
    return localStorage.getItem(REAL_SPRITES_STORAGE_KEY) === '1'
  } catch {
    return false
  }
}

function loadShowIoHints(): boolean {
  try {
    // По умолчанию ВКЛ (в отличие от useRealSprites) — отсутствие ключа
    // в localStorage трактуем как "ещё не трогали", а не как "выключено".
    const stored = localStorage.getItem(IO_HINTS_STORAGE_KEY)
    return stored === null ? true : stored === '1'
  } catch {
    return true
  }
}

function loadShowDirectionArrow(): boolean {
  try {
    const stored = localStorage.getItem(DIRECTION_ARROW_STORAGE_KEY)
    return stored === null ? true : stored === '1'
  } catch {
    return true
  }
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
  // Переключатель рендера сущностей на канвасе: выкл (по умолчанию) —
  // плейсхолдер-квадрат с маленькой иконкой каталога, вкл — настоящие
  // игровые спрайты (entitySprite/pipeVariant/fluidOverlays/анимация),
  // см. EntityNode.tsx и PlacementGhost.tsx.
  useRealSprites: boolean
  // Подсказки входов/выходов (стрелки) поверх плейсхолдера-квадрата —
  // по умолчанию ВКЛ, видны только когда useRealSprites=false (см.
  // EntityNode.tsx/IoHints.tsx).
  showIoHints: boolean
  // Оранжевая стрелка-треугольник с поворотом (R) на плейсхолдере-квадрате —
  // независимая настройка от showIoHints (это геометрический индикатор
  // направления сущности, не подсказка портов входа/выхода), по умолчанию
  // ВКЛ, видна только когда useRealSprites=false (см. EntityNode.tsx/
  // PlacementGhost.tsx, класс .entity-direction-arrow).
  showDirectionArrow: boolean
  // Идёт ли сейчас живое перетаскивание сущности/группы (moveEntitiesLive
  // на каждый mousemove) — BlueprintCanvas использует это, чтобы НЕ
  // пересчитывать computeNetworks (lib/networks.ts) на каждый пиксель
  // движения, а переиспользовать предыдущий результат до commitMove/commitEntitiesMove.
  isDraggingAny: boolean
  setDraggingAny: (value: boolean) => void
  // Группа (сеть конвейеров/труб, см. lib/networks.ts), над которой сейчас
  // курсор — НЕ выделение (selectedEntityIds не трогается), чисто
  // визуальная подсветка всей группы целиком + панель статистики
  // (GroupStatsPanel) по наведению, без клика. id группы (строка из
  // networksStore), не entity.id.
  hoveredGroupId: string | null
  setHoveredGroupId: (id: string | null) => void
  // Сущность (любая, не только группируемая), над которой сейчас курсор —
  // используется подсказкой дальности подземных конвейеров/труб (см.
  // src/lib/underground.ts, UndergroundRange.tsx), чтобы показать зону
  // связи при наведении на уже стоящий подземный конвейер/трубу.
  // Не связано с hoveredGroupId/выделением.
  hoveredEntityId: number | null
  setHoveredEntityId: (id: number | null) => void
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
  toggleRealSprites: () => void
  toggleIoHints: () => void
  toggleDirectionArrow: () => void
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
  useRealSprites: loadUseRealSprites(),
  showIoHints: loadShowIoHints(),
  showDirectionArrow: loadShowDirectionArrow(),
  isDraggingAny: false,
  setDraggingAny: (value) => set({ isDraggingAny: value }),
  hoveredGroupId: null,
  setHoveredGroupId: (id) => set({ hoveredGroupId: id }),
  hoveredEntityId: null,
  setHoveredEntityId: (id) => set({ hoveredEntityId: id }),
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
  toggleRealSprites: () =>
    set((s) => {
      const next = !s.useRealSprites
      try {
        localStorage.setItem(REAL_SPRITES_STORAGE_KEY, next ? '1' : '0')
      } catch {
        // localStorage недоступен (приватный режим и т.п.) — настройка
        // просто не переживёт перезагрузку, не критично
      }
      return { useRealSprites: next }
    }),
  toggleIoHints: () =>
    set((s) => {
      const next = !s.showIoHints
      try {
        localStorage.setItem(IO_HINTS_STORAGE_KEY, next ? '1' : '0')
      } catch {
        // localStorage недоступен — не критично, см. toggleRealSprites
      }
      return { showIoHints: next }
    }),
  toggleDirectionArrow: () =>
    set((s) => {
      const next = !s.showDirectionArrow
      try {
        localStorage.setItem(DIRECTION_ARROW_STORAGE_KEY, next ? '1' : '0')
      } catch {
        // localStorage недоступен — не критично, см. toggleRealSprites
      }
      return { showDirectionArrow: next }
    }),
}))