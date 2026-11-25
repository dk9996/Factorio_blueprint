import { useMemo, useState } from 'react'
import { useCanvasStore } from '../../store/canvasStore'
import { useEntityCatalogStore } from '../../store/entityCatalogStore'
import { useUiStore } from '../../store/uiStore'
import { connectorPoint, connectorsOf, GRID, type WireCheck } from '../../lib/circuit/connectors'
import type { WireColor } from '../../lib/circuit/types'
import { useSimStore } from '../../store/simStore'
import { NetPopover } from '../circuit/SimNets'

// Цвета проводов как в игре
export const WIRE_COLORS: Record<WireColor, string> = { red: '#e0392d', green: '#3dbb4e' }

interface Props {
  cursor: { x: number; y: number } | null
  hoverEntityId: number | null
  hoverConnector: string | null
  pendingCheck: WireCheck | null
}

// Слой проводов над сущностями (один SVG в мировых координатах холста):
// прямые линии цветов красный/зелёный, маркеры коннекторов — только при
// активном инструменте или при наведении на сущность. Видимость слоя —
// настройка «Слой проводов» (при активном инструменте провода видны всегда).
export function WireLayer({ cursor, hoverEntityId, hoverConnector, pendingCheck }: Props) {
  const wires = useCanvasStore((s) => s.wires)
  const entities = useCanvasStore((s) => s.entities)
  const catalog = useEntityCatalogStore((s) => s.entities)
  const showLayer = useUiStore((s) => s.showWireLayer)
  const wireTool = useUiStore((s) => s.wireTool)
  const wireStart = useUiStore((s) => s.wireStart)
  const catalogByTypeId = useMemo(() => new Map(catalog.map((c) => [c.typeId, c])), [catalog])
  const entityById = useMemo(() => new Map(entities.map((e) => [e.id, e])), [entities])

  const simActive = useSimStore((s) => s.active)
  const wireNet = useSimStore((s) => s.topology?.wireNet)
  const [hover, setHover] = useState<{ color: WireColor; net: number; x: number; y: number } | null>(null)
  const [pinned, setPinned] = useState<{ color: WireColor; net: number; x: number; y: number } | null>(null)
  // наведение/клик по проводу показывают значения сети (только пока схема считается)
  const probe = simActive && !wireTool

  const visible = showLayer || !!wireTool
  const lines = visible
    ? wires.flatMap((w) => {
        const ea = entityById.get(w.a.entityId)
        const eb = entityById.get(w.b.entityId)
        if (!ea || !eb) return []
        const pa = connectorPoint(ea, catalogByTypeId.get(ea.typeId), w.a.connector, w.color)
        const pb = connectorPoint(eb, catalogByTypeId.get(eb.typeId), w.b.connector, w.color)
        return pa && pb ? [{ id: w.id, color: w.color, pa, pb }] : []
      })
    : []

  // маркеры: все участники при активном инструменте, иначе — сущность под курсором
  const markerEntities = wireTool
    ? entities.filter((e) => catalogByTypeId.get(e.typeId)?.connectors)
    : hoverEntityId !== null
      ? entities.filter((e) => e.id === hoverEntityId && catalogByTypeId.get(e.typeId)?.connectors)
      : []

  let pending: { pa: { x: number; y: number }; pb: { x: number; y: number }; bad: boolean } | null = null
  if (wireTool && wireStart && cursor) {
    const ea = entityById.get(wireStart.entityId)
    const pa = ea && connectorPoint(ea, catalogByTypeId.get(ea.typeId), wireStart.connector, wireTool)
    if (pa) pending = { pa, pb: cursor, bad: !!pendingCheck && !pendingCheck.ok }
  }

  return (
    <>
    <svg
      className="wire-layer"
      style={{ position: 'absolute', left: 0, top: 0, width: 1, height: 1, overflow: 'visible', pointerEvents: 'none', zIndex: 1000000 }}
    >
      {lines.map((l) => (
        <g key={l.id}>
          <line x1={l.pa.x} y1={l.pa.y} x2={l.pb.x} y2={l.pb.y} stroke="#000" strokeOpacity={0.55} strokeWidth={4.5} strokeLinecap="round" vectorEffect="non-scaling-stroke" />
          <line x1={l.pa.x} y1={l.pa.y} x2={l.pb.x} y2={l.pb.y} stroke={WIRE_COLORS[l.color]} strokeWidth={2.5} strokeLinecap="round" vectorEffect="non-scaling-stroke" />
          {probe && wireNet?.[l.id] !== undefined && (
            <line
              x1={l.pa.x} y1={l.pa.y} x2={l.pb.x} y2={l.pb.y} stroke="transparent" strokeWidth={14}
              vectorEffect="non-scaling-stroke" style={{ pointerEvents: 'stroke', cursor: 'help' }}
              onMouseMove={(e) => setHover({ color: l.color, net: wireNet[l.id], x: e.clientX, y: e.clientY })}
              onMouseLeave={() => setHover(null)}
              onMouseDown={(e) => e.stopPropagation()}
              onClick={(e) => {
                e.stopPropagation()
                setPinned({ color: l.color, net: wireNet[l.id], x: e.clientX, y: e.clientY })
              }}
            />
          )}
        </g>
      ))}

      {markerEntities.map((e) =>
        connectorsOf(e, catalogByTypeId.get(e.typeId)).map((c) => {
          const cx = e.x + e.width / 2
          const cy = e.y + e.height / 2
          const active = e.id === hoverEntityId && c.id === hoverConnector
          const isStart = wireStart?.entityId === e.id && wireStart.connector === c.id
          return (
            <g key={`${e.id}-${c.id}`}>
              {(['red', 'green'] as WireColor[]).map((color) => (
                <circle
                  key={color}
                  cx={cx + c[color][0] * GRID}
                  cy={cy + c[color][1] * GRID}
                  r={active || isStart ? 5 : 3.5}
                  fill={WIRE_COLORS[color]}
                  stroke={active || isStart ? '#fff' : '#000'}
                  strokeWidth={active || isStart ? 2 : 1}
                  vectorEffect="non-scaling-stroke"
                  opacity={active || isStart || !wireTool || hoverEntityId === e.id ? 1 : 0.75}
                />
              ))}
            </g>
          )
        }),
      )}

      {pending && wireTool && (
        <g>
          <line
            x1={pending.pa.x} y1={pending.pa.y} x2={pending.pb.x} y2={pending.pb.y}
            stroke={pending.bad ? '#ff2a2a' : WIRE_COLORS[wireTool]}
            strokeWidth={2.5} strokeDasharray={pending.bad ? '6 4' : undefined} strokeLinecap="round" vectorEffect="non-scaling-stroke"
          />
          {pending.bad && pendingCheck && (
            <text x={pending.pb.x + 12} y={pending.pb.y - 10} fill="#ff6b6b" fontSize={13} fontWeight={600} stroke="#000" strokeWidth={3} paintOrder="stroke">
              {pendingCheck.reason === 'too-far'
                ? `Слишком далеко (${(pendingCheck.distance ?? 0).toFixed(1)} > ${pendingCheck.limit} тайлов)`
                : pendingCheck.reason === 'same-entity'
                  ? 'Нужна другая сущность'
                  : 'Нет подключения'}
            </text>
          )}
        </g>
      )}
    </svg>
    {probe && hover && !pinned && <NetPopover color={hover.color} net={hover.net} x={hover.x} y={hover.y} />}
    {probe && pinned && <NetPopover color={pinned.color} net={pinned.net} x={pinned.x} y={pinned.y} pinned onClose={() => setPinned(null)} />}
    </>
  )
}
