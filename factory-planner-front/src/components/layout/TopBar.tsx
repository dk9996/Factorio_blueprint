import { useFactoryStore } from '../../store/factoryStore'

export function TopBar() {
  const activeId = useFactoryStore((s) => s.activeId)
  const factories = useFactoryStore((s) => s.factories)
  const active = factories.find((f) => f.id === activeId)

  return (
    <div className="topbar">
      <div className="logo">⛭ FACTORY PLANNER</div>
      <div className="breadcrumb">
        Заводы / <b>{active ? active.name : 'не выбрано'}</b>
      </div>
      <div className="spacer" />
      <div className="sim-status">
        <span className="dot" /> симуляция актуальна · 60 тик/с
      </div>
    </div>
  )
}