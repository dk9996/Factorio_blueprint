interface Props {
  icons: string[] // от 1 до 4 путей к иконкам
  size?: number
}

/**
 * Превью чертежа как в Factorio:
 * 1 иконка — по центру крупно
 * 2 иконки — две по диагонали
 * 3-4 иконки — сетка 2×2
 */
export function BlueprintThumb({ icons, size = 32 }: Props) {
  const shown = icons.slice(0, 4)

  return (
    <div
      className="bp-thumb"
      style={{ width: size, height: size }}
    >
      {shown.map((src, i) => (
        <img
          key={i}
          src={src}
          alt=""
          className={`bp-thumb-icon bp-thumb-icon--${shown.length}-${i}`}
        />
      ))}
    </div>
  )
}