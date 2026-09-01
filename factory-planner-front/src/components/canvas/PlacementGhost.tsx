interface Props {
  icon: string
  label: string
  x: number
  y: number
  width: number
  height: number
  blocked: boolean
}

export function PlacementGhost({ icon, label, x, y, width, height, blocked }: Props) {
  return (
    <div
      className={`entity-ghost${blocked ? ' blocked' : ''}`}
      style={{ left: x, top: y, width, height }}
    >
      <img src={icon} alt={label} className="entity-sprite" />
    </div>
  )
}