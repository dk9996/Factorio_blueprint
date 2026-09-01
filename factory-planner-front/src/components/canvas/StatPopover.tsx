import type { PlacedEntity } from '../../store/canvasStore'

interface Props {
  entity: PlacedEntity
}

export function StatPopover({ entity }: Props) {
  return (
    <div
      className="stat-pop"
      style={{ left: entity.x + entity.width + 12, top: entity.y + 20 }}
    >
      <div className="row">
        <span>Электричество</span>
        <span className="ok">{entity.power ?? 0} кВт</span>
      </div>
      <div className="row">
        <span>Загрязнение</span>
        <span>{entity.pollution ?? 0} /мин</span>
      </div>
      <div className="row">
        <span>Пропускная сп.</span>
        <span className={entity.bottleneck ? 'bad' : 'ok'}>
          {entity.throughput ?? 100}%
        </span>
      </div>
      <div className="arrow" />
    </div>
  )
}