import { useEntityCatalogStore } from '../../store/entityCatalogStore'
import { useUiStore } from '../../store/uiStore'

interface Props {
  typeId: string
  icon: string
  label: string
  x: number
  y: number
  width: number
  height: number
  direction?: 0 | 90 | 180 | 270
  blocked: boolean
  // Призрак — вторая (выходная) часть подземной пары и стоит в зоне
  // связи с уже поставленной первой частью (см. src/lib/underground.ts,
  // BlueprintCanvas.tsx) — подсвечиваем зелёной рамкой "соединится".
  connects?: boolean
}

export function PlacementGhost({ typeId, icon, label, x, y, width, height, direction, blocked, connects }: Props) {
  const useRealSprites = useUiStore((s) => s.useRealSprites)
  const showDirectionArrow = useUiStore((s) => s.showDirectionArrow)
  const catalogEntry = useEntityCatalogStore((s) => s.entities.find((e) => e.typeId === typeId))
  const isPipeLike = !!catalogEntry?.pipeSpriteVariants

  return (
    <div
      className={`entity-ghost${blocked ? ' blocked' : connects ? ' connects' : ''}`}
      style={{ left: x, top: y, width, height }}
    >
      {useRealSprites ? (
        <img src={icon} alt={label} className="entity-sprite" />
      ) : (
        <>
          <img src={catalogEntry?.icon ?? icon} alt={label} />
          {!isPipeLike && showDirectionArrow && <div className={`entity-direction-arrow dir-${direction ?? 0}`} />}
        </>
      )}
    </div>
  )
}
