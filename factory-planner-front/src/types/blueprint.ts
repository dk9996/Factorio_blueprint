export interface BlueprintEntity {
  entity_number: number
  name: string
  position: { x: number; y: number }
  direction?: number
  recipe?: string
}

export interface BlueprintData {
  item: 'blueprint'
  label?: string
  entities: BlueprintEntity[]
  tiles?: { position: { x: number; y: number }; name: string }[]
  icons?: { index: number; signal: { type: string; name: string } }[]
  version: number
}

export interface BlueprintWrapper {
  blueprint: BlueprintData
}