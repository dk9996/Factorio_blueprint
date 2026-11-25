// Плитки (tiles) — слой под сущностями. Модель: разреженная карта
// "x,y" -> имя плитки; x/y — целые координаты ячейки в тайлах (ячейка
// занимает [x, x+1) × [y, y+1) тайлов, то есть пиксели x*32..x*32+32 —
// ровно та же система, что у PlacedEntity.x/y / GRID).
// Без импортов из стор/React — файл запускается и тестами в Node.

export const TILE_GRID = 32

export type TileMap = Record<string, string>

export interface TileTextureVariants {
  // 'main' — каждый файл один тайл (cols=rows=1), вариант выбирается по
  // хэшу (x,y); 'bg' — каждый файл cols×rows тайлов (у бетона 8×8), вариант
  // выбирается по хэшу блока (x div cols, y div rows), а клетка внутри
  // файла — по (x mod cols, y mod rows): так игра "вшивает" бетон.
  mode: 'main' | 'bg'
  cols: number
  rows: number
  urls: string[]
}

export interface TileDef {
  name: string
  localizedName: string
  icon: string | null
  item: string
  // CSS-цвет '#rrggbb' (map_color) — однотонная заливка вместо текстуры
  mapColor: string
  category: string
  textureVariants: TileTextureVariants | null
}

export function tileKey(x: number, y: number): string {
  return `${x},${y}`
}

export function parseTileKey(key: string): [number, number] {
  const i = key.indexOf(',')
  return [Number(key.slice(0, i)), Number(key.slice(i + 1))]
}

// Целочисленный хэш (x,y) -> uint32: одинаков при каждой перерисовке, чтобы
// вариант текстуры у плитки не "мерцал".
export function tileHash(x: number, y: number): number {
  let h = (Math.imul(x | 0, 0x1f1f1f1f) ^ Math.imul(y | 0, 0x2c1b3c6d)) >>> 0
  h = Math.imul(h ^ (h >>> 15), 0x85ebca6b) >>> 0
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35) >>> 0
  return (h ^ (h >>> 16)) >>> 0
}

export interface TileVariantPick {
  url: string
  // клетка внутри файла варианта (в тайлах)
  cellX: number
  cellY: number
}

export function pickTileVariant(tv: TileTextureVariants, x: number, y: number): TileVariantPick {
  const mod = (a: number, n: number) => ((a % n) + n) % n
  if (tv.mode === 'bg') {
    const bx = Math.floor(x / tv.cols)
    const by = Math.floor(y / tv.rows)
    const idx = tileHash(bx, by) % tv.urls.length
    return { url: tv.urls[idx], cellX: mod(x, tv.cols), cellY: mod(y, tv.rows) }
  }
  return { url: tv.urls[tileHash(x, y) % tv.urls.length], cellX: 0, cellY: 0 }
}

// Ячейки на отрезке между двумя ячейками включительно (Брезенхэм) — штрих
// кисти не должен давать пропусков при быстром движении мыши.
export function cellsOnLine(x0: number, y0: number, x1: number, y1: number): [number, number][] {
  const cells: [number, number][] = []
  const dx = Math.abs(x1 - x0)
  const dy = Math.abs(y1 - y0)
  const sx = x0 < x1 ? 1 : -1
  const sy = y0 < y1 ? 1 : -1
  let err = dx - dy
  let x = x0
  let y = y0
  for (;;) {
    cells.push([x, y])
    if (x === x1 && y === y1) break
    const e2 = 2 * err
    if (e2 > -dy) { err -= dy; x += sx }
    if (e2 < dx) { err += dx; y += sy }
  }
  return cells
}

// Все ячейки прямоугольника между двумя угловыми ячейками (включительно).
export function cellsInRect(x0: number, y0: number, x1: number, y1: number): [number, number][] {
  const cells: [number, number][] = []
  for (let y = Math.min(y0, y1); y <= Math.max(y0, y1); y++) {
    for (let x = Math.min(x0, x1); x <= Math.max(x0, x1); x++) cells.push([x, y])
  }
  return cells
}

// Ячейка под мировой точкой (в пикселях холста).
export function worldToCell(worldPx: number): number {
  return Math.floor(worldPx / TILE_GRID)
}

export function hasTiles(tiles: TileMap | undefined | null): boolean {
  return !!tiles && Object.keys(tiles).length > 0
}
