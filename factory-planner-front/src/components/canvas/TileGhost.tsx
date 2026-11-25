import { useEntityCatalogStore } from '../../store/entityCatalogStore'
import { useUiStore } from '../../store/uiStore'
import { pickTileVariant, TILE_GRID } from '../../lib/tiles'
import type { TileRect } from '../../hooks/useTilePainting'

// Призрак плитки в курсоре: одна ячейка 1x1 с полупрозрачной текстурой (или
// заливкой mapColor), привязанная к сетке тайлов. Рамка заливки/стирания —
// TileRectPreview.
export function TileGhost({ name, x, y }: { name: string; x: number; y: number }) {
  const def = useEntityCatalogStore((s) => s.tiles.find((t) => t.name === name))
  const realSprites = useUiStore((s) => s.useRealSprites)
  const style: React.CSSProperties = { left: x * TILE_GRID, top: y * TILE_GRID, width: TILE_GRID, height: TILE_GRID }
  if (def) {
    style.backgroundColor = def.mapColor
    if (realSprites && def.textureVariants) {
      const pick = pickTileVariant(def.textureVariants, x, y)
      style.backgroundImage = `url(${pick.url})`
      style.backgroundSize = `${def.textureVariants.cols * TILE_GRID}px ${def.textureVariants.rows * TILE_GRID}px`
      style.backgroundPosition = `${-pick.cellX * TILE_GRID}px ${-pick.cellY * TILE_GRID}px`
    }
  }
  return <div className="tile-ghost" style={style} />
}

export function TileRectPreview({ rect }: { rect: TileRect }) {
  const x = Math.min(rect.x0, rect.x1)
  const y = Math.min(rect.y0, rect.y1)
  const w = Math.abs(rect.x1 - rect.x0) + 1
  const h = Math.abs(rect.y1 - rect.y0) + 1
  return (
    <div
      className={`tile-rect${rect.erase ? ' erase' : ''}`}
      style={{ left: x * TILE_GRID, top: y * TILE_GRID, width: w * TILE_GRID, height: h * TILE_GRID }}
    >
      <span className="tile-rect-label">{w}×{h}</span>
    </div>
  )
}
