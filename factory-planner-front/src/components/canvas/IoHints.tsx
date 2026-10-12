import type { IoHintPrimitive } from '../../lib/ioHints'

interface Props {
  width: number
  height: number
  hints: IoHintPrimitive[]
}

const KIND_COLOR: Record<string, string> = {
  in: 'var(--blue)',
  out: 'var(--accent)',
  dir: 'var(--accent)',
  neutral: 'var(--text-dim)',
}

const ICON_SIZE = 14
const ICON_DIST = 12

/**
 * SVG-оверлей подсказок входов/выходов — рендерится ТОЛЬКО в режиме
 * "квадрат с иконкой" (см. EntityNode.tsx), поверх плейсхолдера.
 * Геометрия уже посчитана и повёрнута под entity.direction в
 * src/lib/ioHints.ts — здесь только отрисовка примитивов.
 */
export function IoHints({ width, height, hints }: Props) {
  if (hints.length === 0) return null

  return (
    <svg
      className="io-hints"
      viewBox={`0 0 ${width} ${height}`}
      style={{ position: 'absolute', left: 0, top: 0, width, height, overflow: 'visible', pointerEvents: 'none' }}
    >
      {hints.map((h) => {
        const color = h.color ?? KIND_COLOR[h.kind] ?? 'var(--accent)'
        const rad = (h.angle * Math.PI) / 180
        const dx = Math.sin(rad)
        const dy = -Math.cos(rad)
        return (
          <g key={h.key} style={{ pointerEvents: 'auto' }}>
            {h.label && <title>{h.label}</title>}
            <polygon
              transform={`translate(${h.x}, ${h.y}) rotate(${h.angle})`}
              points="0,-7 5.5,4 -5.5,4"
              fill={color}
              stroke="rgba(0,0,0,.55)"
              strokeWidth={0.75}
            />
            {h.iconUrl && (
              <image
                href={h.iconUrl}
                x={h.x + dx * ICON_DIST - ICON_SIZE / 2}
                y={h.y + dy * ICON_DIST - ICON_SIZE / 2}
                width={ICON_SIZE}
                height={ICON_SIZE}
              />
            )}
          </g>
        )
      })}
    </svg>
  )
}
