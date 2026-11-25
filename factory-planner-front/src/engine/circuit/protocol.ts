import type { SimModel, SimOptions, SimSnapshot, SimTopology } from './types.ts'

// Сообщения между главным потоком и Web Worker симуляции (worker.ts).
export type SimSpeed = 0.1 | 0.5 | 1 | 5 | 'max'

export type ToWorker =
  | { type: 'init'; model: SimModel; opts: SimOptions } // (пере)создать симуляцию, тик 0, пауза
  | { type: 'play'; speed: SimSpeed }
  | { type: 'pause' }
  | { type: 'step' } // +1 тик
  | { type: 'speed'; speed: SimSpeed }

export type FromWorker =
  | { type: 'ready'; topology: SimTopology; snapshot: SimSnapshot }
  | { type: 'snapshot'; snapshot: SimSnapshot }
