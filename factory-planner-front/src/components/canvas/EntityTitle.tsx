import type { PlacedEntity } from '../../store/canvasStore'
import { useEntityCatalogStore } from '../../store/entityCatalogStore'
import { isUpgradedQuality } from '../../lib/quality'

// Название сущности в заголовке панели; при качестве выше normal —
// добавляется название качества его цветом.
export function EntityTitle({ entity }: { entity: PlacedEntity }) {
  const q = useEntityCatalogStore((s) =>
    isUpgradedQuality(entity.quality) ? s.qualities.find((x) => x.name === entity.quality) : undefined,
  )
  return (
    <span className="mm-titlebar-name">
      {entity.label}
      {q && <span className="quality-name" style={{ color: q.color }}> · {q.localizedName}</span>}
    </span>
  )
}
