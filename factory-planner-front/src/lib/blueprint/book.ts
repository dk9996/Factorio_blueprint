import type { BlueprintBookData, BlueprintData } from '../../types/blueprint.ts'
import { BlueprintFormatError } from './errors.ts'

export interface FlatBlueprint {
  label: string
  data: BlueprintData
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

// Рекурсивно разворачивает blueprint_book (вложенные книги бывают) в
// плоский список листовых чертежей, в порядке index. Записи внутри книги,
// которые не являются ни blueprint, ни blueprint_book (upgrade_planner,
// deconstruction_planner и т.п.) — пропускаются, а не роняют весь импорт;
// их имена попадают в skippedEntries для отчёта пользователю.
function flattenBook(book: BlueprintBookData, skippedEntries: string[]): FlatBlueprint[] {
  const result: FlatBlueprint[] = []
  const entries = [...(book.blueprints ?? [])].sort((a, b) => a.index - b.index)

  for (const entry of entries) {
    if (entry.blueprint) {
      result.push({
        label: entry.blueprint.label || `Чертёж ${entry.index + 1}`,
        data: entry.blueprint,
      })
    } else if (entry.blueprint_book) {
      result.push(...flattenBook(entry.blueprint_book, skippedEntries))
    } else {
      skippedEntries.push(entry.item ?? 'неизвестный элемент книги')
    }
  }

  return result
}

export interface ParsedTopLevel {
  blueprints: FlatBlueprint[]
  skippedBookEntries: string[]
}

// Разбирает верхний уровень JSON чертежа. Бросает BlueprintFormatError
// (на русском) для неподдерживаемых типов (upgrade_planner,
// deconstruction_planner) или в принципе нераспознанной структуры.
export function parseTopLevel(json: unknown): ParsedTopLevel {
  if (!isRecord(json)) {
    throw new BlueprintFormatError('Данные чертежа повреждены — ожидался объект JSON')
  }

  if (isRecord(json.blueprint)) {
    const data = json.blueprint as BlueprintData
    return {
      blueprints: [{ label: data.label || 'Чертёж', data }],
      skippedBookEntries: [],
    }
  }

  if (isRecord(json.blueprint_book)) {
    const skippedBookEntries: string[] = []
    const blueprints = flattenBook(json.blueprint_book as BlueprintBookData, skippedBookEntries)
    return { blueprints, skippedBookEntries }
  }

  if (isRecord(json.upgrade_planner)) {
    throw new BlueprintFormatError('Это "Планировщик обновлений" (upgrade planner) — такой тип чертежа не поддерживается')
  }

  if (isRecord(json.deconstruction_planner)) {
    throw new BlueprintFormatError(
      'Это "Планировщик разборки" (deconstruction planner) — такой тип чертежа не поддерживается',
    )
  }

  throw new BlueprintFormatError('Не удалось распознать тип чертежа — ожидался blueprint или blueprint_book')
}
