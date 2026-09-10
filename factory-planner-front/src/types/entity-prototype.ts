export interface CanvasEntity {
  id: number
  name: string
  kind: 'assembler' | 'belt'
  x: number
  y: number
  width: number
  height: number
  bottleneck?: boolean
  power?: number
  pollution?: number
  throughput?: number
}