import type { SignalKey, SignalMap } from './types.ts'

export interface SignalLike {
  name?: string
  type?: string
  quality?: string
}

export const SIGNAL_EACH = 'signal-each'
export const SIGNAL_EVERYTHING = 'signal-everything'
export const SIGNAL_ANYTHING = 'signal-anything'

export function sigKey(s: SignalLike | undefined | null): SignalKey | null {
  if (!s?.name) return null
  return `${s.type ?? 'item'}|${s.name}|${s.quality && s.quality !== 'any' ? s.quality : 'normal'}`
}

export function makeKey(type: string, name: string, quality: string): SignalKey {
  return `${type}|${name}|${quality}`
}

export interface ParsedKey {
  type: string
  name: string
  quality: string
}

export function parseKey(key: SignalKey): ParsedKey {
  const [type, name, quality] = key.split('|')
  return { type, name, quality }
}

export function isSpecial(s: SignalLike | undefined | null, name: string): boolean {
  return !!s && s.name === name && s.type === 'virtual'
}
export const isEach = (s: SignalLike | undefined | null) => isSpecial(s, SIGNAL_EACH)
export const isEverything = (s: SignalLike | undefined | null) => isSpecial(s, SIGNAL_EVERYTHING)
export const isAnything = (s: SignalLike | undefined | null) => isSpecial(s, SIGNAL_ANYTHING)

// int32 со знаком: переполнение оборачивается (two's complement), как в игре.
export const wrap32 = (n: number): number => n | 0

// map[key] += value (с обёрткой int32); нулевые значения убираются —
// сигнал со значением 0 в сети отсутствует.
export function addTo(map: SignalMap, key: SignalKey, value: number): void {
  const next = wrap32((map.get(key) ?? 0) + value)
  if (next === 0) map.delete(key)
  else map.set(key, next)
}

// Сумма выбранных сетей (красная и/или зелёная) по всем сигналам.
export function mergeMaps(a: SignalMap | undefined, b: SignalMap | undefined): SignalMap {
  const out: SignalMap = new Map()
  if (a) for (const [k, v] of a) out.set(k, v)
  if (b) for (const [k, v] of b) addTo(out, k, v)
  return out
}

export function sortedKeys(map: SignalMap): SignalKey[] {
  return [...map.keys()].sort()
}
