import { api } from './client'
import type { Factory } from '../../store/factoryStore'

export interface FactoryCreatePayload {
  name: string
  folder: string
  width: number
  height: number
  icon: string
  previewIcons: string[]
  entities: Factory['entities']
}

export interface FactoryUpdatePayload {
  name?: string
  folder?: string
  status?: 'ok' | 'warn' | 'bad'
  entities?: Factory['entities']
}

export const factoriesApi = {
  list: () => api.get<Factory[]>('/factories'),
  get: (id: string) => api.get<Factory>(`/factories/${id}`),
  create: (data: FactoryCreatePayload) => api.post<Factory>('/factories', data),
  update: (id: string, data: FactoryUpdatePayload) =>
    api.patch<Factory>(`/factories/${id}`, data),
  remove: (id: string) => api.delete<{ ok: boolean }>(`/factories/${id}`),
}