import { CHANGELOG } from '../../lib/changelog'

interface Props {
  onClose: () => void
}

function formatDate(iso: string): string {
  const [y, m, d] = iso.split('-')
  return `${d}.${m}.${y}`
}

// Раздел «Обновления» главного меню: что нового в редакторе (lib/changelog.ts).
export function ChangelogModal({ onClose }: Props) {
  return (
    <div className="picker-overlay" onClick={onClose}>
      <div className="picker-modal ie-modal changelog-modal" onClick={(e) => e.stopPropagation()}>
        <div className="gm-header">
          <span className="gm-title">Обновления</span>
          <button className="gm-icon-btn" onClick={onClose}>✕</button>
        </div>
        <div className="changelog-body selectable">
          {CHANGELOG.map((entry) => (
            <section key={entry.id} className="changelog-entry">
              <div className="changelog-entry-head">
                <span className="changelog-entry-title">{entry.title}</span>
                <span className="changelog-entry-date">{formatDate(entry.date)}</span>
              </div>
              <ul>
                {entry.items.map((item, i) => (
                  <li key={i}>{item}</li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      </div>
    </div>
  )
}
