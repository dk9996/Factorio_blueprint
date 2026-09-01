import { useState } from 'react'

interface Props {
  defaultFolder?: string
  onConfirm: (name: string, folder: string) => void
  onClose: () => void
  saving: boolean
  error: string | null
}

export function SaveFactoryModal({ defaultFolder, onConfirm, onClose, saving, error }: Props) {
  const [name, setName] = useState('')
  const [folder, setFolder] = useState(defaultFolder ?? '')

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!name.trim()) return
    onConfirm(name.trim(), folder.trim() || 'Без категории')
  }

  return (
    <div className="picker-overlay" onClick={onClose}>
      <div className="picker-modal ie-modal" onClick={(e) => e.stopPropagation()}>
        <div className="gm-header">
          <span className="gm-title">Сохранить чертёж</span>
          <button className="gm-icon-btn" onClick={onClose}>✕</button>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="ie-body">
            <label className="sf-label">Название</label>
            <input
              className="gm-search-input"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Например: Зелёные схемы — линия 4"
              autoFocus
            />

            <label className="sf-label" style={{ marginTop: 10 }}>Папка</label>
            <input
              className="gm-search-input"
              value={folder}
              onChange={(e) => setFolder(e.target.value)}
              placeholder="Например: Электроника"
            />

            {error && <div className="ie-error">{error}</div>}
          </div>

          <div className="ie-footer">
            <button
              type="submit"
              className="ie-btn primary"
              disabled={!name.trim() || saving}
            >
              {saving ? 'Сохранение…' : 'Сохранить'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}