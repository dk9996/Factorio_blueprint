import { useEffect, useState } from 'react'
import { useSimStore } from '../../store/simStore'
import type { SimSpeed } from '../../engine/circuit/protocol'

const SPEEDS: { value: SimSpeed; label: string }[] = [
  { value: 0.1, label: '0.1x' },
  { value: 0.5, label: '0.5x' },
  { value: 1, label: '1x' },
  { value: 5, label: '5x' },
  { value: 'max', label: 'Макс' },
]

// Панель симуляции схем (рядом с настройками): Play/Pause, шаг (+1 тик),
// скорость, счётчик тиков, сброс. Изменение схемы сбрасывает состояние —
// об этом сообщает вспыхивающая плашка «схема изменена».
export function SimPanel() {
  const running = useSimStore((s) => s.running)
  const active = useSimStore((s) => s.active)
  const speed = useSimStore((s) => s.speed)
  const tick = useSimStore((s) => s.tick)
  const resetAt = useSimStore((s) => s.resetAt)
  const { play, pause, step, reset, setSpeed } = useSimStore.getState()
  const [flash, setFlash] = useState(false)

  useEffect(() => {
    if (!resetAt) return
    setFlash(true)
    const t = setTimeout(() => setFlash(false), 2500)
    return () => clearTimeout(t)
  }, [resetAt])

  return (
    <div className="sim-panel" onMouseDown={(e) => e.stopPropagation()}>
      <div className="settings-panel-title">Симуляция схем</div>
      <div className="sim-row">
        <button className={`select-tool-btn${running ? ' active' : ''}`} onClick={running ? pause : play} title={running ? 'Пауза' : 'Запуск'}>
          {running ? '⏸ Пауза' : '▶ Play'}
        </button>
        <button className="select-tool-btn" onClick={step} title="Один тик вперёд">⏭ Шаг</button>
        <button className="select-tool-btn" onClick={reset} disabled={!active} title="Сбросить состояние (тик 0)">⟲ Сброс</button>
      </div>
      <div className="sim-row">
        <span className="sim-label">Скорость</span>
        {SPEEDS.map((s) => (
          <button key={String(s.value)} className={`select-tool-btn small${speed === s.value ? ' active' : ''}`} onClick={() => setSpeed(s.value)}>
            {s.label}
          </button>
        ))}
      </div>
      <div className="sim-row">
        <span className="sim-label">Тик</span>
        <span className="sim-tick">{tick}</span>
        {flash && <span className="sim-changed">схема изменена — состояние сброшено</span>}
      </div>
      {!active && <div className="sim-hint">Нажмите Play или Шаг: значения появятся на проводах (наведите на провод) и в окнах комбинаторов.</div>}
    </div>
  )
}

// Кнопка в TopBar: открывает панель, показывает состояние.
export function SimButton() {
  const [open, setOpen] = useState(false)
  const running = useSimStore((s) => s.running)
  const active = useSimStore((s) => s.active)
  const tick = useSimStore((s) => s.tick)
  useEffect(() => () => useSimStore.getState().dispose(), [])
  return (
    <span className="sim-btn-wrap">
      <button className={`select-tool-btn${open || running ? ' active' : ''}`} onClick={() => setOpen((v) => !v)} title="Симуляция красных/зелёных проводов и комбинаторов">
        ⚡ Схема{active ? ` ${running ? '▶' : '⏸'} ${tick}` : ''}
      </button>
      {open && <SimPanel />}
    </span>
  )
}

// Мини-панель управления для окон комбинаторов (пока окно открыто, основная
// панель закрыта оверлеем): Play/Пауза, Шаг, Сброс, счётчик тиков.
export function SimMiniBar() {
  const running = useSimStore((s) => s.running)
  const active = useSimStore((s) => s.active)
  const tick = useSimStore((s) => s.tick)
  const { play, pause, step, reset } = useSimStore.getState()
  return (
    <div className="sim-mini">
      <button className="gw-btn small" onClick={running ? pause : play}>{running ? '⏸ Пауза' : '▶ Play'}</button>
      <button className="gw-btn small" onClick={step}>⏭ Шаг</button>
      <button className="gw-btn small" onClick={reset} disabled={!active}>⟲ Сброс</button>
      <span className="sim-mini-tick">{active ? `тик ${tick}` : 'симуляция не запущена'}</span>
    </div>
  )
}
