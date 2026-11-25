import { create } from 'zustand'
import { projectsRepository, type ProjectListItem, type ProjectCreatePayload } from '../lib/api/projects'

function friendlyError(err: unknown): string {
  // fetch бросает TypeError при полном отсутствии соединения (сервер не
  // поднят, сеть недоступна) — отличаем от обычных API-ошибок (4xx/5xx,
  // которые client.ts уже оборачивает в Error с текстом ответа).
  if (err instanceof TypeError) return 'Нет соединения с сервером'
  return err instanceof Error ? err.message : 'Неизвестная ошибка'
}

interface ProjectsStore {
  projects: ProjectListItem[]
  loading: boolean
  error: string | null

  fetchProjects: () => Promise<void>
  createProject: (data: ProjectCreatePayload) => Promise<ProjectListItem>
  renameProject: (id: string, name: string) => Promise<void>
  duplicateProject: (id: string) => Promise<void>
  deleteProject: (id: string) => Promise<void>
  changeContentProfile: (id: string, contentProfile: string) => Promise<void>
  // Точечное обновление элемента списка без перезапроса всего списка —
  // используется автосохранением (useProjectAutosave), чтобы updated_at/
  // entity_count/thumbnail карточки обновлялись сразу после PUT.
  patchListItem: (id: string, patch: Partial<ProjectListItem>) => void
}

export const useProjectsStore = create<ProjectsStore>((set) => ({
  projects: [],
  loading: false,
  error: null,

  fetchProjects: async () => {
    set({ loading: true, error: null })
    try {
      const projects = await projectsRepository.list()
      set({ projects, loading: false })
    } catch (err) {
      set({ loading: false, error: friendlyError(err) })
    }
  },

  createProject: async (data) => {
    const created = await projectsRepository.create(data)
    const item: ProjectListItem = {
      id: created.id,
      name: created.name,
      updated_at: created.updated_at,
      entity_count: created.entity_count,
      thumbnail: created.thumbnail,
      content_profile: created.content_profile,
    }
    set((state) => ({ projects: [item, ...state.projects] }))
    return item
  },

  renameProject: async (id, name) => {
    const updated = await projectsRepository.rename(id, name)
    set((state) => ({
      projects: state.projects.map((p) => (p.id === id ? { ...p, name: updated.name, updated_at: updated.updated_at } : p)),
    }))
  },

  duplicateProject: async (id) => {
    const created = await projectsRepository.duplicate(id)
    const item: ProjectListItem = {
      id: created.id,
      name: created.name,
      updated_at: created.updated_at,
      entity_count: created.entity_count,
      thumbnail: created.thumbnail,
      content_profile: created.content_profile,
    }
    set((state) => ({ projects: [item, ...state.projects] }))
  },

  deleteProject: async (id) => {
    await projectsRepository.remove(id)
    set((state) => ({ projects: state.projects.filter((p) => p.id !== id) }))
  },

  changeContentProfile: async (id, contentProfile) => {
    const updated = await projectsRepository.changeContentProfile(id, contentProfile)
    set((state) => ({
      projects: state.projects.map((p) =>
        p.id === id ? { ...p, content_profile: updated.content_profile, updated_at: updated.updated_at } : p,
      ),
    }))
  },

  patchListItem: (id, patch) => {
    set((state) => ({
      projects: state.projects.map((p) => (p.id === id ? { ...p, ...patch } : p)),
    }))
  },
}))

// Ошибки отдельных операций (create/rename/...) пробрасываются вызывающему
// коду (диалоги/меню карточки сами показывают текст через friendlyError) —
// store.error используется только для fetchProjects (загрузка всего списка).
export { friendlyError }
