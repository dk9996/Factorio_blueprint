import { api } from './client'
import type { CatalogEntity } from '../../store/entityCatalogStore'

export const entitiesApi = {
  list: () => api.get<CatalogEntity[]>('/entities'),
  rebuild: (forceRedump = false) =>
    api.post<{ total: number; skipped_no_icon: number; skipped_no_type: number }>(
      `/entities/rebuild?force_redump=${forceRedump}`,
      {},
    ),
}