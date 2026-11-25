// Каталог сигналов профиля (окно выбора сигнала): виртуальные сигналы,
// предметы и жидкости с группой/подгруппой и порядком — как в игре.
export interface SignalDef {
  type: 'item' | 'fluid' | 'virtual'
  name: string
  label: string
  icon: string | null
  group: string
  subgroup: string
  subgroupOrder: string
  order: string
  // только у предметов (для режимов селектора в симуляции)
  stackSize?: number
  rocketCapacity?: number
}

export interface SignalGroupDef {
  name: string
  label: string
  order: string
  icon: string | null
}

export interface SignalCatalog {
  groups: SignalGroupDef[]
  signals: SignalDef[]
}

export const EMPTY_SIGNALS: SignalCatalog = { groups: [], signals: [] }

// Ключ сигнала для поиска в карте: у предметов type в чертеже опущен.
export function signalKey(type: string | undefined, name: string): string {
  return `${type ?? 'item'}:${name}`
}

export function signalDefFor(
  map: Map<string, SignalDef>,
  signal: { name?: string; type?: string } | undefined,
): SignalDef | undefined {
  return signal?.name ? map.get(signalKey(signal.type, signal.name)) : undefined
}

// Блюпринтовый SignalID из определения: type опускается у предметов.
export function toSignalId(def: SignalDef, quality?: string): { name: string; type?: 'fluid' | 'virtual'; quality?: string } {
  const id: { name: string; type?: 'fluid' | 'virtual'; quality?: string } = { name: def.name }
  if (def.type !== 'item') id.type = def.type
  if (quality && quality !== 'normal') id.quality = quality
  return id
}
