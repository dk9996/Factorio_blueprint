import { createSimulation, type Simulation } from './sim.ts'
import type { FromWorker, SimSpeed, ToWorker } from './protocol.ts'

// Web Worker симуляции: считает тики (60 тик/с × скорость; «max» — сколько
// успеет за кадровый бюджет) и ~20 раз в секунду присылает снимок значений.
const ctx = self as unknown as { onmessage: ((e: MessageEvent<ToWorker>) => void) | null; postMessage(m: FromWorker): void }

let sim: Simulation | null = null
let running = false
let speed: SimSpeed = 1
let last = 0
let owed = 0 // накопленные «долги» тиков (дробная часть между слайсами)
let lastPost = 0
let timer: ReturnType<typeof setTimeout> | null = null

const TICKS_PER_SECOND = 60
const SLICE_MS = 8
const BUDGET_MS = 10 // сколько мс подряд считаем в режиме max
const POST_EVERY_MS = 50

function post(force: boolean): void {
  if (!sim) return
  const now = performance.now()
  if (!force && now - lastPost < POST_EVERY_MS) return
  lastPost = now
  ctx.postMessage({ type: 'snapshot', snapshot: sim.snapshot() })
}

function loop(): void {
  timer = null
  if (!running || !sim) return
  const now = performance.now()
  if (speed === 'max') {
    const end = now + BUDGET_MS
    while (performance.now() < end) sim.step(10)
  } else {
    owed += ((now - last) / 1000) * TICKS_PER_SECOND * speed
    const due = Math.floor(owed)
    owed -= due
    if (due > 0) sim.step(Math.min(due, 600)) // потолок защищает от лавины после паузы вкладки
  }
  last = now
  post(false)
  timer = setTimeout(loop, SLICE_MS)
}

function start(): void {
  if (running) return
  running = true
  last = performance.now()
  owed = 0
  timer = setTimeout(loop, 0)
}

function stop(): void {
  running = false
  if (timer) clearTimeout(timer)
  timer = null
}

ctx.onmessage = (e) => {
  const m = e.data
  switch (m.type) {
    case 'init':
      stop()
      sim = createSimulation(m.model, m.opts)
      ctx.postMessage({ type: 'ready', topology: sim.topology, snapshot: sim.snapshot() })
      break
    case 'play':
      speed = m.speed
      start()
      break
    case 'speed':
      speed = m.speed
      break
    case 'pause':
      stop()
      post(true)
      break
    case 'step':
      stop()
      sim?.step(1)
      post(true)
      break
  }
}
