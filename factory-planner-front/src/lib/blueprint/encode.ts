import pako from 'pako'
import type { BlueprintWrapper } from '../../types/blueprint'

const FORMAT_VERSION = '0' // текущая версия формата Factorio blueprint string

export function encodeBlueprint(data: BlueprintWrapper): string {
  const jsonString = JSON.stringify(data)
  const compressed = pako.deflate(jsonString, { level: 9 })

  let binary = ''
  for (let i = 0; i < compressed.length; i++) {
    binary += String.fromCharCode(compressed[i])
  }
  const base64 = btoa(binary)

  return FORMAT_VERSION + base64
}