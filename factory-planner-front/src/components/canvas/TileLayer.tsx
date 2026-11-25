import { useEffect, useRef } from 'react'
import { useCanvasStore } from '../../store/canvasStore'
import { useEntityCatalogStore } from '../../store/entityCatalogStore'
import { useUiStore } from '../../store/uiStore'
import { useViewportStore } from '../../store/viewportStore'
import { parseTileKey, pickTileVariant, TILE_GRID, type TileDef } from '../../lib/tiles'

// Слой плиток — ОДИН <canvas> под сущностями (не узел на плитку: их могут
// быть тысячи). Рисуются только ячейки в видимой области; вариант
// текстуры выбирается детерминированно по хэшу (x,y) (lib/tiles.ts), так что
// при перерисовке ничего не мерцает. Масштаб/пан — те же, что у остальных
// объектов (viewportStore). В режиме «квадраты с иконкой» (useRealSprites
// выключен) или пока текстура не загружена/не извлечена — однотонная
// заливка mapColor. Имя плитки, которого нет в каталоге профиля, рисуется
// серой заглушкой с подписью (данные при этом не теряются).

const imageCache = new Map<string, HTMLImageElement>()

function getImage(url: string, onLoad: () => void): HTMLImageElement | null {
  let img = imageCache.get(url)
  if (!img) {
    img = new Image()
    img.onload = onLoad
    img.src = url
    imageCache.set(url, img)
  }
  return img.complete && img.naturalWidth > 0 ? img : null
}

interface Props {
  width: number
  height: number
}

export function TileLayer({ width, height }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const tiles = useCanvasStore((s) => s.tiles)
  const catalogTiles = useEntityCatalogStore((s) => s.tiles)
  const offsetX = useViewportStore((s) => s.offsetX)
  const offsetY = useViewportStore((s) => s.offsetY)
  const scale = useViewportStore((s) => s.scale)
  const realSprites = useUiStore((s) => s.useRealSprites)
  const show = useUiStore((s) => s.showTileLayer)
  const selectedKeys = useUiStore((s) => s.selectedTileKeys)
  const rafRef = useRef<number | null>(null)
  const drawRef = useRef<() => void>(() => {})

  drawRef.current = () => {
    const canvas = canvasRef.current
    if (!canvas) return
    const dpr = window.devicePixelRatio || 1
    const w = Math.max(1, Math.round(width * dpr))
    const h = Math.max(1, Math.round(height * dpr))
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w
      canvas.height = h
    }
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.setTransform(1, 0, 0, 1, 0, 0)
    ctx.clearRect(0, 0, w, h)
    if (!show) return

    const defs = new Map<string, TileDef>(catalogTiles.map((t) => [t.name, t]))
    const cell = TILE_GRID * scale
    // видимая область в ячейках
    const x0 = Math.floor(-offsetX / cell)
    const y0 = Math.floor(-offsetY / cell)
    const x1 = Math.ceil((width - offsetX) / cell)
    const y1 = Math.ceil((height - offsetY) / cell)

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    // при сильном уменьшении (ячейка < 1px) без сглаживания и без подписей
    ctx.imageSmoothingEnabled = scale < 1 ? true : false
    const gridColor = getComputedStyle(document.documentElement).getPropertyValue('--line-soft').trim() || 'rgba(255,255,255,0.08)'

    const keys = Object.keys(tiles)
    // для очень больших карт быстрее перебирать видимые ячейки, для
    // маленьких — сами плитки; выбираем меньшее
    const visibleCount = (x1 - x0 + 1) * (y1 - y0 + 1)
    const drawCell = (x: number, y: number, name: string) => {
      const px = Math.floor(offsetX + x * cell)
      const py = Math.floor(offsetY + y * cell)
      const size = Math.ceil(cell) + 1 // +1 — без щелей между ячейками при дробном масштабе
      const def = defs.get(name)
      if (!def) {
        ctx.fillStyle = '#4a4a4a'
        ctx.fillRect(px, py, size, size)
        if (cell >= 24) {
          ctx.fillStyle = '#d0d0d0'
          ctx.font = `${Math.max(8, Math.floor(cell / 4))}px sans-serif`
          ctx.fillText(name.slice(0, 8), px + 2, py + cell / 2, size - 4)
        }
      } else {
        let drawn = false
        if (realSprites && def.textureVariants) {
          const pick = pickTileVariant(def.textureVariants, x, y)
          const img = getImage(pick.url, () => scheduleDraw())
          if (img) {
            ctx.drawImage(
              img,
              pick.cellX * TILE_GRID, pick.cellY * TILE_GRID, TILE_GRID, TILE_GRID,
              px, py, size, size,
            )
            drawn = true
          }
        }
        if (!drawn) {
          ctx.fillStyle = def.mapColor
          ctx.fillRect(px, py, size, size)
        }
      }
      // линия сетки поверх плитки (сетка холста — фон под этим слоем)
      if (cell >= 6) {
        ctx.fillStyle = gridColor
        ctx.fillRect(px, py, size, 1)
        ctx.fillRect(px, py, 1, size)
      }
    }

    // подсветка выделенных плиток (Ctrl+рамка в режиме выделения)
    const highlightSelected = () => {
      if (selectedKeys.size === 0) return
      for (const key of selectedKeys) {
        const [x, y] = parseTileKey(key)
        if (x < x0 || x > x1 || y < y0 || y > y1) continue
        const px = Math.floor(offsetX + x * cell)
        const py = Math.floor(offsetY + y * cell)
        const size = Math.ceil(cell)
        ctx.fillStyle = 'rgba(95,209,138,0.38)'
        ctx.fillRect(px, py, size, size)
        ctx.strokeStyle = '#5fd18a'
        ctx.lineWidth = 1
        ctx.strokeRect(px + 0.5, py + 0.5, size - 1, size - 1)
      }
    }

    if (keys.length <= visibleCount) {
      for (const key of keys) {
        const [x, y] = parseTileKey(key)
        if (x < x0 || x > x1 || y < y0 || y > y1) continue
        drawCell(x, y, tiles[key])
      }
    } else {
      for (let y = y0; y <= y1; y++) {
        for (let x = x0; x <= x1; x++) {
          const name = tiles[`${x},${y}`]
          if (name) drawCell(x, y, name)
        }
      }
    }
    highlightSelected()
  }

  // rAF склеивает перерисовки в один кадр; таймер — запасной путь на случай,
  // когда вкладка в фоне и браузер не вызывает rAF (тогда слой всё равно
  // обновится, а не останется пустым до возврата на вкладку).
  const timerRef = useRef<number | null>(null)
  function scheduleDraw() {
    if (rafRef.current !== null) return
    const run = () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current)
      if (timerRef.current !== null) clearTimeout(timerRef.current)
      rafRef.current = null
      timerRef.current = null
      drawRef.current()
    }
    rafRef.current = requestAnimationFrame(run)
    timerRef.current = window.setTimeout(run, 80)
  }

  useEffect(() => {
    scheduleDraw()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tiles, catalogTiles, offsetX, offsetY, scale, realSprites, show, width, height, selectedKeys])

  useEffect(() => () => {
    // refs обнуляем: в StrictMode (dev) эффект монтируется дважды, и «залипший»
    // id отменённого кадра навсегда заблокировал бы scheduleDraw
    if (rafRef.current !== null) cancelAnimationFrame(rafRef.current)
    if (timerRef.current !== null) clearTimeout(timerRef.current)
    rafRef.current = null
    timerRef.current = null
  }, [])

  return <canvas ref={canvasRef} className="tile-layer" style={{ width, height }} />
}
