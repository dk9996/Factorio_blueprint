import { useCanvasStore, type PlacedEntity } from '../store/canvasStore'
import { useEntityCatalogStore } from '../store/entityCatalogStore'
import { useTabsStore } from '../store/tabsStore'
import { HIDDEN_CATEGORY_IDS } from '../hiddenCategories'

const GRID = 32
const GAP = GRID // отступ между тестовыми сущностями — 1 тайл

/**
 * Открывает новый пустой чертёж и раскладывает в один ряд все сущности
 * из переданного списка typeId — каждая следующая ставится сразу после
 * предыдущей (по её реальной ширине из каталога) плюс небольшой отступ,
 * чтобы они не наезжали друг на друга. Сущности, которых нет в текущем
 * каталоге (мод выключен, опечатка в typeId), молча пропускаются.
 */
export function placeTestEntitiesRow(typeIds: string[]): void {
  const catalog = useEntityCatalogStore.getState().entities
  if (catalog.length === 0) return // каталог ещё не загружен — раскладывать нечего

  useTabsStore.getState().openBlankTab()

  const toPlace: Omit<PlacedEntity, 'id'>[] = []
  let cursorX = 0

  for (const typeId of typeIds) {
    const entry = catalog.find((e) => e.typeId === typeId)
    if (!entry) continue

    toPlace.push({
      typeId: entry.typeId,
      type: entry.type,
      icon: entry.icon,
      label: entry.label,
      x: cursorX,
      y: 0,
      width: entry.width,
      height: entry.height,
      craftingCategories: entry.craftingCategories ?? undefined,
      moduleSlots: entry.moduleSlots,
      recipe: null,
    })

    cursorX += entry.width + GAP
  }

  if (toPlace.length > 0) {
    useCanvasStore.getState().addEntities(toPlace)
  }
}

const ROW_MAX_WIDTH = 9600 // ширина "полки" в мировых пикселях, после которой перенос на новую строку

/**
 * Открывает новый пустой чертёж и раскладывает сеткой все сущности
 * ТЕКУЩЕГО КАТАЛОГА РАЗМЕЩЕНИЯ — то есть ровно то же множество, что видно
 * в палитре ("Сущности" справа): те же HIDDEN_CATEGORY_IDS исключены
 * (враги/декорации/эффекты и т.п. — по каталогу они есть, но их нельзя
 * поставить через палитру, значит и в тестовой раскладке им не место).
 * Раскладка — "полками", а не фиксированной сеткой с одинаковым шагом
 * клетки: реальные хитбоксы сущностей отличаются в разы (от 32px до
 * 768px), и при фиксированном шаге крупные сущности наезжали на соседей.
 * Здесь каждая следующая сущность ставится встык по X (плюс отступ) на
 * текущей "полке", высота полки — по САМОЙ высокой сущности на ней; когда
 * полка заполняется до ROW_MAX_WIDTH — переход на новую, Y увеличивается
 * на реальную высоту предыдущей полки. Соседние хитбоксы гарантированно
 * не пересекаются и не оказываются друг в друге, независимо от размеров.
 */
export function placeAllCatalogEntitiesGrid(): void {
  const catalog = useEntityCatalogStore.getState().entities.filter(
    (e) => !HIDDEN_CATEGORY_IDS.has(e.categoryId),
  )
  if (catalog.length === 0) return

  useTabsStore.getState().openBlankTab()

  const toPlace: Omit<PlacedEntity, 'id'>[] = []
  let cursorX = 0
  let cursorY = 0
  let rowHeight = 0

  for (const entry of catalog) {
    if (cursorX > 0 && cursorX + entry.width > ROW_MAX_WIDTH) {
      cursorY += rowHeight + GAP
      cursorX = 0
      rowHeight = 0
    }

    toPlace.push({
      typeId: entry.typeId,
      type: entry.type,
      icon: entry.icon,
      label: entry.label,
      x: cursorX,
      y: cursorY,
      width: entry.width,
      height: entry.height,
      craftingCategories: entry.craftingCategories ?? undefined,
      moduleSlots: entry.moduleSlots,
      recipe: null,
    })

    cursorX += entry.width + GAP
    rowHeight = Math.max(rowHeight, entry.height)
  }

  useCanvasStore.getState().addEntities(toPlace)
}

// Группы (в тайлах, локальные координаты) для проверки автоматического
// выбора спрайта трубы по соседям — покрывает все 16 комбинаций
// подключения. Каждая группа умещается в блок 3×3 и раскладывается по
// сетке с шагом 4 тайла (см. ниже) — гарантированный зазор ≥1 пустого
// тайла между группами, чтобы они не склеивались друг с другом и не
// искажали проверяемую комбинацию соседей.
const PIPE_TEST_GROUPS: [number, number][][] = [
  [[0, 0]], // изолированная — straight_vertical_single
  [[0, 0], [1, 0], [2, 0]], // горизонтальный ряд — концы ending_left/right, центр straight_horizontal
  [[0, 0], [0, 1], [0, 2]], // вертикальный ряд — концы ending_up/down, центр straight_vertical
  [[1, 0], [1, 1], [2, 1]], // угол N+E (corner_up_right)
  [[1, 0], [1, 1], [0, 1]], // угол N+W (corner_up_left)
  [[1, 0], [1, 1], [2, 0]], // угол S+E (corner_down_right)
  [[1, 0], [1, 1], [0, 0]], // угол S+W (corner_down_left)
  [[1, 0], [1, 1], [1, 2], [2, 1], [0, 1]], // крест (cross)
  [[1, 0], [1, 1], [2, 1], [0, 1]], // T без юга (t_up)
  [[1, 1], [1, 2], [2, 1], [0, 1]], // T без севера (t_down)
  [[1, 0], [1, 1], [1, 2], [0, 1]], // T без востока (t_left)
  [[1, 0], [1, 1], [1, 2], [2, 1]], // T без запада (t_right)
]

const PIPE_TEST_TILES: [number, number][] = PIPE_TEST_GROUPS.flatMap((group, i) => {
  const col = i % 4
  const row = Math.floor(i / 4)
  const ox = col * 4
  const oy = row * 4
  return group.map(([x, y]) => [ox + x, oy + y] as [number, number])
})

/**
 * Открывает новый пустой чертёж и раскладывает трубы во всех 16
 * комбинациях подключения соседей — для визуальной проверки
 * computePipeVariantKey/PIPE_VARIANT_KEY_BY_SIDES после пересборки
 * спрайтов труб (см. entity_sprite_service.PIPE_VARIANT_KEY_BY_SIDES).
 */
export function placePipeConnectionTestLayout(): void {
  const catalog = useEntityCatalogStore.getState().entities
  const entry = catalog.find((e) => e.typeId === 'pipe')
  if (!entry) return

  useTabsStore.getState().openBlankTab()

  const toPlace: Omit<PlacedEntity, 'id'>[] = PIPE_TEST_TILES.map(([tx, ty]) => ({
    typeId: entry.typeId,
    type: entry.type,
    icon: entry.icon,
    label: entry.label,
    x: tx * GRID,
    y: ty * GRID,
    width: entry.width,
    height: entry.height,
    craftingCategories: entry.craftingCategories ?? undefined,
    moduleSlots: entry.moduleSlots,
    recipe: null,
  }))

  useCanvasStore.getState().addEntities(toPlace)
}

// typeId сборочной машины + рецепт для проверки — 'с жидкостью' (есть
// fluid ingredient/result) и 'без' (обычный рецепт), для сравнения
// показывается ли патрубок fluidPipeOverlays только там, где нужно.
const FLUID_OVERLAY_TEST_CASES: [typeId: string, recipe: string | null][] = [
  ['assembling-machine-2', 'processing-unit'], // sulfuric-acid ingredient — патрубок ДОЛЖЕН быть виден
  ['assembling-machine-2', 'electronic-circuit'], // без жидкости — патрубка быть НЕ должно
  ['assembling-machine-2', null], // рецепт не выбран — патрубка быть НЕ должно
  ['assembling-machine-3', 'processing-unit'],
  ['kr-atmospheric-condenser', 'kr-nitrogen'], // крупная (5×5) модовая машина с 8 pipe_connections на одном fluid_box — проверка обхода ВСЕХ connections, не только первого
  ['assembling-machine-2', 'el_lithium_ore_recipe'], // и fluid ingredient, и fluid result — виден ОБА патрубка (вход сверху, выход снизу — именно выход раньше съезжал в центр)
]

/**
 * Открывает новый пустой чертёж и раскладывает сборочные машины с разными
 * рецептами в ряд — для визуальной проверки fluidPipeOverlays (патрубок
 * жидкостного fluid_box виден только когда у выбранного рецепта есть
 * жидкостный ingredient/result, см. EntityNode.tsx).
 */
export function placeFluidOverlayTestLayout(): void {
  const catalog = useEntityCatalogStore.getState().entities

  useTabsStore.getState().openBlankTab()

  const toPlace: Omit<PlacedEntity, 'id'>[] = []
  let cursorX = 0
  for (const [typeId, recipe] of FLUID_OVERLAY_TEST_CASES) {
    const entry = catalog.find((e) => e.typeId === typeId)
    if (!entry) continue
    toPlace.push({
      typeId: entry.typeId,
      type: entry.type,
      icon: entry.icon,
      label: entry.label,
      x: cursorX,
      y: 0,
      width: entry.width,
      height: entry.height,
      craftingCategories: entry.craftingCategories ?? undefined,
      moduleSlots: entry.moduleSlots,
      recipe,
    })
    cursorX += entry.width + GAP
  }

  useCanvasStore.getState().addEntities(toPlace)
}