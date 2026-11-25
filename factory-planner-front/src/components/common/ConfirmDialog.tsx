interface Props {
  title: string
  message: string
  confirmLabel?: string
  cancelLabel?: string
  danger?: boolean
  onConfirm: () => void
  onCancel: () => void
}

/**
 * Замена window.confirm() — нативный блокирующий диалог не везде корректно
 * рендерится/обрабатывается (например, во встроенном preview-браузере он
 * повисает, не будучи видимым или кликабельным), из-за чего кнопки вроде
 * "Удалить" выглядели нерабочими. Паттерн overlay/modal — как у
 * SaveFactoryModal.tsx (picker-overlay + picker-modal + ie-*).
 */
export function ConfirmDialog({ title, message, confirmLabel = 'Подтвердить', cancelLabel = 'Отмена', danger, onConfirm, onCancel }: Props) {
  return (
    <div className="picker-overlay" onClick={(e) => { e.stopPropagation(); onCancel() }}>
      <div className="picker-modal ie-modal" onClick={(e) => e.stopPropagation()}>
        <div className="gm-header">
          <span className="gm-title">{title}</span>
          <button className="gm-icon-btn" onClick={onCancel}>✕</button>
        </div>
        <div className="ie-body">{message}</div>
        <div className="ie-footer">
          <button className="ie-btn" onClick={onCancel}>{cancelLabel}</button>
          <button className={`ie-btn ${danger ? 'danger' : 'primary'}`} onClick={onConfirm} autoFocus>
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}
