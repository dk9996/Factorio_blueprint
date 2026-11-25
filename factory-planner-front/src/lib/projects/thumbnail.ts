import type { PlacedEntity } from '../../store/canvasStore'
import { resolveAssetUrl } from '../api/client'

const THUMB_WIDTH = 320
const THUMB_HEIGHT = 180
const BG_COLOR = '#232220'
const RECT_COLOR = '#e8890c'
const PADDING = 12
// Больше смысла грузить иконки нет — на таком разрешении они всё равно
// превращаются в пиксельное месиво, а время генерации растёт линейно.
const MAX_ICONS = 60
const ICON_LOAD_TIMEOUT_MS = 800

function loadIcon(src: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const img = new Image()
    // Иконки грузятся с другого origin (бэкенд, порт 8000, см.
    // resolveAssetUrl) — без crossOrigin канвас "протухает" (tainted) после
    // drawImage и canvas.toDataURL() бросает SecurityError. Бэкенд уже
    // шлёт Access-Control-Allow-Origin на статику (общий CORSMiddleware в
    // main.py), так что CORS-режим здесь просто включает его использование.
    img.crossOrigin = 'anonymous'
    const timer = setTimeout(() => resolve(null), ICON_LOAD_TIMEOUT_MS)
    img.onload = () => {
      clearTimeout(timer)
      resolve(img)
    }
    img.onerror = () => {
      clearTimeout(timer)
      resolve(null)
    }
    img.src = src
  })
}

/**
 * Упрощённое превью проекта — прямоугольники по позициям сущностей на
 * тёмном фоне, по возможности с иконкой поверх (best-effort, с таймаутом,
 * чтобы медленная/недоступная сеть не блокировала автосохранение).
 * Не зависит от режима рендера канваса (реальные спрайты/простой квадрат) —
 * своя отдельная упрощённая отрисовка, см. задачу.
 */
export async function generateThumbnail(entities: PlacedEntity[]): Promise<string> {
  const canvas = document.createElement('canvas')
  canvas.width = THUMB_WIDTH
  canvas.height = THUMB_HEIGHT
  const ctx = canvas.getContext('2d')
  if (!ctx) return ''

  ctx.fillStyle = BG_COLOR
  ctx.fillRect(0, 0, THUMB_WIDTH, THUMB_HEIGHT)

  if (entities.length === 0) return canvas.toDataURL('image/png')

  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  for (const e of entities) {
    minX = Math.min(minX, e.x)
    minY = Math.min(minY, e.y)
    maxX = Math.max(maxX, e.x + e.width)
    maxY = Math.max(maxY, e.y + e.height)
  }
  const spanX = Math.max(maxX - minX, 1)
  const spanY = Math.max(maxY - minY, 1)
  const availW = THUMB_WIDTH - PADDING * 2
  const availH = THUMB_HEIGHT - PADDING * 2
  const scale = Math.min(availW / spanX, availH / spanY)
  const offsetX = PADDING + (availW - spanX * scale) / 2
  const offsetY = PADDING + (availH - spanY * scale) / 2

  function toCanvas(e: PlacedEntity) {
    return {
      x: offsetX + (e.x - minX) * scale,
      y: offsetY + (e.y - minY) * scale,
      w: Math.max(e.width * scale, 1.5),
      h: Math.max(e.height * scale, 1.5),
    }
  }

  ctx.fillStyle = RECT_COLOR
  for (const e of entities) {
    const r = toCanvas(e)
    ctx.fillRect(r.x, r.y, r.w, r.h)
  }

  const withIcons = entities.filter((e) => !!e.icon).slice(0, MAX_ICONS)
  const icons = await Promise.all(withIcons.map((e) => loadIcon(resolveAssetUrl(e.icon))))
  withIcons.forEach((e, i) => {
    const img = icons[i]
    if (!img) return
    const r = toCanvas(e)
    const size = Math.min(r.w, r.h) * 0.8
    if (size < 3) return
    ctx.drawImage(img, r.x + (r.w - size) / 2, r.y + (r.h - size) / 2, size, size)
  })

  try {
    return canvas.toDataURL('image/png')
  } catch {
    // На случай, если какая-то иконка всё же протухла канвас (например,
    // другой origin без CORS в будущем) — превью не критично, не должно
    // валить автосохранение/импорт целиком.
    return ''
  }
}
