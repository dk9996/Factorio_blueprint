import { useEffect, useMemo, useRef, useState } from 'react'
import { useEntityCatalogStore } from '../../store/entityCatalogStore'
import type { CatalogEntity } from '../../store/entityCatalogStore'
import { importBlueprintString, type ImportBlueprintStringResult } from '../../lib/blueprint/convert'
import { BlueprintFormatError } from '../../lib/blueprint/errors'
import { createProjectsFromImport, ensureCatalogForProfile } from '../../lib/projects/projectSession'
import { friendlyError } from '../../store/projectsStore'
import { entitiesApi } from '../../lib/api/entities'
import { resolveDlcUpgradeProfile } from '../../lib/content/importDlcPrompt'

interface Props {
  onClose: () => void
}

interface Summary {
  projectsCreated: number
  entitiesImported: number
  skipped: { name: string; count: number }[]
  skippedBookEntries: string[]
}

function summarizeSkipped(names: string[]): { name: string; count: number }[] {
  const counts = new Map<string, number>()
  for (const name of names) counts.set(name, (counts.get(name) ?? 0) + 1)
  return Array.from(counts.entries()).map(([name, count]) => ({ name, count }))
}

/**
 * Импорт с главного экрана — визуально повторяет import-часть
 * ImportExportPanel.tsx (те же ie-* классы), но результат создаёт отдельные
 * ПРОЕКТЫ (по одному на каждый чертёж книги), а не вкладки открытого
 * документа — см. lib/projects/projectSession.ts createProjectsFromImport.
 */
interface PendingDlcChoice {
  result: ImportBlueprintStringResult
  profileId: string
  label: string
}

export function MenuImportDialog({ onClose }: Props) {
  const [text, setText] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [importing, setImporting] = useState(false)
  const [summary, setSummary] = useState<Summary | null>(null)
  const [dragOver, setDragOver] = useState(false)
  const [pendingChoice, setPendingChoice] = useState<PendingDlcChoice | null>(null)
  const [originMap, setOriginMap] = useState<Record<string, string> | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const catalog = useEntityCatalogStore((s) => s.entities)
  const catalogByTypeId = useMemo(
    () => new Map<string, CatalogEntity>(catalog.map((c) => [c.typeId, c])),
    [catalog],
  )
  const catalogModules = useEntityCatalogStore((s) => s.modules)
  const moduleNames = useMemo(() => new Set(catalogModules.map((m) => m.name)), [catalogModules])

  // Новые проекты из импорта создаются на профиле 'base' по умолчанию —
  // его каталог здесь может быть ещё не загружен (AppLayout больше не
  // фетчит каталог безусловно при маунте, см. отчёт по задаче
  // "контент-профили"), плюс карта typeId->профиль нужна для подсказки
  // "включить DLC" ниже.
  useEffect(() => {
    void ensureCatalogForProfile('base')
    entitiesApi.profileOrigin().then(setOriginMap).catch(() => setOriginMap({}))
  }, [])

  async function commitImport(result: ImportBlueprintStringResult, profileId: string) {
    setImporting(true)
    try {
      const entitiesImported = result.tabs.reduce((s, t) => s + t.result.entities.length, 0)
      const projectsCreated = await createProjectsFromImport(result.tabs, profileId)
      setSummary({
        projectsCreated,
        entitiesImported,
        skipped: summarizeSkipped(result.skippedNames),
        skippedBookEntries: result.skippedBookEntries,
      })
    } catch (err) {
      setError(err instanceof BlueprintFormatError ? err.message : friendlyError(err))
    } finally {
      setImporting(false)
    }
  }

  // Если среди пропущенных сущностей есть такие, что существуют в другом
  // профиле контента — не создаём проекты сразу с неполным набором, а
  // сперва предлагаем выбор (см. lib/content/importDlcPrompt.ts): включить
  // DLC и импортировать полностью, или продолжить как есть (на base).
  async function runImport() {
    setError(null)
    setSummary(null)
    setPendingChoice(null)
    try {
      const result = importBlueprintString(text, catalogByTypeId, moduleNames)
      if (result.tabs.length === 0) {
        setError('Чертёж распознан, но не содержит ни одной сущности')
        return
      }
      if (result.skippedNames.length > 0 && originMap) {
        const offer = resolveDlcUpgradeProfile(result.skippedNames, originMap, 'base')
        if (offer) {
          setPendingChoice({ result, profileId: offer.profileId, label: offer.label })
          return
        }
      }
      await commitImport(result, 'base')
    } catch (err) {
      setError(err instanceof BlueprintFormatError ? err.message : friendlyError(err))
    }
  }

  async function handleEnableDlcAndImport() {
    if (!pendingChoice) return
    setImporting(true)
    try {
      await ensureCatalogForProfile(pendingChoice.profileId)
      const freshCatalog = useEntityCatalogStore.getState().entities
      const freshMap = new Map<string, CatalogEntity>(freshCatalog.map((c) => [c.typeId, c]))
      const result = importBlueprintString(text, freshMap, new Set(useEntityCatalogStore.getState().modules.map((m) => m.name)))
      const profileId = pendingChoice.profileId
      setPendingChoice(null)
      await commitImport(result, profileId)
    } catch (err) {
      setError(err instanceof BlueprintFormatError ? err.message : friendlyError(err))
      setImporting(false)
    }
  }

  function handleImportAnyway() {
    if (!pendingChoice) return
    const { result } = pendingChoice
    setPendingChoice(null)
    void commitImport(result, 'base')
  }

  async function handlePasteFromClipboard() {
    try {
      const clip = await navigator.clipboard.readText()
      setText(clip)
      setError(null)
    } catch {
      setError('Не удалось прочитать буфер обмена — вставь строку вручную (Ctrl+V в поле)')
    }
  }

  function handleFile(file: File) {
    file
      .text()
      .then((content) => {
        setText(content)
        setError(null)
      })
      .catch(() => setError('Не удалось прочитать файл'))
  }

  return (
    <div className="picker-overlay" onClick={onClose}>
      <div className="picker-modal ie-modal" onClick={(e) => e.stopPropagation()}>
        <div className="gm-header">
          <span className="gm-title">Импортировать чертёж</span>
          <button className="gm-icon-btn" onClick={onClose}>✕</button>
        </div>

        <div className="ie-body">
          <div className="ie-toolrow">
            <button className="ie-btn" onClick={handlePasteFromClipboard}>📋 Вставить из буфера</button>
            <button className="ie-btn" onClick={() => fileInputRef.current?.click()}>📄 Выбрать файл…</button>
            <input
              ref={fileInputRef}
              type="file"
              accept=".txt,text/plain"
              style={{ display: 'none' }}
              onChange={(e) => {
                const file = e.target.files?.[0]
                if (file) handleFile(file)
                e.target.value = ''
              }}
            />
          </div>

          <div
            className={`ie-dropzone${dragOver ? ' drag-over' : ''}`}
            onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
            onDragLeave={() => setDragOver(false)}
            onDrop={(e) => {
              e.preventDefault()
              setDragOver(false)
              const file = e.dataTransfer.files?.[0]
              if (file) handleFile(file)
            }}
          >
            <textarea
              className="ie-textarea"
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="Вставь строку чертежа сюда, перетащи .txt файл или выбери его выше…"
              autoFocus
            />
          </div>

          {error && <div className="ie-error">{error}</div>}

          {pendingChoice && (
            <div className="ie-summary">
              <div className="ie-summary-title">
                {pendingChoice.result.skippedNames.length} сущностей отсутствуют в текущем наборе контента,
                но есть в {pendingChoice.label}
              </div>
              <div className="ie-dlc-offer">
                <button className="ie-btn primary" onClick={handleEnableDlcAndImport} disabled={importing}>
                  {importing ? 'Включаю…' : `Включить ${pendingChoice.label} и импортировать`}
                </button>
                <button className="ie-btn" onClick={handleImportAnyway} disabled={importing}>
                  Импортировать как есть (без них)
                </button>
              </div>
            </div>
          )}

          {summary && (
            <div className="ie-summary">
              <div className="ie-summary-title">
                Создано проектов: {summary.projectsCreated}, сущностей: {summary.entitiesImported}
              </div>
              {summary.skipped.length > 0 && (
                <div className="ie-summary-skip">
                  Пропущено {summary.skipped.reduce((s, x) => s + x.count, 0)} сущностей (нет в каталоге):{' '}
                  {summary.skipped.map((s) => `${s.name}${s.count > 1 ? ` ×${s.count}` : ''}`).join(', ')}
                </div>
              )}
              {summary.skippedBookEntries.length > 0 && (
                <div className="ie-summary-skip">
                  Пропущено элементов книги (неподдерживаемый тип): {summary.skippedBookEntries.join(', ')}
                </div>
              )}
            </div>
          )}
        </div>

        <div className="ie-footer">
          <button className="ie-btn primary" onClick={runImport} disabled={!text.trim() || importing}>
            {importing ? 'Импортирую…' : 'Импортировать'}
          </button>
        </div>
      </div>
    </div>
  )
}
