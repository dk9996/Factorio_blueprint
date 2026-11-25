// Тесты чистых функций lib/tiles.ts — запускать из factory-planner-front:
//   node src/lib/tilesSelfTest.ts
/// <reference types="node" />
import { readFileSync } from 'node:fs'
import { cellsInRect, cellsOnLine, parseTileKey, pickTileVariant, tileHash, tileKey, worldToCell } from './tiles.ts'

let failed = 0
let passed = 0
function assert(cond: boolean, msg: string) {
  if (cond) { passed++; console.log(`  OK  ${msg}`) } else { failed++; console.log(`FAIL  ${msg}`) }
}

console.log('=== Ключи и координаты ===')
assert(tileKey(-3, 7) === '-3,7' && parseTileKey('-3,7').join() === '-3,7', 'tileKey/parseTileKey круглые, отрицательные координаты')
assert(worldToCell(0) === 0 && worldToCell(31.9) === 0 && worldToCell(32) === 1 && worldToCell(-0.1) === -1 && worldToCell(-32) === -1 && worldToCell(-32.1) === -2, 'worldToCell: ячейка = floor(px/32) (в т.ч. отрицательные)')

console.log('=== Детерминированный вариант текстуры ===')
{
  const same = Array.from({ length: 50 }, (_, i) => tileHash(i, -i)).every((h, i) => h === tileHash(i, -i))
  assert(same, 'хэш (x,y) стабилен между вызовами')
  const counts = new Array(8).fill(0)
  for (let x = 0; x < 100; x++) for (let y = 0; y < 100; y++) counts[tileHash(x, y) % 8]++
  assert(counts.every((c) => c > 1000 && c < 1500), `варианты распределены равномерно: ${counts.join(',')}`)
  const tv = { mode: 'main' as const, cols: 1, rows: 1, urls: ['a', 'b', 'c', 'd'] }
  assert(pickTileVariant(tv, 5, 6).url === pickTileVariant(tv, 5, 6).url, 'main: один и тот же вариант для одной ячейки')
  const bg = { mode: 'bg' as const, cols: 8, rows: 8, urls: ['v0', 'v1', 'v2'] }
  const a = pickTileVariant(bg, 9, 17)
  assert(a.cellX === 1 && a.cellY === 1, 'bg: клетка внутри файла = (x mod 8, y mod 8)')
  const b = pickTileVariant(bg, -1, -1)
  assert(b.cellX === 7 && b.cellY === 7, 'bg: отрицательные координаты — корректный mod')
  assert(pickTileVariant(bg, 8, 8).url === pickTileVariant(bg, 15, 15).url, 'bg: весь блок 8x8 берёт один вариант')
}

console.log('=== Штрих кисти: без пропусков ===')
{
  const line = cellsOnLine(0, 0, 37, 11)
  let gaps = 0
  for (let i = 1; i < line.length; i++) {
    if (Math.abs(line[i][0] - line[i - 1][0]) > 1 || Math.abs(line[i][1] - line[i - 1][1]) > 1) gaps++
  }
  assert(gaps === 0 && line[0].join() === '0,0' && line[line.length - 1].join() === '37,11', 'cellsOnLine: соседние ячейки соприкасаются, концы включены')
  assert(cellsOnLine(5, 5, 5, 5).length === 1, 'cellsOnLine: одна ячейка')
  assert(cellsOnLine(10, 2, 0, 2).length === 11, 'cellsOnLine: влево, 11 ячеек')
  const rect = cellsInRect(3, 4, 0, 1)
  assert(rect.length === 16 && new Set(rect.map((c) => c.join())).size === 16, 'cellsInRect: 4x4 = 16 уникальных ячеек (углы в любом порядке)')
  assert(cellsInRect(0, 0, 99, 99).length === 10000, 'cellsInRect: 100x100 = 10000')
}

console.log('=== Каталог плиток профилей (реальные данные) ===')
{
  const base = new URL('../../../factory-planner-backend/content/', import.meta.url)
  const read = (p: string) => JSON.parse(readFileSync(new URL(p, base), 'utf-8'))
  const tiles = read('profiles/base/tiles.json') as { name: string; icon: string; item: string; mapColor: string }[]
  const names = tiles.map((t) => t.name)
  for (const n of ['stone-path', 'concrete', 'refined-concrete', 'hazard-concrete-left', 'hazard-concrete-right', 'refined-hazard-concrete-left', 'refined-hazard-concrete-right'])
    assert(names.includes(n), `base: плитка ${n} есть`)
  assert(tiles.every((t) => /^#[0-9a-f]{6}$/.test(t.mapColor) && !!t.icon && !!t.item), 'base: у каждой плитки есть иконка предмета, предмет и mapColor')
  assert(!names.some((n) => n.startsWith('frozen-')), 'frozen-* (автоподмена Акилона) в палитру не попадают')
  assert(!names.includes('water') && !names.includes('grass-1'), 'вода и естественный ландшафт не попадают')
  const sprites = read('tile_sprites.json') as Record<string, { mode: string; count: number }>
  assert(tiles.every((t) => !!sprites[t.name]), 'у всех плиток base извлечены текстуры')
}

console.log(`\n=== Итого: ${passed} OK, ${failed} FAIL ===`)
if (failed > 0) process.exit(1)
