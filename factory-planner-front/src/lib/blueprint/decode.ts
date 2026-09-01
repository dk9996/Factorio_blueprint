import pako from 'pako'
import type { BlueprintWrapper } from '../../types/blueprint'

/**
 * Factorio blueprint string → JSON
 * Формат: 1 байт версии + base64(zlib(json))
 */
export function decodeBlueprint(bpString: string): BlueprintWrapper {
  const versionByte = bpString[0]
  const base64Part = bpString.slice(1)

  const binary = atob(base64Part)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i)
  }

  const jsonString = pako.inflate(bytes, { to: 'string' })
  return JSON.parse(jsonString) as BlueprintWrapper

  // versionByte пока не используется, но пригодится
  // если Factorio сменит формат в будущих версиях
}