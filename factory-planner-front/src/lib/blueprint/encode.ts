import pako from 'pako'

const FORMAT_VERSION_CHAR = '0'

// Сырой JSON ({blueprint:...} или {blueprint_book:...}) -> Factorio
// blueprint string. Пара к decodeBlueprintString.
export function encodeBlueprintString(data: unknown): string {
  const jsonString = JSON.stringify(data)
  const compressed = pako.deflate(jsonString, { level: 9 })

  let binary = ''
  for (let i = 0; i < compressed.length; i++) {
    binary += String.fromCharCode(compressed[i])
  }
  const base64 = btoa(binary)

  return FORMAT_VERSION_CHAR + base64
}
