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
const TILE_LAYER_STORAGE_KEY = 'fp.showTileLayer'
// Палитра сущностей всегда открыта и всегда максимальной ширины (px)
export const SIDEBAR_WIDTH = 480

const WIRE_LAYER_STORAGE_KEY = 'fp.showWireLayer'

// Оформление: 'game' (в стиле интерфейса игры, по умолчанию) или 'classic'
// (прежнее тёмное). Применяется классом theme-game на <html>; выставляем
// сразу при загрузке модуля, чтобы не мигало.
export type DesignTheme = 'game' | 'classic'
const DESIGN_STORAGE_KEY = 'fp.designTheme'

function loadDesignTheme(): DesignTheme {
  try {
    return localStorage.getItem(DESIGN_STORAGE_KEY) === 'classic' ? 'classic' : 'game'
  } catch {
    return 'game'
  }
}

export function applyDesignTheme(theme: DesignTheme): void {
  if (typeof document !== 'undefined') document.documentElement.classList.toggle('theme-game', theme === 'game')
}

function loadShowWireLayer(): boolean {
  try {
    const stored = localStorage.getItem(WIRE_LAYER_STORAGE_KEY)
    return stored === null ? true : stored === '1'
  } catch {
    return true
  }
}

function loadShowTileLayer(): boolean {
  try {
    const stored = localStorage.getItem(TILE_LAYER_STORAGE_KEY)
    return stored === null ? true : stored === '1'
  } catch {
    return true
  }
}

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

type View = 'menu' | 'editor' | 'login' | 'register'

interface UiStore {
  // Главное меню (список проектов) vs редактор — переключение состоянием,
  // без роутера (см. lib/projects/projectSession.ts, AppLayout.tsx).
  // login/register — то же самое состояние-стейт-машина, но с лёгкой
  // ручной синхронизацией history.pushState только для них двоих (см.
  // setView ниже и App.tsx) — настоящий роутер (react-router) сознательно
  // не добавляется, см. отчёт по задаче "регистрация/вход пользователей".
  view: View
  activeProjectId: string | null
  // Куда вернуться после успешного login/register — если пользователя
  // перебросило на /login из защищённого view (AppLayout.tsx), сюда
  // попадает исходный view ('menu' или 'editor').
  returnTo: 'menu' | 'editor'
  setView: (view: View, opts?: { returnTo?: 'menu' | 'editor' }) => void
  setActiveProjectId: (id: string | null) => void
  listCollapsed: boolean
  sidebarCollapsed: boolean
  sidebarWidth: number
  // Качество, с которым берутся сущности из палитры/выбора в хотбар
  // (только в профилях с DLC quality; иначе игнорируется).
  selectedQuality: string
  setSelectedQuality: (quality: string) => void
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
  // Слой плиток под сущностями (lib/tiles.ts, TileLayer.tsx) — показать/скрыть.
  // Данные плиток не меняются, скрывается только отрисовка.
  showTileLayer: boolean
  toggleTileLayer: () => void
  // Схемная сеть (провода): активный инструмент, закреплённый первый конец
  // незавершённого провода, слой проводов (показать/скрыть), окно настройки
  // комбинатора (id сущности).
  wireTool: 'red' | 'green' | null
  setWireTool: (tool: 'red' | 'green' | null) => void
  wireStart: { entityId: number; connector: string } | null
  setWireStart: (start: { entityId: number; connector: string } | null) => void
  designTheme: DesignTheme
  toggleDesignTheme: () => void
  showWireLayer: boolean
  toggleWireLayer: () => void
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
  // окно настроек сущностей (<EntitySettingsPanel/>): id редактируемых
  // сущностей одного типа или null
  settingsEntityIds: number[] | null
  settingsClearOnClose: boolean
  // clearOnClose — окно открыто кликом по сущности: при закрытии снять выделение
  // (как у окон комбинаторов), чтобы следующий клик открыл его снова
  openEntitySettings: (ids: number[], clearOnClose?: boolean) => void
  closeEntitySettings: () => void
  setHoveredEntityId: (id: number | null) => void
  toggleList: () => void
  toggleSidebar: () => void
  setSidebarWidth: (width: number) => void
  // Выделенные плитки ("x,y"): Ctrl+рамка в режиме выделения выделяет
  // ТОЛЬКО плитки; любое выделение сущностей их сбрасывает
  selectedTileKeys: Set<string>
  setSelectedTiles: (keys: string[], add?: boolean) => void
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
  view: 'menu',
  activeProjectId: null,
  returnTo: 'menu',
  setView: (view, opts) =>
    set((s) => {
      if (view === 'login' || view === 'register') {
        history.pushState({ view }, '', `/${view}`)
      } else if (s.view === 'login' || s.view === 'register') {
        history.pushState({ view: 'app' }, '', '/')
      }
      return { view, ...(opts?.returnTo ? { returnTo: opts.returnTo } : {}) }
    }),
  setActiveProjectId: (id) => set({ activeProjectId: id }),
  sidebarWidth: SIDEBAR_WIDTH,
  selectedQuality: 'normal',
  setSelectedQuality: (quality) => set({ selectedQuality: quality }),
  setSidebarWidth: (width) => set({ sidebarWidth: Math.min(SIDEBAR_WIDTH, Math.max(160, width)) }),
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
  showTileLayer: loadShowTileLayer(),
  wireTool: null,
  setWireTool: (tool) => set({ wireTool: tool, wireStart: null }),
  wireStart: null,
  setWireStart: (start) => set({ wireStart: start }),
  designTheme: loadDesignTheme(),
  toggleDesignTheme: () =>
    set((s) => {
      const next: DesignTheme = s.designTheme === 'game' ? 'classic' : 'game'
      applyDesignTheme(next)
      try {
        localStorage.setItem(DESIGN_STORAGE_KEY, next)
      } catch {
        // localStorage недоступен — не критично
      }
      return { designTheme: next }
    }),
  showWireLayer: loadShowWireLayer(),
  toggleWireLayer: () =>
    set((s) => {
      const next = !s.showWireLayer
      try {
        localStorage.setItem(WIRE_LAYER_STORAGE_KEY, next ? '1' : '0')
      } catch {
        // localStorage недоступен — не критично
      }
      return { showWireLayer: next }
    }),
  toggleTileLayer: () =>
    set((s) => {
      const next = !s.showTileLayer
      try {
        localStorage.setItem(TILE_LAYER_STORAGE_KEY, next ? '1' : '0')
      } catch {
        // localStorage недоступен — не критично
      }
      return { showTileLayer: next }
    }),
  isDraggingAny: false,
  setDraggingAny: (value) => set({ isDraggingAny: value }),
  hoveredGroupId: null,
  setHoveredGroupId: (id) => set({ hoveredGroupId: id }),
  hoveredEntityId: null,
  settingsEntityIds: null,
  settingsClearOnClose: false,
  openEntitySettings: (ids, clearOnClose = false) =>
    set({ settingsEntityIds: ids.length > 0 ? ids : null, settingsClearOnClose: clearOnClose }),
  closeEntitySettings: () =>
    set((s) => ({
      settingsEntityIds: null,
      settingsClearOnClose: false,
      ...(s.settingsClearOnClose ? { selectedEntityIds: new Set<number>(), lastSelectionSource: 'other' as const } : {}),
    })),
  setHoveredEntityId: (id) => set({ hoveredEntityId: id }),
  toggleList: () => set((s) => ({ listCollapsed: !s.listCollapsed })),
  toggleSidebar: () => set((s) => ({ sidebarCollapsed: !s.sidebarCollapsed })),
  selectedTileKeys: new Set<string>(),
  setSelectedTiles: (keys, add = false) =>
    set((s) => ({
      // плитки и сущности выделяются раздельно: выделение плиток снимает выделение сущностей
      selectedEntityIds: new Set<number>(),
      lastSelectionSource: 'other' as const,
      selectedTileKeys: new Set(add ? [...s.selectedTileKeys, ...keys] : keys),
    })),
  selectOnly: (id) => set({ selectedEntityIds: new Set([id]), lastSelectionSource: 'click', selectedTileKeys: new Set<string>() }),
  toggleSelection: (id) =>
    set((s) => {
      const next = new Set(s.selectedEntityIds)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return { selectedEntityIds: next, lastSelectionSource: 'other', selectedTileKeys: new Set<string>() }
    }),
  setSelection: (ids) => set({ selectedEntityIds: new Set(ids), lastSelectionSource: 'other', selectedTileKeys: new Set<string>() }),
  addToSelection: (ids) =>
    set((s) => {
      const next = new Set(s.selectedEntityIds)
      ids.forEach((id) => next.add(id))
      return { selectedEntityIds: next, lastSelectionSource: 'other', selectedTileKeys: new Set<string>() }
    }),
  clearSelection: () => set({ selectedEntityIds: new Set(), lastSelectionSource: 'other', selectedTileKeys: new Set<string>() }),
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

applyDesignTheme(useUiStore.getState().designTheme)
