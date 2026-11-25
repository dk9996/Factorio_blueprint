import type { CSSProperties } from 'react'
import { useEntityCatalogStore } from '../../store/entityCatalogStore'
import { isUpgradedQuality } from '../../lib/quality'

interface Props {
  src: string
  alt?: string
  // Качество предмета/сущности/модуля; выше normal — цветной фон плитки
  // (цвет из прототипа quality). У normal/без качества и в профилях без
  // качества — обычный вид. Точки/значки качества на иконке НЕ рисуем.
  quality?: string | null
  className?: string
  style?: CSSProperties
}

function hexToRgba(hex: string, alpha: number): string {
  const m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex)
  if (!m) return hex
  return `rgba(${parseInt(m[1], 16)}, ${parseInt(m[2], 16)}, ${parseInt(m[3], 16)}, ${alpha})`
}

// Единая иконка предмета с подсветкой качества — используется везде, где
// показывается иконка с возможным качеством (палитра, хотбар, слоты
// модулей, панели сущностей, баланс), чтобы фон был одинаковым.
export function ItemIcon({ src, alt = '', quality, className, style }: Props) {
  const color = useEntityCatalogStore((s) =>
    isUpgradedQuality(quality) ? s.qualities.find((q) => q.name === quality)?.color : undefined,
  )
  return (
    <span
      className={`item-icon${color ? ' item-icon-quality' : ''}${className ? ` ${className}` : ''}`}
      style={color ? { ...style, background: hexToRgba(color, 0.45) } : style}
    >
      <img src={src} alt={alt} />
    </span>
  )
}
