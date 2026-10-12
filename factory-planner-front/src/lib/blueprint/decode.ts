import pako from 'pako'
import { BlueprintFormatError } from './errors.ts'

const FORMAT_VERSION_CHAR = '0'

// Factorio blueprint string -> сырой JSON (ещё не провалидированный на
// blueprint/blueprint_book — это уже lib/blueprint/book.ts). Формат:
// 1 символ версии + base64(zlib(json)). Все виды повреждений ловим и
// переводим в понятное русское сообщение, ничего не падает "в консоль".
export function decodeBlueprintString(rawInput: string): unknown {
  const trimmed = rawInput.replace(/\s+/g, '')
  if (trimmed.length === 0) {
    throw new BlueprintFormatError('Пустая строка — нечего импортировать')
  }

  const versionChar = trimmed[0]
  if (versionChar !== FORMAT_VERSION_CHAR) {
    throw new BlueprintFormatError(
      `Неизвестная версия строки чертежа: "${versionChar}" (поддерживается только "${FORMAT_VERSION_CHAR}")`,
    )
  }

  const base64Part = trimmed.slice(1)
  let bytes: Uint8Array
  try {
    const binary = atob(base64Part)
    bytes = new Uint8Array(binary.length)
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  } catch {
    throw new BlueprintFormatError('Не удалось декодировать base64 — строка повреждена или обрезана')
  }

  let jsonString: string
  try {
    jsonString = pako.inflate(bytes, { to: 'string' })
  } catch {
    throw new BlueprintFormatError('Не удалось распаковать данные (zlib) — строка повреждена')
  }

  try {
    return JSON.parse(jsonString)
  } catch {
    throw new BlueprintFormatError('Данные внутри чертежа повреждены — это не корректный JSON')
  }
}
