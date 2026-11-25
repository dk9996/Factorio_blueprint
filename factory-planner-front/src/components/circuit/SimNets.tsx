import { useMemo } from 'react'
import { createPortal } from 'react-dom'
import { useEntityCatalogStore } from '../../store/entityCatalogStore'
import { useSimStore } from '../../store/simStore'
import { entityNetRefs, netValues, type NetValue } from '../../lib/circuit/simView'
import { signalKey, type SignalDef } from '../../lib/circuit/signals'
import { ItemIcon } from '../common/ItemIcon'
import type { WireColor } from '../../lib/circuit/types'

// Показ значений сетей симуляции: список «иконка сигнала + число»,
// всплывающая панель сети (наведение/клик по проводу) и блок «Сети» для
// столбов, ламп, манипуляторов и других подключённых сущностей.
export const COLOR_NAME: Record<WireColor, string> = { red: 'Красная', green: 'Зелёная' }

export function useSignalDefs(): Map<string, SignalDef> {
  const signals = useEntityCatalogStore((s) => s.signals.signals)
  return useMemo(() => new Map(signals.map((s) => [signalKey(s.type, s.name), s])), [signals])
}

export function SignalValueRow({ v, defs }: { v: NetValue; defs: Map<string, SignalDef> }) {
  const def = defs.get(signalKey(v.type, v.name))
  return (
    <div className="sim-val-row" title={def?.label ?? v.name}>
      {def?.icon ? <ItemIcon src={def.icon} alt={def.label} quality={v.quality === 'normal' ? undefined : v.quality} /> : <span className="sim-val-fallback">{v.name.slice(0, 3)}</span>}
      <span className="sim-val-name">{def?.label ?? v.name}</span>
      <span className="sim-val-num">{v.value}</span>
    </div>
  )
}

export function NetValuesList({ net, limit }: { net: number; limit?: number }) {
  const snapshot = useSimStore((s) => s.snapshot)
  const defs = useSignalDefs()
  const values = netValues(snapshot, net)
  if (values.length === 0) return <div className="sim-val-empty">Нет сигналов</div>
  const shown = limit ? values.slice(0, limit) : values
  return (
    <div className="sim-val-list">
      {shown.map((v) => <SignalValueRow key={v.key} v={v} defs={defs} />)}
      {limit && values.length > limit && <div className="sim-val-empty">… ещё {values.length - limit}</div>}
    </div>
  )
}

export function NetPopover({ color, net, x, y, pinned, onClose }: {
  color: WireColor
  net: number
  x: number
  y: number
  pinned?: boolean
  onClose?: () => void
}) {
  return createPortal(
    <div className={`sim-pop ${color}`} style={{ left: Math.min(x + 14, window.innerWidth - 260), top: Math.min(y + 14, window.innerHeight - 200) }}>
      <div className="sim-pop-title">
        <span className={`sim-dot ${color}`} />
        {COLOR_NAME[color]} сеть #{net}
        {pinned && <button className="sim-pop-close" onClick={onClose}>✕</button>}
      </div>
      <NetValuesList net={net} />
    </div>,
    document.body,
  )
}

// Блок «Сети» в панели сущности: к каким сетям подключена и что в них.
export function EntityNetsBlock({ entityId }: { entityId: number }) {
  const active = useSimStore((s) => s.active)
  const topology = useSimStore((s) => s.topology)
  if (!active) return null
  const refs = entityNetRefs(topology, entityId)
  if (refs.length === 0) return null
  return (
    <div className="sim-nets-block">
      <div className="sim-nets-title">Сети</div>
      {refs.map((r) => (
        <div key={`${r.color}-${r.connector}`} className="sim-nets-item">
          <div className="sim-pop-title small">
            <span className={`sim-dot ${r.color}`} />
            {COLOR_NAME[r.color]} сеть #{r.net}
            {r.connector !== 'single' && <span className="sim-conn">{r.connector === 'input' ? 'вход' : 'выход'}</span>}
          </div>
          <NetValuesList net={r.net} limit={6} />
        </div>
      ))}
    </div>
  )
}
