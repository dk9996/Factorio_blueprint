// Небольшой самостоятельный тестовый скрипт (в проекте нет vitest/jest) —
// запускать из factory-planner-front:
//   node src/lib/blueprint/selfTest.ts
// Node 22.6+/24+ умеет исполнять .ts напрямую (type-stripping), поэтому
// внутри этого файла и всех модулей, которые он реально исполняет,
// используются явные ".ts"-расширения в относительных импортах
// (tsconfig.app.json: allowImportingTsExtensions — это не ломает Vite).
// Этот файл — единственный, которому реально нужен глобальный `process`
// (он не попадает в браузерный Vite-бандл, только запускается напрямую
// Node'ом) — ссылка на типы Node ограничена этим файлом, а не добавлена
// в tsconfig.app.json целиком, чтобы не протащить node-глобалы в код
// браузера.
/// <reference types="node" />
import { encodeBlueprintString } from './encode.ts'
import { decodeBlueprintString } from './decode.ts'
import { decodeDirection, encodeDirection } from './direction.ts'
import { packVersion, DEFAULT_EXPORT_VERSION } from './version.ts'
import { blueprintDataToEntities, entitiesToBlueprintData } from './convert.ts'
import type { BlueprintData } from '../../types/blueprint.ts'
import type { CatalogEntity } from '../../store/entityCatalogStore.ts'
import type { EntityDirection } from '../../store/canvasStore.ts'
import { toSlot } from '../modules.ts'

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
    allowedEffects: [],
    allowedModuleCategories: null,
    connectors: null,
    circuitWireMaxDistance: null,
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

console.log('=== 5. Модули (слоты, 1.1/2.0 -> всегда 2.0 на экспорте, остальные items не теряются) ===')
{
  const catalog = new Map<string, CatalogEntity>([['asm', fakeCatalogEntry('asm', 96, 96, { moduleSlots: 4, type: 'assembling-machine' })]])
  const V11 = packVersion(1, 1, 110)
  const V20 = packVersion(2, 0, 28)

  // 1.1: словарь имя->количество; 2 модуля раскладываются по двум слотам,
  // уголь (не модуль) остаётся как есть.
  const data11: BlueprintData = {
    item: 'blueprint',
    version: V11,
    entities: [
      { entity_number: 1, name: 'asm', position: { x: 1.5, y: 1.5 }, items: { 'productivity-module-2': 2, coal: 5 } },
    ],
  }
  const imported = blueprintDataToEntities(data11, 1, catalog)
  assert(deepEqual(imported.entities[0].modules, [{ name: 'productivity-module-2' }, { name: 'productivity-module-2' }, null, null]), '1.1: модули разложены по слотам')
  assert(Array.isArray(imported.entities[0].extra?.items) && (imported.entities[0].extra?.items as unknown[]).length === 1, '1.1: топливо (не модуль) сохранено в extra.items')

  const { data: exported } = entitiesToBlueprintData(imported.entities, { label: 'x', catalogByTypeId: catalog })
  const exportedItems = exported.entities?.[0]?.items as { id: { name: string }; items: { in_inventory: { inventory: unknown; stack: number }[] } }[]
  assert(Array.isArray(exportedItems), 'на экспорте items — массив (формат 2.0), даже если импортировали из 1.1')
  const prod = exportedItems.find((i) => i.id.name === 'productivity-module-2')
  assert(deepEqual(prod?.items.in_inventory.map((x) => x.stack), [0, 1]), 'модули экспортированы со stack = индекс слота')
  assert(prod?.items.in_inventory[0].inventory === 4, 'inventory сборщика на экспорте — 4 (crafter_modules)')
  assert(exportedItems.some((i) => i.id.name === 'coal'), 'топливо не потеряно при экспорте')

  // 2.0: числовой inventory, качество, модуль вне слотов, топливо
  const data20: BlueprintData = {
    item: 'blueprint',
    version: V20,
    entities: [
      {
        entity_number: 1,
        name: 'asm',
        position: { x: 1.5, y: 1.5 },
        items: [
          { id: { name: 'speed-module-3', quality: 'rare' }, items: { in_inventory: [{ inventory: 4, stack: 1 }, { inventory: 4, stack: 3 }] } },
          { id: { name: 'efficiency-module' }, items: { in_inventory: [{ inventory: 4, stack: 9 }] } },
          { id: { name: 'coal' }, items: { in_inventory: [{ inventory: 1, stack: 0, count: 5 }] } },
        ],
      },
    ],
  }
  const imp20 = blueprintDataToEntities(data20, 1, catalog)
  const e20 = imp20.entities[0]
  assert(deepEqual(e20.modules, [null, { name: 'speed-module-3', quality: 'rare' }, null, { name: 'speed-module-3', quality: 'rare' }]), '2.0: stack -> индекс слота (+ качество в слоте)')
  assert(e20.moduleExtra?.inventory === 4, '2.0: числовой inventory сохранён как есть')
  const rest20 = e20.extra?.items as { id: { name: string } }[]
  assert(rest20?.length === 2 && rest20.some((i) => i.id.name === 'coal') && rest20.some((i) => i.id.name === 'efficiency-module'), '2.0: топливо и модуль вне слотов сохранены')
  const out20 = entitiesToBlueprintData(imp20.entities, { label: 'x', catalogByTypeId: catalog, includeQuality: true }).data.entities?.[0]?.items as { id: { name: string; quality?: string }; items: { in_inventory: { inventory: unknown; stack: number }[] } }[]
  const speed = out20.find((i) => i.id.name === 'speed-module-3')
  assert(speed?.id.quality === 'rare' && deepEqual(speed?.items.in_inventory, [{ inventory: 4, stack: 1 }, { inventory: 4, stack: 3 }]), '2.0: round-trip модулей без потерь')
  assert(out20.length === 3, '2.0: после round-trip те же 3 записи items')
  const again = blueprintDataToEntities(entitiesToBlueprintData(imp20.entities, { label: 'x', catalogByTypeId: catalog, includeQuality: true }).data, 1, catalog)
  assert(deepEqual(again.entities[0].modules, e20.modules), 'импорт -> экспорт -> импорт: модули те же')

  // сущность без слотов: модули не теряются, уходят в extra.items
  const noSlots = new Map<string, CatalogEntity>([['asm', fakeCatalogEntry('asm', 96, 96)]])
  const impNo = blueprintDataToEntities(data20, 1, noSlots)
  assert(impNo.entities[0].modules === undefined && (impNo.entities[0].extra?.items as unknown[]).length === 3, 'нет слотов: всё сохранено в extra.items')
}

console.log('=== 6. Качество (quality): entity.quality, recipe_quality, items id.quality ===')
{
  const catalog = new Map<string, CatalogEntity>([
    ['asm', fakeCatalogEntry('asm', 96, 96, { moduleSlots: 2, type: 'assembling-machine' })],
    ['chest', fakeCatalogEntry('chest', 32, 32, { type: 'container' })],
  ])
  const data: BlueprintData = {
    item: 'blueprint',
    version: packVersion(2, 0, 28),
    entities: [
      {
        entity_number: 1, name: 'asm', position: { x: 1.5, y: 1.5 },
        recipe: 'iron-gear-wheel', quality: 'rare', recipe_quality: 'epic', future_field: 42,
        items: [{ id: { name: 'speed-module-3', quality: 'legendary' }, items: { in_inventory: [{ inventory: 4, stack: 0 }] } }],
      },
      { entity_number: 2, name: 'chest', position: { x: 4.5, y: 0.5 }, quality: 'uncommon' },
      { entity_number: 3, name: 'chest', position: { x: 5.5, y: 0.5 }, quality: 'normal' },
    ],
  }
  const imp = blueprintDataToEntities(data, 1, catalog)
  const [asm, chest, normalChest] = imp.entities
  // 1) entity.quality
  assert(asm.quality === 'rare' && chest.quality === 'uncommon', 'entity: quality прочитан в PlacedEntity.quality')
  assert(normalChest.quality === undefined, 'entity: quality=normal -> поле отсутствует в модели')
  assert(asm.extra?.quality === undefined && asm.extra?.future_field === 42, 'entity: quality не дублируется в extra, неизвестные поля сохранены')
  // 2) recipe_quality
  assert(asm.recipeQuality === 'epic', 'recipe_quality прочитан в PlacedEntity.recipeQuality')
  // 3) items id.quality
  assert(deepEqual(asm.modules?.[0], { name: 'speed-module-3', quality: 'legendary' }), 'items: id.quality прочитан в слот модуля')

  const out = entitiesToBlueprintData(imp.entities, { label: 'q', catalogByTypeId: catalog, includeQuality: true }).data.entities!
  const oAsm = out.find((e) => e.name === 'asm')!
  const chests = out.filter((e) => e.name === 'chest')
  assert(oAsm.quality === 'rare', 'экспорт entity: quality=rare записан')
  assert(chests.some((c) => c.quality === 'uncommon') && chests.some((c) => c.quality === undefined && !('quality' in c)), 'экспорт entity: у normal поле quality отсутствует')
  assert(oAsm.recipe_quality === 'epic', 'экспорт: recipe_quality=epic записан')
  const oItems = oAsm.items as { id: { name: string; quality?: string } }[]
  assert(oItems[0].id.quality === 'legendary', 'экспорт items: id.quality=legendary записан')
  assert(oAsm.future_field === 42, 'экспорт: неизвестное поле future_field не потеряно')
  const round = blueprintDataToEntities(entitiesToBlueprintData(imp.entities, { label: 'q', catalogByTypeId: catalog, includeQuality: true }).data, 1, catalog)
  assert(round.entities[0].quality === 'rare' && round.entities[0].recipeQuality === 'epic' && (toSlot(round.entities[0].modules?.[0])?.quality === 'legendary'), 'импорт -> экспорт -> импорт: три вида качества сохранились')

  // Профиль без quality: поля качества не пишутся вообще
  const plain = entitiesToBlueprintData(imp.entities, { label: 'q', catalogByTypeId: catalog }).data.entities!
  const pAsm = plain.find((e) => e.name === 'asm')!
  const pItems = pAsm.items as { id: { quality?: string } }[]
  assert(!('quality' in pAsm) && !('recipe_quality' in pAsm) && !('quality' in pItems[0].id), 'без includeQuality: ни quality, ни recipe_quality, ни id.quality не пишутся')
  assert(!plain.some((e) => 'quality' in e), 'без includeQuality: ни у одной сущности нет поля quality')
}

console.log('=== 7. Плитки (tiles): координаты, импорт/экспорт, неизвестные имена ===')
{
  const catalog = new Map<string, CatalogEntity>([['chest', fakeCatalogEntry('chest', 32, 32, { type: 'container' })]])
  const data: BlueprintData = {
    item: 'blueprint',
    version: packVersion(2, 0, 28),
    entities: [{ entity_number: 1, name: 'chest', position: { x: 0.5, y: 0.5 } }],
    tiles: [
      { name: 'concrete', position: { x: 0, y: 0 } },
      { name: 'stone-path', position: { x: -2, y: 3 } },
      { name: 'some-mod-tile', position: { x: 5, y: -1 } },
    ],
  }
  const imp = blueprintDataToEntities(data, 1, catalog)
  assert(Object.keys(imp.tiles).length === 3, 'импорт: прочитаны все 3 плитки')
  assert(imp.tiles['0,0'] === 'concrete' && imp.tiles['-2,3'] === 'stone-path', 'импорт: ключ "x,y" = целые координаты ячейки')
  assert(imp.tiles['5,-1'] === 'some-mod-tile', 'импорт: плитка с неизвестным именем сохранена')
  // согласованность с сущностями: сундук 1x1 в position (0.5,0.5) стоит в пикселях (0,0) = ячейка (0,0)
  assert(imp.entities[0].x === 0 && imp.entities[0].y === 0, 'сущность с центром (0.5,0.5) занимает ячейку (0,0) — ту же, что плитка (0,0)')
  assert(imp.meta.tiles === undefined, 'meta.tiles больше не используется (плитки живут в модели)')

  const exp = entitiesToBlueprintData(imp.entities, { label: 't', catalogByTypeId: catalog, tiles: imp.tiles }).data
  // нормализация: минимум по сущностям И плиткам -> (-2,-1); сдвиг на целое число тайлов
  const expTiles = exp.tiles ?? []
  assert(expTiles.length === 3, 'экспорт: 3 плитки записано')
  assert(expTiles.some((t) => t.name === 'concrete' && t.position.x === 2 && t.position.y === 1), 'экспорт: плитка (0,0) сдвинута на (2,1) вместе с началом координат')
  assert(expTiles.some((t) => t.name === 'some-mod-tile'), 'экспорт: плитка с неизвестным именем не потеряна')
  const ex = exp.entities![0].position
  assert(ex.x === 2.5 && ex.y === 1.5, 'экспорт: сущность сдвинута на то же смещение (2,1) — взаимное положение сохранено')
  const back = blueprintDataToEntities(exp, 1, catalog)
  const dx = back.entities[0].x - imp.entities[0].x
  const dy = back.entities[0].y - imp.entities[0].y
  const shifted = Object.entries(back.tiles).every(([k, v]) => {
    const [x, y] = k.split(',').map(Number)
    return imp.tiles[`${x - dx / 32},${y - dy / 32}`] === v
  })
  assert(Object.keys(back.tiles).length === 3 && shifted, 'импорт -> экспорт -> импорт: те же плитки в том же положении относительно сущности')

  // только плитки, без сущностей
  const onlyTiles = entitiesToBlueprintData([], { label: 't', catalogByTypeId: catalog, tiles: { '3,4': 'concrete' } }).data
  assert(onlyTiles.tiles?.length === 1 && onlyTiles.tiles[0].position.x === 0 && onlyTiles.tiles[0].position.y === 0, 'экспорт только плиток (без сущностей) работает')
  // без tiles в опциях и без meta — поля tiles нет вообще
  const noTiles = entitiesToBlueprintData(imp.entities, { label: 't', catalogByTypeId: catalog }).data
  assert(!('tiles' in noTiles), 'нет слоя плиток — поле tiles не пишется')
}

console.log('=== 8. Схемная сеть: провода и control_behavior четырёх комбинаторов ===')
{
  const mk = (id: string, type: string, w: number, h: number) => [id, fakeCatalogEntry(id, w, h, { type })] as const
  const catalog = new Map<string, CatalogEntity>([
    mk('arithmetic-combinator', 'arithmetic-combinator', 32, 64),
    mk('decider-combinator', 'decider-combinator', 32, 64),
    mk('constant-combinator', 'constant-combinator', 32, 32),
    mk('selector-combinator', 'selector-combinator', 32, 64),
    mk('small-electric-pole', 'electric-pole', 32, 32),
    mk('small-lamp', 'lamp', 32, 32),
  ])
  const arithmetic = {
    arithmetic_conditions: {
      first_signal: { name: 'signal-A', type: 'virtual' }, operation: '+', second_constant: 5,
      output_signal: { name: 'signal-B', type: 'virtual' },
      first_signal_networks: { red: true, green: false }, second_signal_networks: { red: false, green: true },
    },
  }
  const decider = {
    decider_conditions: {
      conditions: [
        { first_signal: { name: 'iron-plate' }, comparator: '>', constant: 100, compare_type: 'or', first_signal_networks: { red: true, green: true } },
        { first_signal: { name: 'copper-plate', quality: 'rare' }, comparator: '<=', second_signal: { name: 'signal-C', type: 'virtual' }, compare_type: 'and' },
      ],
      outputs: [{ signal: { name: 'signal-everything', type: 'virtual' }, copy_count_from_input: true, networks: { red: true, green: false } }, { signal: { name: 'signal-D', type: 'virtual' }, constant: 3 }],
    },
  }
  const constant = {
    sections: { sections: [{ index: 1, filters: [{ index: 1, name: 'iron-plate', quality: 'normal', comparator: '=', count: 50 }, { index: 2, type: 'virtual', name: 'signal-A', count: -3 }], multiplier: 2, active: true }] },
    is_on: false,
  }
  const selector = { operation: 'select', select_max: true, index_signal: { name: 'signal-I', type: 'virtual' }, index_constant: 2, random_update_interval: 30, quality_filter: { quality: 'rare', comparator: '>=' } }
  const bp: BlueprintData = {
    item: 'blueprint', version: packVersion(2, 0, 28),
    entities: [
      { entity_number: 1, name: 'arithmetic-combinator', position: { x: 1, y: 2 }, direction: 4, control_behavior: arithmetic },
      { entity_number: 2, name: 'decider-combinator', position: { x: 3, y: 2 }, direction: 4, control_behavior: decider },
      { entity_number: 3, name: 'constant-combinator', position: { x: 0.5, y: 0.5 }, control_behavior: constant },
      { entity_number: 4, name: 'selector-combinator', position: { x: 5, y: 2 }, direction: 4, control_behavior: selector },
      { entity_number: 5, name: 'small-electric-pole', position: { x: 0.5, y: 4.5 } },
      { entity_number: 6, name: 'small-electric-pole', position: { x: 3.5, y: 4.5 } },
      { entity_number: 7, name: 'small-lamp', position: { x: 6.5, y: 4.5 }, control_behavior: { circuit_enabled: true, circuit_condition: { first_signal: { name: 'signal-A', type: 'virtual' }, comparator: '>', constant: 0 } } },
    ],
    wires: [
      [5, 1, 6, 1], // красный: столб-столб
      [5, 2, 7, 2], // зелёный: столб-лампа
      [1, 5, 2, 3], // красный: выход арифм. -> вход decider
      [3, 2, 1, 4], // зелёный: константа -> вход арифм.
      [5, 5, 6, 5], // медь столбов (pole_copper) — не схемный провод
    ],
  }
  const imp = blueprintDataToEntities(bp, 1, catalog)
  const byName = (n: string) => imp.entities.find((e) => e.typeId === n)!
  assert(imp.wires.length === 4, 'импорт: 4 схемных провода (медь не считается)')
  const red = imp.wires.filter((w) => w.color === 'red').length
  assert(red === 2 && imp.wires.length - red === 2, 'импорт: 2 красных и 2 зелёных')
  const comboWire = imp.wires.find((w) => w.a.connector === 'output' || w.b.connector === 'output')
  assert(!!comboWire && [comboWire.a.connector, comboWire.b.connector].sort().join() === 'input,output', 'импорт: провод комбинатор output -> input распознан')
  assert(imp.meta.wires?.length === 1 && imp.meta.wires[0][1] === 5, 'импорт: медь столбов сохранена в passthrough как есть')
  assert(deepEqual(byName('arithmetic-combinator').controlBehavior, arithmetic), 'импорт: control_behavior арифметического')
  assert(deepEqual(byName('decider-combinator').controlBehavior, decider), 'импорт: control_behavior decider (2 условия + 2 выхода)')
  assert(deepEqual(byName('constant-combinator').controlBehavior, constant), 'импорт: control_behavior constant (секции, множитель, is_on)')
  assert(deepEqual(byName('selector-combinator').controlBehavior, selector), 'импорт: control_behavior selector')
  assert(byName('small-lamp').controlBehavior !== undefined && byName('small-lamp').extra?.control_behavior === undefined, 'импорт: control_behavior лампы сохранён как есть (без окна настройки)')

  const out = entitiesToBlueprintData(imp.entities, { label: 'c', catalogByTypeId: catalog, wires: imp.wires, meta: imp.meta }).data
  const normalize = (ws: number[][]) => ws.map((w) => (w[0] > w[2] || (w[0] === w[2] && w[1] > w[3]) ? [w[2], w[3], w[0], w[1]] : w)).map((w) => w.join()).sort()
  assert(deepEqual(normalize(out.wires as number[][]), normalize(bp.wires as number[][])), 'экспорт: wires совпадают с исходными (включая медь), с точностью до порядка концов')
  const outByName = (n: string) => out.entities!.find((e) => e.name === n)!
  assert(deepEqual(outByName('arithmetic-combinator').control_behavior, arithmetic), 'экспорт: control_behavior арифметического без потерь')
  assert(deepEqual(outByName('decider-combinator').control_behavior, decider), 'экспорт: control_behavior decider без потерь')
  assert(deepEqual(outByName('constant-combinator').control_behavior, constant), 'экспорт: control_behavior constant без потерь')
  assert(deepEqual(outByName('selector-combinator').control_behavior, selector), 'экспорт: control_behavior selector без потерь')
  assert(deepEqual(outByName('small-lamp').control_behavior, bp.entities![6].control_behavior), 'экспорт: control_behavior лампы без потерь')
  const again = blueprintDataToEntities(out, 1, catalog)
  assert(again.wires.length === 4 && deepEqual(again.entities.map((e) => e.controlBehavior), imp.entities.map((e) => e.controlBehavior)), 'импорт -> экспорт -> импорт: провода и настройки те же')
  // подмножество (выделение): внешние провода отбрасываются, внутренние остаются
  const subset = imp.entities.filter((e) => e.typeId.endsWith('pole') || e.typeId === 'small-lamp')
  const sub = entitiesToBlueprintData(subset, { label: 's', catalogByTypeId: catalog, wires: imp.wires }).data
  assert((sub.wires?.length ?? 0) === 2, 'экспорт подмножества: остались только провода между выбранными (2)')
}

console.log(`\n=== Итого: ${passed} OK, ${failed} FAIL ===`)
if (failed > 0) process.exit(1)
