// Форматы сырого JSON Factorio (внутри строки чертежа), версии 1.1 и 2.0.
// Намеренно описаны широко (Record passthrough) — конвертация (lib/blueprint)
// разбирает в свои поля только то, что реально есть в модели приложения
// (recipe, direction, модули), всё остальное сохраняется как есть в
// PlacedEntity.extra / blueprintMeta, чтобы не терять настройки чертежа,
// импортированного из игры, при обратном экспорте.

export interface RawSignalId {
  type?: string
  name: string
}

export interface RawBlueprintIcon {
  index: number
  signal: RawSignalId
}

export interface RawBlueprintTile {
  name: string
  position: { x: number; y: number }
}

// [entity_number, connector_id, entity_number, connector_id]
export type RawWire = [number, number, number, number]

// Сырая сущность чертежа — entity_number/name/position/direction вынесены
// явно (их читает конвертация), остальное — произвольный passthrough.
export interface RawBlueprintEntity {
  entity_number: number
  name: string
  position: { x: number; y: number }
  direction?: number
  recipe?: string
  items?: unknown // модули — 1.1: {name: count}, 2.0: [{id:{name,quality?}, items:{in_inventory:[...]}}]
  [key: string]: unknown
}

export interface BlueprintData {
  item: 'blueprint'
  label?: string
  description?: string
  icons?: RawBlueprintIcon[]
  entities?: RawBlueprintEntity[]
  tiles?: RawBlueprintTile[]
  wires?: RawWire[]
  schedules?: unknown
  snap_to_grid?: { x: number; y: number }
  absolute_snapping?: boolean
  position_relative_to_grid?: { x: number; y: number }
  version: number
}

export interface BlueprintBookEntry {
  index: number
  blueprint?: BlueprintData
  blueprint_book?: BlueprintBookData
  // upgrade_planner / deconstruction_planner и т.п. — не поддерживаем,
  // но не роняем всю книгу целиком, см. lib/blueprint/book.ts
  item?: string
}

export interface BlueprintBookData {
  item: 'blueprint-book'
  label?: string
  description?: string
  icons?: RawBlueprintIcon[]
  blueprints?: BlueprintBookEntry[]
  active_index?: number
  version: number
}

export type BlueprintWrapper =
  | { blueprint: BlueprintData }
  | { blueprint_book: BlueprintBookData }
  | { upgrade_planner: { item: string; [key: string]: unknown } }
  | { deconstruction_planner: { item: string; [key: string]: unknown } }
