interface Props {
  src: string
  size?: number
  alt?: string
}

/**
 * Иконки Factorio часто хранятся как mipmap-полоска:
 * несколько уменьшающихся копий одного спрайта подряд по горизонтали.
 * Нам нужен только первый (самый большой) квадрат — 64×64 обычно.
 * Берём его через background-position, а не растягиваем весь файл.
 */
export function EntityIcon({ src, size = 32, alt = '' }: Props) {
  return (
    <div
      role="img"
      aria-label={alt}
      style={{
        width: size,
        height: size,
        backgroundImage: `url(${src})`,
        backgroundPosition: '0 0',
        backgroundSize: `${size * 2}px ${size}px`, // подбирается под реальный размер mip-полоски
        backgroundRepeat: 'no-repeat',
        flexShrink: 0,
      }}
    />
  )
}