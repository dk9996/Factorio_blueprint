import { useState } from 'react'
import { resolveProfileId, type PakName } from '../../lib/content/profile'

interface Props {
  title?: string
  confirmLabel?: string
  initial?: Set<PakName>
  onConfirm: (profileId: string) => void
  onClose: () => void
}

/**
 * Выбор DLC-паков (Elevated Rails / Quality / Space Age) — Space Age тянет
 * за собой оба остальных (зеркалит зависимость на бэкенде, см.
 * app/content/profile.py:resolve_profile), чекбоксы Elevated Rails/Quality
 * недоступны для ручного снятия, пока Space Age включён — иначе получился
 * бы id, не совпадающий с тем, что реально посчитает бэкенд. Паттерн
 * overlay/modal — как у SaveFactoryModal.tsx.
 */
export function ContentProfileModal({ title = 'Выбор контента', confirmLabel = 'Создать', initial, onConfirm, onClose }: Props) {
  const [elevatedRails, setElevatedRails] = useState(initial?.has('elevated-rails') ?? false)
  const [quality, setQuality] = useState(initial?.has('quality') ?? false)
  const [spaceAge, setSpaceAge] = useState(initial?.has('space-age') ?? false)

  function toggleSpaceAge(next: boolean) {
    setSpaceAge(next)
    if (next) {
      setElevatedRails(true)
      setQuality(true)
    }
  }

  function handleConfirm() {
    const paks = new Set<PakName>()
    if (elevatedRails) paks.add('elevated-rails')
    if (quality) paks.add('quality')
    if (spaceAge) paks.add('space-age')
    onConfirm(resolveProfileId(paks))
  }

  return (
    <div className="picker-overlay" onClick={(e) => { e.stopPropagation(); onClose() }}>
      <div className="picker-modal ie-modal" onClick={(e) => e.stopPropagation()}>
        <div className="gm-header">
          <span className="gm-title">{title}</span>
          <button className="gm-icon-btn" onClick={onClose}>✕</button>
        </div>
        <div className="ie-body">
          <label className="ins-checkbox-row">
            <input
              type="checkbox"
              checked={elevatedRails}
              disabled={spaceAge}
              onChange={(e) => setElevatedRails(e.target.checked)}
            />
            Elevated Rails
          </label>
          <label className="ins-checkbox-row">
            <input
              type="checkbox"
              checked={quality}
              disabled={spaceAge}
              onChange={(e) => setQuality(e.target.checked)}
            />
            Quality
          </label>
          <label className="ins-checkbox-row">
            <input type="checkbox" checked={spaceAge} onChange={(e) => toggleSpaceAge(e.target.checked)} />
            Space Age <span style={{ color: 'var(--text-dim)' }}>(включает Elevated Rails и Quality)</span>
          </label>
        </div>
        <div className="ie-footer">
          <button className="ie-btn primary" onClick={handleConfirm}>{confirmLabel}</button>
        </div>
      </div>
    </div>
  )
}
