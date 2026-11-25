import { create } from 'zustand'
import { useCanvasStore } from './canvasStore'
import { useEntityCatalogStore } from './entityCatalogStore'
import { buildSimModel, buildSimOptions } from '../lib/circuit/simModel'
import type { FromWorker, SimSpeed, ToWorker } from '../engine/circuit/protocol'
import type { SimSnapshot, SimTopology } from '../engine/circuit/types'

// Состояние симуляции схем в главном потоке. Сам расчёт — в Web Worker
// (engine/circuit/worker.ts); здесь — управление, снимок значений и
// автосброс при изменении схемы.
interface SimState {
  // пользователь уже запускал/шагал симуляцию в этом открытом проекте
  active: boolean
  running: boolean
  speed: SimSpeed
  tick: number
  topology: SimTopology | null
  snapshot: SimSnapshot | null
  // метка времени последнего автосброса из-за изменения схемы
  resetAt: number | null
  play: () => void
  pause: () => void
  step: () => void
  reset: () => void
  setSpeed: (s: SimSpeed) => void
  dispose: () => void
}

let worker: Worker | null = null
let signature = ''
let watching = false
let unsubscribe: (() => void) | null = null
let debounce: ReturnType<typeof setTimeout> | null = null

function send(m: ToWorker): void {
  worker?.postMessage(m)
}

function ensureWorker(): Worker {
  if (worker) return worker
  worker = new Worker(new URL('../engine/circuit/worker.ts', import.meta.url), { type: 'module' })
  worker.onmessage = (e: MessageEvent<FromWorker>) => {
    const m = e.data
    if (m.type === 'ready') useSimStore.setState({ topology: m.topology, snapshot: m.snapshot, tick: m.snapshot.tick })
    else useSimStore.setState({ snapshot: m.snapshot, tick: m.snapshot.tick })
  }
  return worker
}

function currentModel() {
  const { entities, wires } = useCanvasStore.getState()
  const catalog = useEntityCatalogStore.getState()
  return {
    model: buildSimModel(entities, wires),
    opts: buildSimOptions(catalog.signals, catalog.qualities),
  }
}

function signatureOf(model: ReturnType<typeof buildSimModel>): string {
  return JSON.stringify(model)
}

function initWorker(): void {
  ensureWorker()
  const { model, opts } = currentModel()
  signature = signatureOf(model)
  send({ type: 'init', model, opts })
}

// Любое изменение топологии или настроек комбинаторов сбрасывает состояние
// (тик 0) и ставит на паузу; в панели вспыхивает «схема изменена».
function onEditorChange(): void {
  if (debounce) clearTimeout(debounce)
  debounce = setTimeout(() => {
    const st = useSimStore.getState()
    if (!st.active) return
    const { model } = currentModel()
    if (signatureOf(model) === signature) return
    initWorker()
    useSimStore.setState({ running: false, resetAt: Date.now() })
  }, 120)
}

function startWatching(): void {
  if (watching) return
  watching = true
  let prevEntities = useCanvasStore.getState().entities
  let prevWires = useCanvasStore.getState().wires
  unsubscribe = useCanvasStore.subscribe((s) => {
    if (s.entities === prevEntities && s.wires === prevWires) return
    prevEntities = s.entities
    prevWires = s.wires
    onEditorChange()
  })
}

export const useSimStore = create<SimState>((set, get) => ({
  active: false,
  running: false,
  speed: 1,
  tick: 0,
  topology: null,
  snapshot: null,
  resetAt: null,

  play: () => {
    if (!get().active) {
      initWorker()
      startWatching()
      set({ active: true })
    }
    send({ type: 'play', speed: get().speed })
    set({ running: true })
  },
  pause: () => {
    send({ type: 'pause' })
    set({ running: false })
  },
  step: () => {
    if (!get().active) {
      initWorker()
      startWatching()
      set({ active: true })
    }
    send({ type: 'step' })
    set({ running: false })
  },
  reset: () => {
    if (!get().active) return
    initWorker()
    set({ running: false, resetAt: null })
  },
  setSpeed: (speed) => {
    set({ speed })
    if (get().running) send({ type: 'speed', speed })
  },
  dispose: () => {
    if (debounce) clearTimeout(debounce)
    unsubscribe?.()
    unsubscribe = null
    watching = false
    worker?.terminate()
    worker = null
    signature = ''
    set({ active: false, running: false, tick: 0, topology: null, snapshot: null, resetAt: null })
  },
}))
