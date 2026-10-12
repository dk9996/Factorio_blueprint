// Небольшой самостоятельный тестовый скрипт (в проекте нет vitest/jest) —
// запускать из factory-planner-front:
//   node src/lib/blueprint/selfTest.ts
// Node 22.6+/24+ умеет исполнять .ts напрямую (type-stripping), поэтому
// внутри этого файла и всех модулей, которые он реально исполняет,
// используются явные ".ts"-расширения в относительных импортах
// (tsconfig.app.json: allowImportingTsExtensions — это не ломает Vite).
import { encodeBlueprintString } from './encode.ts'
import { decodeBlueprintString } from './decode.ts'
import { decodeDirection, encodeDirection } from './direction.ts'
import { packVersion, DEFAULT_EXPORT_VERSION } from './version.ts'
import { blueprintDataToEntities, entitiesToBlueprintData } from './convert.ts'
import type { BlueprintData } from '../../types/blueprint.ts'
import type { CatalogEntity } from '../../store/entityCatalogStore.ts'
import type { EntityDirection, PlacedEntity } from '../../store/canvasStore.ts'

let failed = 0
let passed = 0

function assert(condition: boolean, message: string) {
  if (condition) {
    passed++
    console.log(`  OK  ${message}`)
  } else {
    failed++
    console.log(`FAIL  ${message}`)
  }
}

function deepEqual(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b)
}

function fakeCatalogEntry(typeId: string, width: number, height: number, overrides: Partial<CatalogEntity> = {}): CatalogEntity {
  return {
    typeId,
    type: typeId,
    label: typeId,
    icon: '',
    entitySprite: null,
    pipeSpriteVariants: null,
    fluidPipeOverlays: null,
    directionalSprites: null,
    ioHints: null,
    category: '',
    categoryId: '',
    categoryOrder: '',
    subgroup: '',
    subgroupOrder: '',
    itemOrder: '',
    categoryIcon: '',
    width,
    height,
    craftingCategories: null,
    moduleSlots: 0,
    craftingSpeed: null,
    miningSpeed: null,
    researchingSpeed: null,
    speed: null,
    rocketPartsRequired: null,
    filterCount: 0,
    bulkInserterConfig: false,
    logisticRadius: null,
    constructionRadius: null,
    spriteFrameWidth: null,
    spriteFrameHeight: null,
    spriteFrameCount: null,
    spriteLineLength: null,
    spriteShiftX: 0,
    spriteShiftY: 0,
    spriteScale: 1,
    spriteGameShiftX: 0,
    spriteGameShiftY: 0,
    ...overrides,
  }
}

console.log('=== 1. encode(decode(s)) == s (по смыслу) ===')
{
  // Строка "как будто из 1.1" — version major=1, direction в 0..7.
  const v11 = packVersion(1, 1, 110)
  const blueprint11: BlueprintData = {
    item: 'blueprint',
    label: 'Тест 1.1',
    version: v11,
    entities: [
      { entity_number: 1, name: 'transport-belt', position: { x: 0.5, y: 0.5 }, direction: 2 },
      { entity_number: 2, name: 'assembling-machine-2', position: { x: 2, y: 2 }, recipe: 'iron-gear-wheel' },
    ],
  }
  const s1 = encodeBlueprintString({ blueprint: blueprint11 })
  const decoded1 = decodeBlueprintString(s1)
  const s1b = encodeBlueprintString(decoded1)
  const decoded1b = decodeBlueprintString(s1b)
  assert(deepEqual(decoded1, decoded1b), '1.1-строка: decode(encode(decode(s))) эквивалентен decode(s)')
  assert(s1[0] === '0', '1.1-строка: версия-символ "0"')

  // Строка "как будто из 2.0" — version major=2, direction в 0..15, с
  // модулями (2.0-формат items), wires, tiles.
  const v20 = packVersion(2, 0, 28)
  const blueprint20: BlueprintData = {
    item: 'blueprint',
    label: 'Тест 2.0',
    version: v20,
    entities: [
      {
        entity_number: 1,
        name: 'assembling-machine-2',
        position: { x: 1.5, y: 1.5 },
        direction: 8,
        recipe: 'iron-gear-wheel',
        items: [
          { id: { name: 'productivity-module-2' }, items: { in_inventory: [{ inventory: 'crafter_modules', stack: 0 }] } },
        ],
      },
      { entity_number: 2, name: 'pipe', position: { x: 3, y: 1 } },
    ],
    tiles: [{ name: 'concrete', position: { x: 0, y: 0 } }],
    wires: [[1, 1, 2, 1]],
  }
  const s2 = encodeBlueprintString({ blueprint: blueprint20 })
  const decoded2 = decodeBlueprintString(s2)
  const s2b = encodeBlueprintString(decoded2)
  const decoded2b = decodeBlueprintString(s2b)
  assert(deepEqual(decoded2, decoded2b), '2.0-строка: decode(encode(decode(s))) эквивалентен decode(s)')
  assert(deepEqual(decoded2, { blueprint: blueprint20 }), '2.0-строка: decode(s) совпадает с исходным объектом')
}

console.log('=== 2. Ошибки формата (на русском, не падают) ===')
{
  try {
    decodeBlueprintString('1abc')
    assert(false, 'неверный версия-символ должен бросать ошибку')
  } catch (err) {
    assert(err instanceof Error && /версия/i.test(err.message), `неверный версия-символ -> понятная ошибка ("${(err as Error).message}")`)
  }

  try {
    decodeBlueprintString('0!!!not-base64!!!')
    assert(false, 'битый base64 должен бросать ошибку')
  } catch (err) {
    assert(err instanceof Error, `битый base64 -> ошибка ("${(err as Error).message}")`)
  }

  try {
    decodeBlueprintString('0' + btoa('это не zlib вообще'))
    assert(false, 'не-zlib данные должны бросать ошибку')
  } catch (err) {
    assert(err instanceof Error, `не-zlib данные -> ошибка ("${(err as Error).message}")`)
  }
}

console.log('=== 3. Конвертация direction в обе стороны ===')
{
  const V11 = packVersion(1, 1, 110)
  const V20 = packVersion(2, 0, 28)

  // 1.1: 0..7, кардинальные значения 0/2/4/6
  assert(decodeDirection(0, V11) === 0, '1.1 raw=0 -> 0° (север)')
  assert(decodeDirection(2, V11) === 90, '1.1 raw=2 -> 90° (восток)')
  assert(decodeDirection(4, V11) === 180, '1.1 raw=4 -> 180° (юг)')
  assert(decodeDirection(6, V11) === 270, '1.1 raw=6 -> 270° (запад)')
  assert(decodeDirection(undefined, V11) === 0, '1.1 raw=undefined -> 0° (север по умолчанию)')

  // 2.0: 0..15, кардинальные значения 0/4/8/12
  assert(decodeDirection(0, V20) === 0, '2.0 raw=0 -> 0° (север)')
  assert(decodeDirection(4, V20) === 90, '2.0 raw=4 -> 90° (восток)')
  assert(decodeDirection(8, V20) === 180, '2.0 raw=8 -> 180° (юг)')
  assert(decodeDirection(12, V20) === 270, '2.0 raw=12 -> 270° (запад)')
  assert(decodeDirection(undefined, V20) === 0, '2.0 raw=undefined -> 0° (север по умолчанию)')

  // Обратно (экспорт всегда в 2.0-масштабе)
  assert(encodeDirection(0) === undefined, 'encode 0° -> undefined (не пишем ключ)')
  assert(encodeDirection(undefined) === undefined, 'encode undefined -> undefined')
  assert(encodeDirection(90) === 4, 'encode 90° -> 4 (формат 2.0)')
  assert(encodeDirection(180) === 8, 'encode 180° -> 8 (формат 2.0)')
  assert(encodeDirection(270) === 12, 'encode 270° -> 12 (формат 2.0)')

  // Круговой обход: decode(encode(x) ?? 0, 2.0) === x
  for (const deg of [0, 90, 180, 270] as EntityDirection[]) {
    const raw = encodeDirection(deg) ?? 0
    assert(decodeDirection(raw, DEFAULT_EXPORT_VERSION) === deg, `round-trip direction ${deg}°`)
  }
}

console.log('=== 4. Конвертация позиций (1x1, 2x2, 3x3, 2x1, разные direction) ===')
{
  const V20 = packVersion(2, 0, 28)
  const catalog = new Map<string, CatalogEntity>([
    ['sq-1x1', fakeCatalogEntry('sq-1x1', 32, 32)],
    ['sq-2x2', fakeCatalogEntry('sq-2x2', 64, 64)],
    ['sq-3x3', fakeCatalogEntry('sq-3x3', 96, 96)],
    ['belt-2x1', fakeCatalogEntry('belt-2x1', 64, 32)],
  ])

  type Case = { typeId: string; dirRaw: number | undefined; pos: { x: number; y: number }; expect: { x: number; y: number; w: number; h: number } }
  const cases: Case[] = [
    // 1x1 — направление не влияет на размер/координаты вовсе
    { typeId: 'sq-1x1', dirRaw: undefined, pos: { x: 0.5, y: 0.5 }, expect: { x: 0, y: 0, w: 32, h: 32 } },
    { typeId: 'sq-1x1', dirRaw: 4, pos: { x: 0.5, y: 0.5 }, expect: { x: 0, y: 0, w: 32, h: 32 } },
    // 2x2 — симметричен, но тоже проверяем все 4 направления
    { typeId: 'sq-2x2', dirRaw: 0, pos: { x: 2, y: 2 }, expect: { x: 32, y: 32, w: 64, h: 64 } },
    { typeId: 'sq-2x2', dirRaw: 8, pos: { x: 2, y: 2 }, expect: { x: 32, y: 32, w: 64, h: 64 } },
    // 3x3
    { typeId: 'sq-3x3', dirRaw: 0, pos: { x: 3, y: 1.5 }, expect: { x: 48, y: 0, w: 96, h: 96 } },
    { typeId: 'sq-3x3', dirRaw: 4, pos: { x: 3, y: 1.5 }, expect: { x: 48, y: 0, w: 96, h: 96 } },
    // 2x1 (несимметричный, как сплиттер) — направление меняет местами width/height
    { typeId: 'belt-2x1', dirRaw: 0, pos: { x: 1, y: 0.5 }, expect: { x: 0, y: 0, w: 64, h: 32 } }, // север — как объявлено
    { typeId: 'belt-2x1', dirRaw: 8, pos: { x: 1, y: 0.5 }, expect: { x: 0, y: 0, w: 64, h: 32 } }, // юг — размеры те же (0/180 не свапают)
    { typeId: 'belt-2x1', dirRaw: 4, pos: { x: 5, y: 3 }, expect: { x: 144, y: 64, w: 32, h: 64 } }, // восток — свап
    { typeId: 'belt-2x1', dirRaw: 12, pos: { x: 5, y: 3 }, expect: { x: 144, y: 64, w: 32, h: 64 } }, // запад — свап
  ]

  for (const c of cases) {
    const data: BlueprintData = {
      item: 'blueprint',
      version: V20,
      entities: [{ entity_number: 1, name: c.typeId, position: c.pos, direction: c.dirRaw }],
    }
    const result = blueprintDataToEntities(data, 1, catalog)
    assert(result.entities.length === 1, `${c.typeId} dir=${c.dirRaw}: сущность не пропущена`)
    const e = result.entities[0]
    assert(
      e.x === c.expect.x && e.y === c.expect.y && e.width === c.expect.w && e.height === c.expect.h,
      `${c.typeId} dir=${c.dirRaw}: x=${e.x},y=${e.y},w=${e.width},h=${e.height} (ожидали x=${c.expect.x},y=${c.expect.y},w=${c.expect.w},h=${c.expect.h})`,
    )
  }

  // Полный круг: импорт -> экспорт -> импорт снова восстанавливает те же
  // размеры/направление/взаимное расположение (экспорт нормализует
  // позицию к (0,0), поэтому сравниваем размеры/направление и ОТНОСИТЕЛЬНОЕ
  // расположение двух сущностей, а не абсолютные координаты).
  const twoEntities: BlueprintData = {
    item: 'blueprint',
    version: V20,
    entities: [
      { entity_number: 1, name: 'belt-2x1', position: { x: 10, y: 10 }, direction: 4 },
      { entity_number: 2, name: 'sq-1x1', position: { x: 12, y: 11 } },
    ],
  }
  const imported = blueprintDataToEntities(twoEntities, 1, catalog)
  const relDx = imported.entities[1].x - imported.entities[0].x
  const relDy = imported.entities[1].y - imported.entities[0].y

  const { data: exported } = entitiesToBlueprintData(imported.entities, { label: 'rt', catalogByTypeId: catalog })
  const reimported = blueprintDataToEntities(exported, 1, catalog)
  const relDx2 = reimported.entities[1].x - reimported.entities[0].x
  const relDy2 = reimported.entities[1].y - reimported.entities[0].y

  assert(relDx === relDx2 && relDy === relDy2, 'импорт -> экспорт -> импорт: взаимное расположение сохранилось')
  assert(
    reimported.entities[0].width === imported.entities[0].width &&
      reimported.entities[0].height === imported.entities[0].height &&
      reimported.entities[0].direction === imported.entities[0].direction,
    'импорт -> экспорт -> импорт: размер/direction сохранились (belt-2x1 east)',
  )
}

console.log('=== 5. Модули (1.1 словарь и 2.0 массив -> всегда 2.0 на экспорте) ===')
{
  const catalog = new Map<string, CatalogEntity>([['asm', fakeCatalogEntry('asm', 96, 96)]])
  const V11 = packVersion(1, 1, 110)

  const data11: BlueprintData = {
    item: 'blueprint',
    version: V11,
    entities: [
      {
        entity_number: 1,
        name: 'asm',
        position: { x: 1.5, y: 1.5 },
        items: { 'productivity-module-2': 2 },
      },
    ],
  }
  const imported = blueprintDataToEntities(data11, 1, catalog)
  assert((imported.entities[0].modules?.length ?? 0) === 1, '1.1 словарь модулей распознан (1 стек)')
  assert(imported.entities[0].modules?.[0]?.name === 'productivity-module-2', 'имя модуля сохранено')
  assert(imported.entities[0].modules?.[0]?.count === 2, 'количество модуля сохранено (count=2)')

  const { data: exported } = entitiesToBlueprintData(imported.entities, { label: 'x', catalogByTypeId: catalog })
  const exportedItems = exported.entities?.[0]?.items
  assert(Array.isArray(exportedItems), 'на экспорте items — массив (формат 2.0), даже если импортировали из 1.1')
}

console.log(`\n=== Итого: ${passed} OK, ${failed} FAIL ===`)
if (failed > 0) process.exit(1)
