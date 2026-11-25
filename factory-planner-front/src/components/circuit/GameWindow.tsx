import { useState, type ReactNode } from 'react'
import { useCanvasStore, type PlacedEntity } from '../../store/canvasStore'
import { useEntityCatalogStore } from '../../store/entityCatalogStore'
import { EntityPreview } from '../canvas/EntityPreview'
import { ItemIcon } from '../common/ItemIcon'
import { signalDefFor, signalKey } from '../../lib/circuit/signals'
import type { NetworkSelection, SignalID, Wire, WireColor } from '../../lib/circuit/types'

// Общие части окон настройки схемных сущностей в стиле игры: рамка с
// заголовком, строка «Вход/Выход: …», превью на шахматке, стопка R/G,
// панели сигналов. Сами формы — в CombinatorConfigModal.tsx.

export function GameWindow({ title, wide, onClose, children }: { title: string; wide?: boolean; onClose: () => void; children: ReactNode }) {
  return (
    <div className="machine-modal-overlay" onClick={onClose}>
      <div className={`gw-window${wide ? ' wide' : ''}`} onClick={(e) => e.stopPropagation()} onWheel={(e) => e.stopPropagation()}>
        <div className="gw-titlebar">
          <span className="gw-title">{title}</span>
          <span className="gw-title-drag" />
          <button className="gw-close" onClick={onClose} title="Закрыть">✕</button>
        </div>
        <div className="gw-body">{children}</div>
      </div>
    </div>
  )
}

export function GwPanel({ title, children, className }: { title?: string; children: ReactNode; className?: string }) {
  return (
    <div className={`gw-col${className ? ` ${className}` : ''}`}>
      {title && <div className="gw-label">{title}</div>}
      {children}
    </div>
  )
}

// ---- состояние подключения ---------------------------------------------

function wireCount(wires: Wire[], entityId: number, connector: string | null, color: WireColor): number {
  return wires.filter((w) =>
    w.color === color &&
    ((w.a.entityId === entityId && (connector === null || w.a.connector === connector)) ||
      (w.b.entityId === entityId && (connector === null || w.b.connector === connector))),
  ).length
}

// Подключение коннектора: «Не подключено» либо цветные метки сетей. Номера
// сетей и значения придут вместе с симуляцией (этап 2).
function Link({ entity, connector }: { entity: PlacedEntity; connector: string | null }) {
  const wires = useCanvasStore((s) => s.wires)
  const red = wireCount(wires, entity.id, connector, 'red')
  const green = wireCount(wires, entity.id, connector, 'green')
  if (red === 0 && green === 0) return <span className="gw-link off">Не подключено</span>
  return (
    <span className="gw-link on">
      {red > 0 && <span className="gw-net red">Красная сеть{red > 1 ? ` ×${red}` : ''}</span>}
      {green > 0 && <span className="gw-net green">Зелёная сеть{green > 1 ? ` ×${green}` : ''}</span>}
    </span>
  )
}

export function StatusBar({ entity, io }: { entity: PlacedEntity; io: boolean }) {
  return io ? (
    <div className="gw-status">
      <span><b>Вход:</b> <Link entity={entity} connector="input" /></span>
      <span><b>Выход:</b> <Link entity={entity} connector="output" /></span>
    </div>
  ) : (
    <div className="gw-status"><Link entity={entity} connector={null} /></div>
  )
}

export function GhostLine() {
  return <div className="gw-ghost"><i />Призрак</div>
}

export function PreviewBox({ entity, arrows }: { entity: PlacedEntity; arrows: boolean }) {
  return (
    <div className="gw-preview">
      <div className="gw-preview-obj">
        {arrows && <span className="gw-arrow up" />}
        <EntityPreview entity={entity} />
        {arrows && <span className="gw-arrow down" />}
      </div>
    </div>
  )
}

// ---- R / G --------------------------------------------------------------

// Стопка флажков «R / G» выбора сети (не задано = обе включены, как в игре).
export function RGChecks({ value, onChange }: { value: NetworkSelection | undefined; onChange: (n: NetworkSelection) => void }) {
  const red = value?.red !== false
  const green = value?.green !== false
  return (
    <span className="gw-rg">
      <label title="Красный провод"><input type="checkbox" checked={red} onChange={(e) => onChange({ red: e.target.checked, green })} /><i>R</i></label>
      <label title="Зелёный провод"><input type="checkbox" checked={green} onChange={(e) => onChange({ red, green: e.target.checked })} /><i>G</i></label>
    </span>
  )
}

// ---- панели сигналов (заглушка до симуляции) -----------------------------

// Живой сигнал: ячейка красится цветом провода, с которого он считан
// (красный/зелёный); 'plain' — выход без подключённых проводов.
export interface LiveSignal {
  signal: SignalID
  color: 'red' | 'green' | 'plain'
  count: number
}

function formatCount(n: number): string {
  const a = Math.abs(n)
  if (a >= 1e9) return `${(n / 1e9).toFixed(a >= 1e10 ? 0 : 1)}G`
  if (a >= 1e6) return `${(n / 1e6).toFixed(a >= 1e7 ? 0 : 1)}M`
  if (a >= 1e4) return `${(n / 1e3).toFixed(a >= 1e5 ? 0 : 1)}k`
  return String(n)
}

export function SignalSlots({ title, rows, signals = [] }: { title: string; rows: number; signals?: LiveSignal[] }) {
  const defs = useEntityCatalogStore((s) => s.signals.signals)
  const map = new Map(defs.map((d) => [signalKey(d.type, d.name), d]))
  const total = Math.max(rows * 10, Math.ceil(signals.length / 10) * 10)
  return (
    <GwPanel title={title}>
      <div className="gw-sig-panel" style={{ ['--rows' as string]: rows }}>
        {Array.from({ length: total }, (_, i) => {
          const s = signals[i]
          if (!s) return <div key={i} className="gw-sig-cell" />
          const def = signalDefFor(map, s.signal)
          return (
            <div key={i} className={`gw-sig-cell filled ${s.color}`} title={`${def?.label ?? s.signal.name}: ${s.count}`}>
              {def?.icon && <ItemIcon src={def.icon} alt={def.label} quality={s.signal.quality} />}
              <span className="gw-sig-count">{formatCount(s.count)}</span>
            </div>
          )
        })}
      </div>
    </GwPanel>
  )
}

// ---- описание -----------------------------------------------------------

export function DescriptionBlock({ entity }: { entity: PlacedEntity }) {
  const set = useCanvasStore((s) => s.setEntityDescription)
  const current = typeof entity.extra?.player_description === 'string' ? (entity.extra.player_description as string) : ''
  const [open, setOpen] = useState(current !== '')
  const [text, setText] = useState(current)
  if (!open) return <div className="gw-footer"><button className="gw-btn" onClick={() => setOpen(true)}>Добавить описание</button></div>
  return (
    <div className="gw-footer">
      <textarea
        className="gw-desc"
        rows={2}
        autoFocus={current === ''}
        placeholder="Описание"
        value={text}
        onChange={(e) => setText(e.target.value)}
        onBlur={() => {
          if (text !== current) set(entity.id, text)
          if (text === '') setOpen(false)
        }}
      />
    </div>
  )
}
