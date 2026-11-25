import type { PlacedEntity } from '../../store/canvasStore'
import { useCanvasStore } from '../../store/canvasStore'
import { QualityRow } from '../common/QualityRow'
import { storedQuality } from '../../lib/quality'

// Строка «Качество» в панели поставленной сущности (только в профилях с
// DLC quality — иначе QualityRow ничего не рисует).
export function EntityQuality({ entity }: { entity: PlacedEntity }) {
  const setEntityQuality = useCanvasStore((s) => s.setEntityQuality)
  return (
    <div className="entity-quality">
      <QualityRow value={entity.quality} onChange={(q) => setEntityQuality(entity.id, storedQuality(q))} />
    </div>
  )
}
