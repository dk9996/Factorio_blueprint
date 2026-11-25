import type { PlacedEntity } from '../../store/canvasStore'

// Миграция настроек манипуляторов/погрузчиков, сохранённых старым окном
// (PlacedEntity.config: useFilters/filterMode/filters/overrideStackSize/
// stackSizeOverride — собственный формат планировщика, в чертёж не
// попадал) в формат blueprint (extra.use_filters/filter_mode/filters/
// override_stack_size). Идемпотентна: после миграции старых ключей нет.
const LEGACY_KEYS = ['useFilters', 'filterMode', 'filters', 'overrideStackSize', 'stackSizeOverride']

export function migrateLegacyConfig(entity: PlacedEntity): PlacedEntity {
  const cfg = entity.config
  if (!cfg || !LEGACY_KEYS.some((k) => k in cfg)) return entity
  const extra: Record<string, unknown> = { ...(entity.extra ?? {}) }
  const isLoader = entity.type === 'loader' || entity.type === 'loader-1x1'
  if (cfg.useFilters !== undefined && !isLoader && extra.use_filters === undefined) extra.use_filters = Boolean(cfg.useFilters)
  if (cfg.filterMode !== undefined && extra.filter_mode === undefined && (!isLoader || cfg.useFilters)) extra.filter_mode = cfg.filterMode
  if (Array.isArray(cfg.filters) && extra.filters === undefined) {
    const list = (cfg.filters as (string | null)[])
      .map((name, i) => (name ? { index: i + 1, name } : null))
      .filter((f): f is { index: number; name: string } => f !== null)
    if (list.length > 0) extra.filters = list
  }
  if (cfg.overrideStackSize && typeof cfg.stackSizeOverride === 'number') {
    const key = isLoader ? 'belt_stack_size_override' : 'override_stack_size'
    if (extra[key] === undefined) extra[key] = cfg.stackSizeOverride
  }
  const rest = { ...cfg }
  for (const k of LEGACY_KEYS) delete rest[k]
  return { ...entity, config: Object.keys(rest).length > 0 ? rest : undefined, extra: Object.keys(extra).length > 0 ? extra : undefined }
}
