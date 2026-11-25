import { useMemo, useRef, useState } from 'react'
import { useCanvasStore } from '../../store/canvasStore'
import type { PlacedEntity } from '../../store/canvasStore'
import { useEntityCatalogStore } from '../../store/entityCatalogStore'
import type { CatalogEntity } from '../../store/entityCatalogStore'
import { useFactoryStore } from '../../store/factoryStore'
import { useUiStore } from '../../store/uiStore'
import { useTabsStore } from '../../store/tabsStore'
import { useProjectsStore } from '../../store/projectsStore'
import { encodeBlueprintString } from '../../lib/blueprint/encode'
import {
  entitiesToBlueprintData,
  importBlueprintString,
  tabsToBlueprintBookData,
  type ImportBlueprintStringResult,
} from '../../lib/blueprint/convert'
import { BlueprintFormatError } from '../../lib/blueprint/errors'
import { unpackVersion } from '../../lib/blueprint/version'
import { normalizeEntities } from '../../lib/blueprint/boundingBox'
import { buildPlacingGroup } from '../../lib/clipboard/buildPlacingGroup'
import { hasTiles } from '../../lib/tiles'
import { entitiesApi } from '../../lib/api/entities'
import { resolveDlcUpgradeProfile } from '../../lib/content/importDlcPrompt'
import { ensureCatalogForProfile } from '../../lib/projects/projectSession'
import { SaveFactoryModal } from './SaveFactoryModal'

type Mode = 'import' | 'export' | 'save' | null

interface ImportSummary {
  tabsCreated: number
  entitiesImported: number
  skipped: { name: string; count: number }[]
  skippedBookEntries: string[]
}

function summarizeSkipped(names: string[]): { name: string; count: number }[] {
  const counts = new Map<string, number>()
  for (const name of names) counts.set(name, (counts.get(name) ?? 0) + 1)
  return Array.from(counts.entries()).map(([name, count]) => ({ name, count }))
}

interface PendingDlcChoice {
  raw: string
  skippedNames: string[]
  skippedBookEntries: string[]
  profileId: string
  label: string
}

export function ImportExportPanel() {
  const activeTab = useTabsStore((s) => s.getActiveTab())
  const allTabs = useTabsStore((s) => s.tabs)
  const activeTabId = useTabsStore((s) => s.activeTabId)
  const openBlueprintTab = useTabsStore((s) => s.openBlueprintTab)
  const attachFactoryToActiveTab = useTabsStore((s) => s.attachFactoryToActiveTab)
  const markTabSaved = useTabsStore((s) => s.markTabSaved)
  const updateFactory = useFactoryStore((s) => s.updateFactory)
  const [updating, setUpdating] = useState(false)

  async function handleUpdateCurrent() {
    if (!activeTab?.factoryId) return
    setUpdating(true)
    setError(null)
    try {
      const { entities: normalized } = normalizeEntities(entities)
      await updateFactory(activeTab.factoryId, { entities: normalized })
      markTabSaved(activeTabId, entities)
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
  const [dragOver, setDragOver] = useState(false)
  const [importSummary, setImportSummary] = useState<ImportSummary | null>(null)
  const [exportVersionLabel, setExportVersionLabel] = useState<string | null>(null)
  const [pendingChoice, setPendingChoice] = useState<PendingDlcChoice | null>(null)
  const [originMap, setOriginMap] = useState<Record<string, string> | null>(null)
  const [switchingProfile, setSwitchingProfile] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const entities = useCanvasStore((s) => s.entities)
  const tiles = useCanvasStore((s) => s.tiles)
  const wires = useCanvasStore((s) => s.wires)
  const setPlacing = useCanvasStore((s) => s.setPlacing)
  const catalog = useEntityCatalogStore((s) => s.entities)
  const selectedEntityIds = useUiStore((s) => s.selectedEntityIds)
  const createFactory = useFactoryStore((s) => s.createFactory)

  const catalogByTypeId = useMemo(
    () => new Map<string, CatalogEntity>(catalog.map((c) => [c.typeId, c])),
    [catalog],
  )
  // Имена модулей профиля — чтобы при импорте отличать модули в items от
  // остального (топливо и т.п.), см. lib/blueprint/modules.ts.
  const catalogModules = useEntityCatalogStore((s) => s.modules)
  const moduleNames = useMemo(() => new Set(catalogModules.map((m) => m.name)), [catalogModules])
  // Профиль с DLC quality — только тогда качество пишется в чертёж.
  const includeQuality = useEntityCatalogStore((s) => s.qualities.length > 0)
  const freshModuleNames = () => new Set(useEntityCatalogStore.getState().modules.map((m) => m.name))

  function openImport() {
    setText('')
    setError(null)
    setImportSummary(null)
    setPendingChoice(null)
    setMode('import')
    // Карта typeId->профиль для подсказки "включить DLC" — грузим лениво
    // при первом открытии диалога, кэшируем на весь жизненный цикл панели
    // (не меняется в рамках одной сессии редактора).
    if (!originMap) {
      entitiesApi.profileOrigin().then(setOriginMap).catch(() => setOriginMap({}))
    }
  }

  // Профиль только РАСШИРЯЕТСЯ (новые паки добавляются к уже включённым в
  // ТЕКУЩЕМ проекте, см. resolveDlcUpgradeProfile) — ранее размещённые
  // сущности никогда не перестанут резолвиться, поэтому предупреждение
  // "сколько исчезнет" (как при смене профиля в настройках проекта) здесь
  // не нужно.
  async function handleEnableDlcAndImport() {
    if (!pendingChoice) return
    const projectId = useUiStore.getState().activeProjectId
    if (!projectId) return
    setSwitchingProfile(true)
    try {
      await useProjectsStore.getState().changeContentProfile(projectId, pendingChoice.profileId)
      await ensureCatalogForProfile(pendingChoice.profileId)
      const freshCatalog = useEntityCatalogStore.getState().entities
      const freshMap = new Map<string, CatalogEntity>(freshCatalog.map((c) => [c.typeId, c]))
      const result = importBlueprintString(pendingChoice.raw, freshMap, freshModuleNames())
      setPendingChoice(null)
      commitImport(result)
    } catch (err) {
      setError(err instanceof BlueprintFormatError ? err.message : 'Не удалось включить DLC')
    } finally {
      setSwitchingProfile(false)
    }
  }

  function handleImportAnyway() {
    if (!pendingChoice) return
    const { raw } = pendingChoice
    setPendingChoice(null)
    try {
      commitImport(importBlueprintString(raw, catalogByTypeId, moduleNames))
    } catch (err) {
      setError(err instanceof BlueprintFormatError ? err.message : 'Не удалось прочитать строку чертежа')
    }
  }

  function openExport() {
    try {
      const hasSelection = selectedEntityIds.size > 0
      const source = hasSelection ? entities.filter((e) => selectedEntityIds.has(e.id)) : entities
      if (source.length === 0) {
        setError(hasSelection ? 'Выделение пустое — нечего экспортировать' : 'На вкладке нет сущностей — нечего экспортировать')
        setMode('export')
        return
      }
      // Метаданные исходного чертежа (tiles/wires/version/description/icons)
      // переносим только при экспорте ВСЕЙ вкладки целиком — для
      // произвольного подмножества (выделение) они не имеют смысла.
      const meta = hasSelection ? undefined : activeTab?.blueprintMeta
      const label = meta?.label ?? activeTab?.title ?? 'Чертёж из Factory Planner'
      const { data, version } = entitiesToBlueprintData(source, {
        label,
        meta,
        catalogByTypeId,
        includeQuality,
        // слой плиток — только при экспорте вкладки целиком (не выделения)
        tiles: hasSelection ? undefined : tiles,
        // провода — между экспортируемыми сущностями (концы вне набора отбрасываются)
        wires,
      })
      const encoded = encodeBlueprintString({ blueprint: data })
      setText(encoded)
      setExportVersionLabel(formatVersion(version))
      setError(null)
      setCopied(false)
      setMode('export')
    } catch {
      setError('Не удалось сформировать строку чертежа')
      setMode('export')
    }
  }

  function openExportAllTabs() {
    try {
      const effectiveTabs = allTabs.map((t) => (t.id === activeTabId ? { ...t, entities, tiles, wires } : t))
      const nonEmpty = effectiveTabs.filter((t) => t.entities.length > 0 || hasTiles(t.tiles))
      if (nonEmpty.length === 0) {
        setError('Все вкладки пусты — нечего экспортировать')
        setMode('export')
        return
      }
      const { data, version } = tabsToBlueprintBookData(
        nonEmpty.map((t) => ({ title: t.title, entities: t.entities, meta: t.blueprintMeta, tiles: t.tiles ?? {}, wires: t.wires ?? [] })),
        catalogByTypeId,
        'Factory Planner — все вкладки',
        includeQuality,
      )
      const encoded = encodeBlueprintString({ blueprint_book: data })
      setText(encoded)
      setExportVersionLabel(formatVersion(version))
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

  function commitImport(result: ImportBlueprintStringResult) {
    let entitiesImported = 0
    for (const tab of result.tabs) {
      openBlueprintTab(tab.title, tab.result.entities, tab.result.nextId, tab.result.meta, tab.result.tiles, tab.result.wires)
      entitiesImported += tab.result.entities.length
    }
    setImportSummary({
      tabsCreated: result.tabs.length,
      entitiesImported,
      skipped: summarizeSkipped(result.skippedNames),
      skippedBookEntries: result.skippedBookEntries,
    })
    setError(null)
  }

  // Если среди пропущенных сущностей есть такие, что существуют в другом
  // профиле контента текущего проекта — не коммитим вкладки сразу с
  // неполным набором, а сперва предлагаем выбор (см.
  // lib/content/importDlcPrompt.ts): включить DLC и импортировать заново
  // уже полностью, или продолжить как есть. Иначе (обычный случай без
  // DLC-сущностей) поведение не меняется — коммит сразу, одним кликом.
  function runImport(raw: string) {
    try {
      const result = importBlueprintString(raw, catalogByTypeId, moduleNames)
      if (result.tabs.length === 0) {
        setError('Чертёж распознан, но не содержит ни одной сущности')
        return
      }
      if (result.skippedNames.length > 0 && originMap) {
        const projectId = useUiStore.getState().activeProjectId
        const project = projectId
          ? useProjectsStore.getState().projects.find((p) => p.id === projectId)
          : null
        const offer = project
          ? resolveDlcUpgradeProfile(result.skippedNames, originMap, project.content_profile)
          : null
        if (offer) {
          setPendingChoice({
            raw,
            skippedNames: result.skippedNames,
            skippedBookEntries: result.skippedBookEntries,
            profileId: offer.profileId,
            label: offer.label,
          })
          setError(null)
          return
        }
      }
      commitImport(result)
    } catch (err) {
      setError(err instanceof BlueprintFormatError ? err.message : 'Не удалось прочитать строку чертежа')
    }
  }

  function runImportAsGhost(raw: string) {
    try {
      const result = importBlueprintString(raw, catalogByTypeId, moduleNames)
      if (result.tabs.length !== 1) {
        setError('Вставка призраком доступна только для одного чертежа (не книги с несколькими)')
        return
      }
      const parsedEntities = result.tabs[0].result.entities
      if (parsedEntities.length === 0) {
        setError('Чертёж распознан, но ни одна сущность не найдена в каталоге')
        return
      }
      const withoutIds = parsedEntities.map(({ id: _id, ...rest }: PlacedEntity) => rest)
      const group = buildPlacingGroup(withoutIds)
      setPlacing({ items: group })

      const skipped = summarizeSkipped(result.skippedNames)
      setImportSummary({
        tabsCreated: 0,
        entitiesImported: parsedEntities.length,
        skipped,
        skippedBookEntries: result.skippedBookEntries,
      })
      setError(null)
      setMode(null)
    } catch (err) {
      setError(err instanceof BlueprintFormatError ? err.message : 'Не удалось прочитать строку чертежа')
    }
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

  function handleFileInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (file) handleFile(file)
    e.target.value = ''
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault()
    setDragOver(false)
    const file = e.dataTransfer.files?.[0]
    if (file) handleFile(file)
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

  function handleDownload() {
    const blob = new Blob([text], { type: 'text/plain;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    const name = (activeTab?.title ?? 'blueprint').replace(/[^\p{L}\p{N}_-]+/gu, '_')
    a.href = url
    a.download = `${name || 'blueprint'}.txt`
    document.body.appendChild(a)
    a.click()
    a.remove()
    URL.revokeObjectURL(url)
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
      markTabSaved(activeTabId, entities)
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
        <button className="ie-btn" onClick={openImport}>⬇ Импорт</button>
        <button className="ie-btn" onClick={openExport}>
          ⬆ Экспорт{selectedEntityIds.size > 0 ? ` (${selectedEntityIds.size})` : ''}
        </button>
        <button className="ie-btn" onClick={openExportAllTabs} title="Экспортировать все вкладки одной книгой">
          ⬆ Все вкладки
        </button>
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
              {mode === 'import' && (
                <div className="ie-toolrow">
                  <button className="ie-btn" onClick={handlePasteFromClipboard}>📋 Вставить из буфера</button>
                  <button className="ie-btn" onClick={() => fileInputRef.current?.click()}>📄 Выбрать файл…</button>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".txt,text/plain"
                    style={{ display: 'none' }}
                    onChange={handleFileInputChange}
                  />
                </div>
              )}

              <div
                className={`ie-dropzone${dragOver ? ' drag-over' : ''}`}
                onDragOver={(e) => {
                  if (mode !== 'import') return
                  e.preventDefault()
                  setDragOver(true)
                }}
                onDragLeave={() => setDragOver(false)}
                onDrop={mode === 'import' ? handleDrop : undefined}
              >
                <textarea
                  className="ie-textarea"
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  readOnly={mode === 'export'}
                  placeholder={mode === 'import' ? 'Вставь строку чертежа сюда, перетащи .txt файл или выбери его выше…' : ''}
                  autoFocus
                  onFocus={(e) => mode === 'export' && e.currentTarget.select()}
                />
              </div>

              {mode === 'export' && exportVersionLabel && (
                <div className="ie-note">Версия чертежа: {exportVersionLabel}</div>
              )}

              {error && <div className="ie-error">{error}</div>}

              {pendingChoice && (
                <div className="ie-summary">
                  <div className="ie-summary-title">
                    {pendingChoice.skippedNames.length} сущностей отсутствуют в текущем профиле проекта,
                    но есть в {pendingChoice.label}
                  </div>
                  <div className="ie-dlc-offer">
                    <button className="ie-btn primary" onClick={handleEnableDlcAndImport} disabled={switchingProfile}>
                      {switchingProfile ? 'Включаю…' : `Включить ${pendingChoice.label} и импортировать`}
                    </button>
                    <button className="ie-btn" onClick={handleImportAnyway} disabled={switchingProfile}>
                      Импортировать как есть (без них)
                    </button>
                  </div>
                </div>
              )}

              {importSummary && (
                <div className="ie-summary">
                  <div className="ie-summary-title">
                    {importSummary.tabsCreated > 0
                      ? `Импортировано: ${importSummary.tabsCreated} вкладок, ${importSummary.entitiesImported} сущностей`
                      : `Вставлено призраком: ${importSummary.entitiesImported} сущностей`}
                  </div>
                  {importSummary.skipped.length > 0 && (
                    <div className="ie-summary-skip">
                      Пропущено {importSummary.skipped.reduce((s, x) => s + x.count, 0)} сущностей (нет в каталоге):{' '}
                      {importSummary.skipped.map((s) => `${s.name}${s.count > 1 ? ` ×${s.count}` : ''}`).join(', ')}
                    </div>
                  )}
                  {importSummary.skippedBookEntries.length > 0 && (
                    <div className="ie-summary-skip">
                      Пропущено элементов книги (неподдерживаемый тип): {importSummary.skippedBookEntries.join(', ')}
                    </div>
                  )}
                </div>
              )}

              {mode === 'import' && (
                <div className="ie-ghost-row">
                  <button
                    className="ie-btn"
                    onClick={() => runImportAsGhost(text)}
                    disabled={!text.trim()}
                    title="Вставить сущности призраком в текущую вкладку вместо создания новой"
                  >
                    👻 Вставить призраком в текущую вкладку
                  </button>
                </div>
              )}
            </div>

            <div className="ie-footer">
              {mode === 'import' ? (
                <button className="ie-btn primary" onClick={() => runImport(text)} disabled={!text.trim()}>
                  Импортировать (новые вкладки)
                </button>
              ) : (
                <>
                  <button className="ie-btn" onClick={handleDownload}>⬇ Скачать .txt</button>
                  <button className="ie-btn primary" onClick={handleCopy}>
                    {copied ? '✓ Скопировано' : 'Скопировать строку'}
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  )
}

function formatVersion(packed: number): string {
  const v = unpackVersion(packed)
  return `${v.major}.${v.minor}.${v.patch}`
}
