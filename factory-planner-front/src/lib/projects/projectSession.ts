import { useTabsStore, blankTab, type Tab } from '../../store/tabsStore'
import { useUiStore } from '../../store/uiStore'
import { useProjectsStore } from '../../store/projectsStore'
import { useEntityCatalogStore } from '../../store/entityCatalogStore'
import { useRecipeCatalogStore } from '../../store/recipeCatalogStore'
import type { PlacedEntity } from '../../store/canvasStore'
import { projectsRepository, type ProjectData, type ProjectDetail, type ProjectTabData } from '../api/projects'
import type { BlueprintTabMeta, ImportedTab } from '../blueprint/convert'
import { generateThumbnail } from './thumbnail'
import { hasTiles } from '../tiles'
import { migrateLegacyConfig } from '../entitySettings/legacy'

// Мост между Project (бэкенд, опрокинутый JSON) и tabsStore (живой стор
// редактора). Бэкенд ничего не знает о форме Tab — здесь единственное
// место, где сырые данные проекта превращаются в настоящие Tab и обратно.

function tabDataToTab(raw: ProjectTabData): Tab {
  return {
    id: raw.id,
    title: raw.title,
    factoryId: raw.factoryId ?? null,
    entities: Array.isArray(raw.entities) ? (raw.entities as PlacedEntity[]).map(migrateLegacyConfig) : [],
    nextId: raw.nextId ?? 100,
    tiles: raw.tiles && typeof raw.tiles === 'object' ? raw.tiles : {},
    wires: Array.isArray(raw.wires) ? (raw.wires as Tab['wires']) : [],
    past: Array.isArray(raw.past) ? (raw.past as Tab['past']) : [],
    future: Array.isArray(raw.future) ? (raw.future as Tab['future']) : [],
    offsetX: raw.offsetX ?? 0,
    offsetY: raw.offsetY ?? 0,
    scale: raw.scale ?? 1,
    savedEntitiesJson: '',
    blueprintMeta: raw.blueprintMeta as BlueprintTabMeta | undefined,
  }
}

// История undo/redo сохраняется вместе с проектом, но снимки со слоем
// плиток раздули бы JSON (каждый снимок — копия всей карты плиток, а тело
// запроса ограничено 8 МБ). Поэтому если в истории есть непустые плитки —
// историю в сохранение не кладём (после перезагрузки undo начнётся с нуля;
// сами плитки сохраняются всегда).
function historyCarriesTiles(tab: Tab): boolean {
  return [...tab.past, ...tab.future].some((s) => hasTiles(s.tiles))
}

function tabToTabData(tab: Tab): ProjectTabData {
  const dropHistory = hasTiles(tab.tiles) || historyCarriesTiles(tab)
  return {
    id: tab.id,
    title: tab.title,
    factoryId: tab.factoryId,
    entities: tab.entities,
    nextId: tab.nextId,
    ...(hasTiles(tab.tiles) ? { tiles: tab.tiles } : {}),
    ...(tab.wires && tab.wires.length > 0 ? { wires: tab.wires } : {}),
    past: dropHistory ? [] : tab.past,
    future: dropHistory ? [] : tab.future,
    offsetX: tab.offsetX,
    offsetY: tab.offsetY,
    scale: tab.scale,
    blueprintMeta: tab.blueprintMeta,
  }
}

export function loadProjectIntoTabs(detail: ProjectDetail): void {
  const rawTabs = Array.isArray(detail.data?.tabs) ? detail.data.tabs : []
  const tabs = rawTabs.length > 0 ? rawTabs.map(tabDataToTab) : [blankTab()]
  const activeTabId = detail.data?.activeTabId ?? tabs[0].id
  useTabsStore.getState().loadTabs(tabs, activeTabId)
}

export function collectProjectData(): ProjectData {
  const { tabs, activeTabId } = useTabsStore.getState().getTabsSnapshot()
  return { tabs: tabs.map(tabToTabData), activeTabId }
}

export function serializeProjectData(data: ProjectData): string {
  return JSON.stringify(data)
}

export function totalEntityCount(data: ProjectData): number {
  return data.tabs.reduce((sum, t) => sum + (Array.isArray(t.entities) ? t.entities.length : 0), 0)
}

export function allEntitiesForThumbnail(data: ProjectData): PlacedEntity[] {
  const active = data.tabs.find((t) => t.id === data.activeTabId) ?? data.tabs[0]
  return (active?.entities as PlacedEntity[] | undefined) ?? []
}

// --- Навигация меню <-> редактор + сохранение (без роутера, состоянием
// в uiStore — см. AppLayout.tsx/TopBar.tsx) ---

export function nextDefaultProjectName(existingNames: string[], base = 'Новый чертёж'): string {
  if (!existingNames.includes(base)) return base
  let i = 2
  while (existingNames.includes(`${base} ${i}`)) i++
  return `${base} ${i}`
}

// Каталог сущностей/рецептов зависит от профиля (ваниль/DLC) проекта — см.
// app/content/profile.py/ProjectModel.content_profile. Рефетчим ТОЛЬКО
// если профиль реально сменился с последнего раза (store.activeProfile),
// чтобы не дёргать сеть при каждом входе в редактор одного и того же
// проекта подряд.
export async function ensureCatalogForProfile(profile: string): Promise<void> {
  const needsEntities = useEntityCatalogStore.getState().activeProfile !== profile
  const needsRecipes = useRecipeCatalogStore.getState().activeProfile !== profile
  await Promise.all([
    needsEntities ? useEntityCatalogStore.getState().fetchEntities(profile) : Promise.resolve(),
    needsRecipes ? useRecipeCatalogStore.getState().fetchRecipes(profile) : Promise.resolve(),
  ])
}

export async function openProjectInEditor(id: string): Promise<void> {
  const detail = await projectsRepository.get(id)
  await ensureCatalogForProfile(detail.content_profile)
  loadProjectIntoTabs(detail)
  useUiStore.setState({ view: 'editor', activeProjectId: id })
}

export async function createAndOpenProject(profileId = 'base'): Promise<void> {
  const existingNames = useProjectsStore.getState().projects.map((p) => p.name)
  const name = nextDefaultProjectName(existingNames)
  const tab = blankTab()
  const data: ProjectData = { tabs: [tabToTabData(tab)], activeTabId: tab.id }
  const created = await useProjectsStore.getState().createProject({ name, data, content_profile: profileId })
  await ensureCatalogForProfile(profileId)
  useTabsStore.getState().loadTabs([tab], tab.id)
  useUiStore.setState({ view: 'editor', activeProjectId: created.id })
}

// Полное сохранение текущего проекта (снимок вкладок + превью) — общий
// путь и для автосохранения (useProjectAutosave), и для явного выхода в
// меню (returnToMenu), чтобы не было двух разных реализаций "сохранить".
export async function saveActiveProject(id: string): Promise<void> {
  const data = collectProjectData()
  const thumbnail = await generateThumbnail(allEntitiesForThumbnail(data))
  const updated = await projectsRepository.update(id, { data, thumbnail })
  useTabsStore.getState().markAllTabsSaved()
  useProjectsStore.getState().patchListItem(id, {
    updated_at: updated.updated_at,
    entity_count: updated.entity_count,
    thumbnail: updated.thumbnail,
  })
}

export async function returnToMenu(): Promise<void> {
  const { activeProjectId } = useUiStore.getState()
  if (activeProjectId) {
    try {
      await saveActiveProject(activeProjectId)
    } catch {
      // Лучшее старание — сеть недоступна и т.п. Не блокируем выход в
      // меню; при закрытии вкладки браузера beforeunload всё равно
      // предупредит, если остались несохранённые правки.
    }
  }
  useUiStore.setState({ view: 'menu', activeProjectId: null })
}

export function hasUnsavedChanges(): boolean {
  const { tabs, isTabDirty } = useTabsStore.getState()
  return tabs.some((t) => isTabDirty(t.id))
}

// Импорт с главного экрана (MenuImportDialog) — КАЖДЫЙ элемент книги
// становится ОТДЕЛЬНЫМ проектом (в отличие от импорта внутри редактора,
// ImportExportPanel, где книга превращается в несколько вкладок одного
// открытого документа — см. отчёт по задаче). Возвращает число созданных
// проектов для сводки в диалоге.
export async function createProjectsFromImport(tabs: ImportedTab[], profileId = 'base'): Promise<number> {
  const usedNames = useProjectsStore.getState().projects.map((p) => p.name)
  for (const imported of tabs) {
    const tabId = `tab-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
    const tabData: ProjectTabData = {
      id: tabId,
      title: imported.title,
      factoryId: null,
      entities: imported.result.entities,
      nextId: imported.result.nextId,
      ...(hasTiles(imported.result.tiles) ? { tiles: imported.result.tiles } : {}),
      ...(imported.result.wires.length > 0 ? { wires: imported.result.wires } : {}),
      past: [],
      future: [],
      offsetX: 0,
      offsetY: 0,
      scale: 1,
      blueprintMeta: imported.result.meta,
    }
    const data: ProjectData = { tabs: [tabData], activeTabId: tabId }
    const name = nextDefaultProjectName(usedNames, imported.title || 'Новый чертёж')
    usedNames.push(name)
    const thumbnail = await generateThumbnail(imported.result.entities)
    await useProjectsStore.getState().createProject({ name, data, thumbnail, content_profile: profileId })
  }
  return tabs.length
}
