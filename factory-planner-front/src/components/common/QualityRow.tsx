import { useEntityCatalogStore } from '../../store/entityCatalogStore'
import { NORMAL_QUALITY } from '../../lib/quality'

interface Props {
  // undefined = normal
  value: string | undefined
  onChange: (quality: string) => void
  label?: string
}

// Строка выбора качества: плитки по списку qualities профиля (normal →
// legendary), активная подсвечена. В профилях без качества (список пуст)
// не рендерится вовсе.
export function QualityRow({ value, onChange, label = 'Качество' }: Props) {
  const qualities = useEntityCatalogStore((s) => s.qualities)
  if (qualities.length === 0) return null
  const active = value ?? NORMAL_QUALITY
  return (
    <div className="quality-row" onClick={(e) => e.stopPropagation()}>
      <span className="quality-row-label">{label}</span>
      <div className="quality-row-tiles">
        {qualities.map((q) => (
          <button
            key={q.name}
            type="button"
            className={`quality-tile${q.name === active ? ' active' : ''}`}
            style={{ ['--q-color' as string]: q.color }}
            title={q.localizedName}
            onClick={() => onChange(q.name)}
          >
            {q.icon && <img src={q.icon} alt={q.localizedName} />}
          </button>
        ))}
      </div>
    </div>
  )
}
