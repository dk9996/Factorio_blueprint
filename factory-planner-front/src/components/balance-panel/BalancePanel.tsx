import { TargetGoal } from './TargetGoal'

interface ResourceRow {
  name: string
  icon: string
  status: 'ok' | 'warn' | 'bad'
  required: string
  actual: string
}

const mockResources: ResourceRow[] = [
  {
    name: 'Медная пластина',
    icon: '/assets/icons-cropped/copper-plate.png',
    status: 'bad',
    required: 'нужно 200/мин',
    actual: 'факт 158/мин',
  },
  {
    name: 'Железная пластина',
    icon: '/assets/icons-cropped/iron-plate.png',
    status: 'ok',
    required: 'нужно 100/мин',
    actual: 'факт 132/мин',
  },
  {
    name: 'Зелёная схема',
    icon: '/assets/icons-cropped/electronic-circuit.png',
    status: 'warn',
    required: 'цель 100/мин',
    actual: 'простой 18%',
  },
  {
    name: 'Пластик',
    icon: '/assets/icons-cropped/plastic-bar.png',
    status: 'ok',
    required: 'нужно 50/мин',
    actual: 'факт 63/мин',
  },
]

export function BalancePanel() {
  return (
    <div className="balance-panel" onClick={(e) => e.stopPropagation()}>
      <div className="bp-head">
        <span>Баланс завода</span>
        <span className="bp-refresh">⟳ обновить</span>
      </div>

      <TargetGoal />

      <div className="bp-sub">Расчёт под цель ↑</div>
      <div className="bp-list">
        {mockResources.map((r) => (
          <div className="bp-row" key={r.name}>
            <div className={`bp-bar ${r.status}`} />
            <img className="bp-icon" src={r.icon} alt={r.name} />
            <div className="bp-name">
              {r.name}
              <span className="bp-req">{r.required}</span>
            </div>
            <div className="bp-val">{r.actual}</div>
          </div>
        ))}
      </div>

      <div className="bp-footer">
        <span className="lbl">⚡ 3.6 МВт</span>
        <span className="val">☁ 41/мин</span>
      </div>
    </div>
  )
}