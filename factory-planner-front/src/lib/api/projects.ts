import { api } from './client'

// Форма data непрозрачна для бэкенда (см. app/schemas/project.py) — здесь
// описываем её так, как реально кладём/читаем на фронте (lib/projects/
// projectSession.ts). Поля вкладки специально описаны широко (Partial-по
// духу через optional), т.к. данные могли прийти из миграции на бэкенде
// (project_migration_service.py), где не все поля Tab присутствуют.
export interface ProjectTabData {
  id: string
  title: string
  factoryId?: string | null
  entities: unknown[]
  nextId: number
  // Слой плиток ("x,y" -> имя); у старых проектов поля нет = {}.
  tiles?: Record<string, string>
  // Провода схемной сети (lib/circuit/types.ts); у старых проектов нет = [].
  wires?: unknown[]
  past?: unknown[]
  future?: unknown[]
  offsetX?: number
  offsetY?: number
  scale?: number
  blueprintMeta?: unknown
}

export interface ProjectData {
  tabs: ProjectTabData[]
  activeTabId: string
}

export interface ProjectListItem {
  id: string
  name: string
  updated_at: string
  entity_count: number
  thumbnail: string | null
  // Профиль контента (ваниль/DLC) — см. lib/content/profile.ts,
  // app/content/profile.py. Определяет, какой каталог сущностей/рецептов
  // грузится при входе в редактор (см. lib/projects/projectSession.ts).
  content_profile: string
}

export interface ProjectDetail extends ProjectListItem {
  data: ProjectData
  created_at: string
}

export interface ProjectCreatePayload {
  name: string
  data: ProjectData
  thumbnail?: string | null
  content_profile: string
}

export interface ProjectUpdatePayload {
  name?: string
  data: ProjectData
  thumbnail?: string | null
}

export const projectsRepository = {
  list: () => api.get<ProjectListItem[]>('/projects'),
  get: (id: string) => api.get<ProjectDetail>(`/projects/${id}`),
  create: (data: ProjectCreatePayload) => api.post<ProjectDetail>('/projects', data),
  update: (id: string, data: ProjectUpdatePayload) => api.put<ProjectDetail>(`/projects/${id}`, data),
  rename: (id: string, name: string) => api.patch<ProjectListItem>(`/projects/${id}`, { name }),
  remove: (id: string) => api.delete<{ ok: boolean }>(`/projects/${id}`),
  duplicate: (id: string) => api.post<ProjectDetail>(`/projects/${id}/duplicate`, undefined),
  changeContentProfile: (id: string, contentProfile: string) =>
    api.patch<ProjectDetail>(`/projects/${id}/content-profile`, { content_profile: contentProfile }),
}
