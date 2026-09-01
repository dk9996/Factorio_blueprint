import { useState } from 'react'

type TimeUnit = 'sec' | 'min' | 'hour'

const unitLabels: Record<TimeUnit, string> = {
  sec: '/сек',
  min: '/мин',
  hour: '/час',
}

export function TargetGoal() {
  const [target, setTarget] = useState(100)
  const [unit, setUnit] = useState<TimeUnit>('min')
  const actual = 82 // пока мок, позже придёт из расчёта

  const percent = Math.min(100, Math.round((actual / target) * 100))

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'ArrowUp') {
      e.preventDefault()
      setTarget((v) => v + 1)
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setTarget((v) => Math.max(0, v - 1))
    }
  }

  return (
    <div className="bp-target">
      <div className="bp-target-head">
        <span className="bp-target-pin">📌</span>
        <span className="bp-target-label">Цель производства</span>
        <span className="bp-target-edit">изменить</span>
      </div>
      <div className="bp-target-row">
        <span className="bp-target-name">Зелёная схема</span>
        <input
          className="bp-target-input"
          type="number"
          value={target}
          onChange={(e) => setTarget(Number(e.target.value) || 0)}
          onKeyDown={handleKeyDown}
        />
        <select
          className="bp-target-unit-select"
          value={unit}
          onChange={(e) => setUnit(e.target.value as TimeUnit)}
        >
          <option value="sec">сек</option>
          <option value="min">мин</option>
          <option value="hour">час</option>
        </select>
      </div>
      <div className="bp-target-bar">
        <div className="bp-target-fill" style={{ width: `${percent}%` }} />
      </div>
      <div className="bp-target-note">
        факт {actual}{unitLabels[unit]} — не хватает меди
      </div>
    </div>
  )
}