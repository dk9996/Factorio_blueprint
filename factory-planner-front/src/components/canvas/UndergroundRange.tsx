import type { EntityDirection } from '../../store/canvasStore'

interface Props {
  // Мировые px, левый верхний угол клетки сущности (как entity.x/y) —
  // подсказка дальности подземных конвейеров/труб (см.
  // src/lib/underground.ts). Рисуется отдельным слоем канваса (не
  // внутри EntityNode/PlacementGhost) — оверлей, не спрайт.
  x: number
  y: number
  // Куда физически тянется полоса (к партнёру/призраку) — определяет
  // сторону, но НЕ обязательно совпадает с тем, куда должны показывать
  // шевроны (см. chevronDirection).
  direction: EntityDirection | undefined
  // Куда показывают шевроны — логическое направление движения (у
  // конвейеров — их общий entity.direction, одинаковый у обеих частей
  // пары). Если не задано, равно direction (как раньше, для фазы
  // постановки — там якорь всегда сам вход, оба совпадают по
  // построению). Если partner лежит СЗАДИ сущности по её direction,
  // полоса физически тянется назад (direction≠chevronDirection), но
  // шевроны всё равно должны показывать настоящее направление движения,
  // а не "куда физически нарисована полоса" — иначе на связанной паре
  // стрелки выглядят развёрнутыми не в ту сторону.
  chevronDirection?: EntityDirection
  maxDistance: number
}

const GRID = 32

// Рисуем полосу ВСЕГДА в локальных координатах "вперёд = вправо" (это
// соответствует direction=90/восток в конвенции приложения), затем
// поворачиваем весь блок вокруг центра сущности на (direction-90)° —
// так не нужно считать 4 отдельные геометрии для каждого направления.
// Шевроны рисуются с ДОПОЛНИТЕЛЬНЫМ встречным поворотом вокруг своего
// центра на (chevronDirection-direction)°, компенсирующим внешний
// поворот полосы — так их итоговый угол на экране всегда равен
// chevronDirection, независимо от того, в какую сторону физически
// тянется сама полоса.
export function UndergroundRange({ x, y, direction, chevronDirection, maxDistance }: Props) {
  if (maxDistance <= 0) return null

  const centerX = x + GRID / 2
  const centerY = y + GRID / 2
  const bandLength = maxDistance * GRID
  const rotation = (direction ?? 0) - 90
  const chevronExtraRotation = (((chevronDirection ?? direction ?? 0) - (direction ?? 0)) % 360 + 360) % 360
  // Появляется постепенно, "вырастая" от сущности наружу (как в игре),
  // а не всплывает сразу целиком — скорость роста примерно постоянная
  // (длиннее полоса — дольше анимация), не фиксированная длительность.
  const growDuration = Math.min(0.6, Math.max(0.18, maxDistance * 0.05))

  return (
    <div
      className="underground-range"
      style={{
        position: 'absolute',
        left: centerX,
        top: centerY,
        width: 0,
        height: 0,
        transform: `rotate(${rotation}deg)`,
        pointerEvents: 'none',
      }}
    >
      <svg
        className="underground-range-grow"
        width={bandLength}
        height={GRID}
        style={{
          position: 'absolute',
          left: GRID / 2,
          top: -GRID / 2,
          overflow: 'visible',
          animationDuration: `${growDuration}s`,
        }}
      >
        <line x1={0} y1={1} x2={bandLength} y2={1} stroke="var(--ok)" strokeWidth={2} strokeDasharray="6 5" opacity={0.85} />
        <line x1={0} y1={GRID - 1} x2={bandLength} y2={GRID - 1} stroke="var(--ok)" strokeWidth={2} strokeDasharray="6 5" opacity={0.85} />
        {Array.from({ length: maxDistance }, (_, i) => {
          const cx = GRID * i + GRID / 2
          return (
            <polyline
              key={i}
              points={`${cx - 6},${GRID / 2 - 7} ${cx + 6},${GRID / 2} ${cx - 6},${GRID / 2 + 7}`}
              fill="none"
              stroke="var(--ok)"
              strokeWidth={2.5}
              strokeLinecap="round"
              strokeLinejoin="round"
              opacity={0.9}
              transform={chevronExtraRotation !== 0 ? `rotate(${chevronExtraRotation} ${cx} ${GRID / 2})` : undefined}
            />
          )
        })}
      </svg>
    </div>
  )
}
