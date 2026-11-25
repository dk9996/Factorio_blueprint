import { api } from './client'
import type { CatalogEntity } from '../../store/entityCatalogStore'
import type { ModuleDef } from '../modules'
import type { QualityDef } from '../quality'
import type { TileDef } from '../tiles'
import type { SignalCatalog } from '../circuit/signals'

// profile — id вида "base+er+quality+space-age" (см. lib/content/profile.ts).
// КРИТИЧНО: encodeURIComponent обязателен — "+" в query-строке по
// стандартной конвенции декодируется сервером как пробел (та же логика,
// что у application/x-www-form-urlencoded), без энкодинга бэкенд получит
// "base er quality space-age" вместо корректного id и ответит 400.
export const entitiesApi = {
  list: (profile = 'base') => api.get<CatalogEntity[]>(`/entities?profile=${encodeURIComponent(profile)}`),
  rebuild: (profile = 'base', forceRedump = false) =>
    api.post<{ total: number; skipped_no_icon: number; skipped_no_type: number }>(
      `/entities/rebuild?profile=${encodeURIComponent(profile)}&force_redump=${forceRedump}`,
      {},
    ),
  // Модули выбранного профиля (качество — только где есть DLC).
  modules: (profile = 'base') => api.get<ModuleDef[]>(`/entities/modules?profile=${encodeURIComponent(profile)}`),
  // Сигналы профиля для окна выбора сигнала (схемная сеть).
  signals: (profile = 'base') => api.get<SignalCatalog>(`/entities/signals?profile=${encodeURIComponent(profile)}`),
  // Плитки, которые можно положить в профиле (палитра «Плитки»).
  tiles: (profile = 'base') => api.get<TileDef[]>(`/entities/tiles?profile=${encodeURIComponent(profile)}`),
  // Качества профиля (пусто без DLC quality) — включают функцию качества.
  qualities: (profile = 'base') => api.get<QualityDef[]>(`/entities/qualities?profile=${encodeURIComponent(profile)}`),
  // typeId -> id профиля, в котором эта сущность впервые появляется — для
  // подсказки "включить <DLC>" при импорте чертежа вне текущего профиля
  // (см. ImportExportPanel.tsx/MenuImportDialog.tsx).
  profileOrigin: () => api.get<Record<string, string>>('/entities/profile-origin'),
}
