import { useState } from 'react'
import { useCanvasStore } from '../../store/canvasStore'
import { useEntityCatalogStore } from '../../store/entityCatalogStore'
import { useFactoryStore } from '../../store/factoryStore'
import { useUiStore } from '../../store/uiStore'
import { decodeBlueprint } from '../../lib/blueprint/decode'
import { encodeBlueprint } from '../../lib/blueprint/encode'
import { entitiesToBlueprint, blueprintToEntities } from '../../lib/blueprint/convert'
import { normalizeEntities } from '../../lib/blueprint/boundingBox'
import { SaveFactoryModal } from './SaveFactoryModal'
import { useTabsStore } from '../../store/tabsStore'

type Mode = 'import' | 'export' | 'save' | null



export function ImportExportPanel() {
  const activeTab = useTabsStore((s) => s.getActiveTab())
  const attachFactoryToActiveTab = useTabsStore((s) => s.attachFactoryToActiveTab)
  const renameActiveTab = useTabsStore((s) => s.renameActiveTab)
  const markTabSaved = useTabsStore((s) => s.markTabSaved)
  const activeTabId = useTabsStore((s) => s.activeTabId)
  const activeId = useFactoryStore((s) => s.activeId)
  const updateFactory = useFactoryStore((s) => s.updateFactory)
  const [updating, setUpdating] = useState(false)

    async function handleUpdateCurrent() {
    if (!activeTab?.factoryId) return
    setUpdating(true)
    setError(null)
    try {
      const { entities: normalized } = normalizeEntities(entities)
      await updateFactory(activeTab.factoryId, { entities: normalized })
      markTabSaved(activeTabId, entities) // ← добавлено
      setUpdating(false)
    } catch (err) {
      setUpdating(false)
      setError(err instanceof Error ? err.message : 'Не удалось обновить чертёж')
    }
  }

  const [mode, setMode] = useState<Mode>(null)
  const [text, setText] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const [saving, setSaving] = useState(false)

  const entities = useCanvasStore((s) => s.entities)
  const addEntities = useCanvasStore((s) => s.addEntities)
  const nextId = useCanvasStore((s) => s.nextId)
  const catalog = useEntityCatalogStore((s) => s.entities)
  const setSelection = useUiStore((s) => s.setSelection)
  const createFactory = useFactoryStore((s) => s.createFactory)

  function openImport() {
    setText('')
    setError(null)
    setMode('import')
  }

  function openExport() {
    try {
      const wrapper = entitiesToBlueprint(entities)
      const encoded = encodeBlueprint(wrapper)
      setText(encoded)
      setError(null)
      setCopied(false)
      setMode('export')
    } catch {
      setError('Не удалось сформировать строку чертежа')
      setMode('export')
    }
  }

  function openSave() {
    setError(null)
    setMode('save')
  }

  function handleImportConfirm() {
    try {
      const wrapper = decodeBlueprint(text.trim())
      const resolveMeta = (typeId: string) => {
        const found = catalog.find((c) => c.typeId === typeId)
        return found ? { icon: found.icon, width: found.width, height: found.height } : null
      }
      const { entities: parsed } = blueprintToEntities(wrapper, resolveMeta, nextId)

      if (parsed.length === 0) {
        setError('Чертёж распознан, но ни одна сущность не найдена в каталоге')
        return
      }

      const newIds = addEntities(parsed)
      setSelection(newIds)
      setMode(null)
    } catch {
      setError('Не удалось прочитать строку — проверь, что это корректный чертёж Factorio')
    }
  }

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {
      setError('Не удалось скопировать — скопируй текст вручную')
    }
  }

  async function handleSaveConfirm(name: string, folder: string) {
    if (entities.length === 0) {
      setError('На поле нет ни одной сущности — нечего сохранять')
      return
    }
    setSaving(true)
    setError(null)
    try {
      const { entities: normalized, width, height } = normalizeEntities(entities)
      const created = await new Promise<{ id: string }>((resolve, reject) => {
        createFactory({
          name, folder, width, height,
          icon: normalized[0]?.icon ?? '',
          previewIcons: Array.from(new Set(normalized.map((e) => e.icon))).slice(0, 4),
          entities: normalized,
        })
          .then(() => {
            const latest = useFactoryStore.getState().factories
            const found = latest[latest.length - 1]
            found ? resolve(found) : reject(new Error('not found'))
          })
          .catch(reject)
      })
      attachFactoryToActiveTab(created.id, name)
      markTabSaved(activeTabId, entities) // ← добавлено
      setSaving(false)
      setMode(null)
    } catch (err) {
      setSaving(false)
      setError(err instanceof Error ? err.message : 'Не удалось сохранить чертёж')
    }
  }

  return (
    <>
      <div className="ie-buttons">
        <button className="ie-btn" onClick={openImport}>
          ⬇ Импорт
        </button>
        <button className="ie-btn" onClick={openExport}>
          ⬆ Экспорт
        </button>
        <button className="ie-btn primary" onClick={openSave}>
          💾 Сохранить
        </button>
      </div>

      <div className="ie-buttons">
        <button className="ie-btn" onClick={openImport}>⬇ Импорт</button>
        <button className="ie-btn" onClick={openExport}>⬆ Экспорт</button>
        {activeTab?.factoryId && (
          <button className="ie-btn" onClick={handleUpdateCurrent} disabled={updating}>
            {updating ? '…' : '🔄 Обновить'}
          </button>
        )}
        <button className="ie-btn primary" onClick={openSave}>💾 Сохранить как новый</button>
      </div>

      {mode === 'save' && (
        <SaveFactoryModal
          onConfirm={handleSaveConfirm}
          onClose={() => setMode(null)}
          saving={saving}
          error={error}
        />
      )}

      {(mode === 'import' || mode === 'export') && (
        <div className="picker-overlay" onClick={() => setMode(null)}>
          <div className="picker-modal ie-modal" onClick={(e) => e.stopPropagation()}>
            <div className="gm-header">
              <span className="gm-title">
                {mode === 'import' ? 'Импортировать чертёж' : 'Экспортировать чертёж'}
              </span>
              <button className="gm-icon-btn" onClick={() => setMode(null)}>✕</button>
            </div>

            <div className="ie-body">
              <textarea
                className="ie-textarea"
                value={text}
                onChange={(e) => setText(e.target.value)}
                readOnly={mode === 'export'}
                placeholder={mode === 'import' ? 'Вставь строку чертежа сюда…' : ''}
                autoFocus
                onFocus={(e) => mode === 'export' && e.currentTarget.select()}
              />
              {error && <div className="ie-error">{error}</div>}
            </div>

            <div className="ie-footer">
              {mode === 'import' ? (
                <button className="ie-btn primary" onClick={handleImportConfirm}>
                  Импортировать
                </button>
              ) : (
                <button className="ie-btn primary" onClick={handleCopy}>
                  {copied ? '✓ Скопировано' : 'Скопировать'}
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  )
}