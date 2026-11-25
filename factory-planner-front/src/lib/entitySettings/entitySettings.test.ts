import { describe, expect, it } from 'vitest'
import { applySettingPatches, readSetting } from './access.ts'
import { ENTITY_SETTINGS, hasSettings, settingsFor } from './registry.ts'
import { migrateLegacyConfig } from './legacy.ts'
import { blueprintDataToEntities, entitiesToBlueprintData } from '../blueprint/convert.ts'
import { useCanvasStore, type PlacedEntity } from '../../store/canvasStore.ts'
import type { CatalogEntity } from '../../store/entityCatalogStore.ts'
import type { BlueprintData } from '../../types/blueprint.ts'

const cat = (typeId: string, type: string, w = 1, h = 1): CatalogEntity => ({
  typeId, type, label: typeId, icon: '', entitySprite: null, pipeSpriteVariants: null, fluidPipeOverlays: null,
  directionalSprites: null, ioHints: null, category: '', categoryId: '', categoryOrder: '', subgroup: '', subgroupOrder: '',
  itemOrder: '', categoryIcon: '', width: w * 32, height: h * 32, craftingCategories: null, moduleSlots: 0, allowedEffects: [],
  allowedModuleCategories: null, connectors: null, circuitWireMaxDistance: null, craftingSpeed: null, miningSpeed: null,
  researchingSpeed: null, speed: null, rocketPartsRequired: null, filterCount: type === 'inserter' ? 5 : 0, bulkInserterConfig: false,
  logisticRadius: null, constructionRadius: null, spriteFrameWidth: null, spriteFrameHeight: null, spriteFrameCount: null,
  spriteLineLength: null, spriteShiftX: 0, spriteShiftY: 0, spriteScale: 1, spriteGameShiftX: 0, spriteGameShiftY: 0,
} as CatalogEntity)

const catalog = new Map<string, CatalogEntity>([
  ['fast-inserter', cat('fast-inserter', 'inserter')],
  ['splitter', cat('splitter', 'splitter', 2, 1)],
  ['pump', cat('pump', 'pump', 1, 2)],
  ['train-stop', cat('train-stop', 'train-stop', 2, 2)],
  ['small-lamp', cat('small-lamp', 'lamp')],
  ['programmable-speaker', cat('programmable-speaker', 'programmable-speaker')],
  ['steel-chest', cat('steel-chest', 'container')],
  ['assembling-machine-2', cat('assembling-machine-2', 'assembling-machine', 3, 3)],
  ['transport-belt', cat('transport-belt', 'transport-belt')],
])

const bp = (entities: BlueprintData['entities'], wires?: unknown): BlueprintData =>
  ({ item: 'blueprint', version: 562949954076673, entities, ...(wires ? { wires } : {}) }) as BlueprintData

const entity = (over: Partial<PlacedEntity>): PlacedEntity => ({
  id: 1, typeId: 'x', type: 'x', icon: '', label: 'x', x: 0, y: 0, width: 32, height: 32, ...over,
})

describe('применение настроек (access)', () => {
  it('control_behavior идёт в controlBehavior, остальное — в extra; чужие поля не трогаются', () => {
    const e = entity({ extra: { tags: { a: 1 }, color: { r: 1 } }, controlBehavior: { circuit_enabled: true } })
    const out = applySettingPatches(e, [
      { path: 'control_behavior.use_colors', value: true },
      { path: 'always_on', value: true },
    ])
    expect(out.controlBehavior).toEqual({ circuit_enabled: true, use_colors: true })
    expect(out.extra).toEqual({ tags: { a: 1 }, color: { r: 1 }, always_on: true })
    expect(readSetting(out, 'control_behavior.use_colors')).toBe(true)
    expect(readSetting(out, 'always_on')).toBe(true)
  })
  it('стирание убирает поле и пустые родительские объекты', () => {
    const e = entity({ extra: { parameters: { playback_volume: 0.5 } } })
    const out = applySettingPatches(e, [{ path: 'parameters.playback_volume', value: undefined }])
    expect(out.extra).toBeUndefined()
  })
  it('seed создаёт обязательный вложенный объект целиком при первой записи', () => {
    const seed = { parameters: { playback_volume: 1, playback_mode: 'local', allow_polyphony: false } }
    const out = applySettingPatches(entity({}), [{ path: 'parameters.playback_volume', value: 0.3, seed }])
    expect(out.extra).toEqual({ parameters: { playback_volume: 0.3, playback_mode: 'local', allow_polyphony: false } })
    // уже существующий объект seed не перезаписывает
    const again = applySettingPatches(out, [{ path: 'parameters.allow_polyphony', value: true, seed }])
    expect((again.extra!.parameters as Record<string, unknown>).playback_volume).toBe(0.3)
  })
})

describe('реестр', () => {
  it('окно открывается только у сущностей с настоящими настройками', () => {
    expect(hasSettings(entity({ typeId: 'fast-inserter', type: 'inserter' }))).toBe(true)
    expect(hasSettings(entity({ typeId: 'steel-chest', type: 'container' }))).toBe(true)
    expect(hasSettings(entity({ typeId: 'assembling-machine-2', type: 'assembling-machine' }))).toBe(false)
    expect(hasSettings(entity({ typeId: 'arithmetic-combinator', type: 'arithmetic-combinator' }))).toBe(false)
    // у конвейера только заглушки уровня 2 — окно не открывается
    expect(hasSettings(entity({ typeId: 'transport-belt', type: 'transport-belt' }))).toBe(false)
    expect(settingsFor(entity({ typeId: 'rail-signal', type: 'rail-signal' }))?.title).toBe('Рельсовый сигнал')
  })
})

describe('окна как в игре', () => {
  it('у локомотива и грузового вагона окна нет', () => {
    expect(hasSettings(entity({ typeId: 'locomotive', type: 'locomotive' }))).toBe(false)
    expect(hasSettings(entity({ typeId: 'cargo-wagon', type: 'cargo-wagon' }))).toBe(false)
  })
  it('колонка: запись инструмента создаёт обязательный control_behavior целиком', () => {
    const f = settingsFor(entity({ typeId: 'programmable-speaker', type: 'programmable-speaker' }))!.fields.find((x) => x.key.endsWith('instrument_id'))!
    const out = applySettingPatches(entity({}), [
      { path: f.key, value: 3, seed: f.seed },
      ...Object.entries(f.resets ?? {}).map(([path, value]) => ({ path, value, seed: f.seed })),
    ])
    expect(out.controlBehavior).toEqual({
      circuit_condition: {},
      circuit_parameters: { signal_value_is_pitch: false, stop_playing_sounds: false, instrument_id: 3, note_id: 0 },
    })
  })
  it('раскладки ссылаются только на существующие поля', () => {
    for (const [name, def] of Object.entries(ENTITY_SETTINGS)) {
      const keys = new Set(def.fields.map((x) => x.key))
      const walk = (n: unknown): void => { if (typeof n === 'string') expect(keys.has(n), `${name}: ${n}`).toBe(true); else if (Array.isArray(n)) n.forEach(walk) }
      def.layout?.forEach(walk)
    }
  })
})

describe('импорт -> правка -> экспорт', () => {
  const source = bp([
    { entity_number: 1, name: 'fast-inserter', position: { x: 0.5, y: 0.5 }, use_filters: true, filter_mode: 'blacklist', override_stack_size: 2,
      filters: [{ index: 1, name: 'iron-plate', quality: 'normal', comparator: '=' }, { index: 3, name: 'coal' }], tags: { keep: 'me' }, drop_position: { x: 0.5, y: -0.5 } },
    { entity_number: 2, name: 'splitter', position: { x: 3, y: 0.5 }, input_priority: 'left', filter: { name: 'copper-plate', quality: 'normal', comparator: '=' } },
    { entity_number: 3, name: 'pump', position: { x: 5.5, y: 1 }, fluid_filter: 'water' },
    { entity_number: 4, name: 'train-stop', position: { x: 8, y: 1 }, station: 'Депо', color: { r: 0.2, g: 0.4, b: 0.6, a: 1 }, manual_trains_limit: 3, priority: 70 },
    { entity_number: 5, name: 'small-lamp', position: { x: 10.5, y: 0.5 }, color: { r: 1, g: 0, b: 0, a: 1 }, always_on: true, control_behavior: { use_colors: true, circuit_enabled: true } },
    { entity_number: 6, name: 'programmable-speaker', position: { x: 12.5, y: 0.5 },
      parameters: { playback_volume: 0.7, playback_mode: 'global', allow_polyphony: true, volume_controlled_by_signal: false, volume_signal_id: {} },
      alert_parameters: { show_alert: true, show_on_map: false, icon_signal_id: { name: 'signal-A', type: 'virtual' }, alert_message: 'Тревога' } },
    { entity_number: 7, name: 'steel-chest', position: { x: 14.5, y: 0.5 }, bar: 12 },
  ] as BlueprintData['entities'])

  it('окно видит настоящие значения чертежа', () => {
    const { entities } = blueprintDataToEntities(source, 1, catalog)
    const by = (n: string) => entities.find((e) => e.typeId === n)!
    expect(readSetting(by('fast-inserter'), 'filter_mode')).toBe('blacklist')
    expect(readSetting(by('fast-inserter'), 'use_filters')).toBe(true)
    expect(readSetting(by('fast-inserter'), 'filters')).toHaveLength(2)
    expect(readSetting(by('splitter'), 'input_priority')).toBe('left')
    expect(readSetting(by('pump'), 'fluid_filter')).toBe('water')
    expect(readSetting(by('train-stop'), 'station')).toBe('Депо')
    expect(readSetting(by('train-stop'), 'priority')).toBe(70)
    expect(readSetting(by('small-lamp'), 'control_behavior.use_colors')).toBe(true)
    expect(readSetting(by('programmable-speaker'), 'parameters.playback_mode')).toBe('global')
    expect(readSetting(by('steel-chest'), 'bar')).toBe(12)
  })

  it('правка -> экспорт: изменённые поля записаны, неизвестные поля сохранены', () => {
    const { entities } = blueprintDataToEntities(source, 1, catalog)
    const inserter = entities.find((e) => e.typeId === 'fast-inserter')!
    const edited = applySettingPatches(inserter, [
      { path: 'filter_mode', value: 'whitelist' },
      { path: 'override_stack_size', value: undefined },
      { path: 'filters', value: [{ index: 2, name: 'stone' }] },
    ])
    const { data } = entitiesToBlueprintData(entities.map((e) => (e.id === inserter.id ? edited : e)), { label: 't', catalogByTypeId: catalog })
    const out = data.entities!.find((e) => e.name === 'fast-inserter')! as Record<string, unknown>
    expect(out.filter_mode).toBe('whitelist')
    expect(out.override_stack_size).toBeUndefined()
    expect(out.filters).toEqual([{ index: 2, name: 'stone' }])
    expect(out.use_filters).toBe(true) // не тронуто
    expect(out.tags).toEqual({ keep: 'me' }) // неизвестное — как было
    expect(out.drop_position).toEqual({ x: 0.5, y: -0.5 })
    const lamp = data.entities!.find((e) => e.name === 'small-lamp')! as Record<string, unknown>
    expect(lamp.control_behavior).toEqual({ use_colors: true, circuit_enabled: true })
    // импорт результата возвращает те же настройки
    const again = blueprintDataToEntities(data, 1, catalog).entities
    expect(readSetting(again.find((e) => e.typeId === 'fast-inserter')!, 'filters')).toEqual([{ index: 2, name: 'stone' }])
    expect(readSetting(again.find((e) => e.typeId === 'programmable-speaker')!, 'alert_parameters.alert_message')).toBe('Тревога')
  })
})

describe('мультивыбор и история', () => {
  it('одна правка нескольких сущностей — один шаг undo', () => {
    const list = Array.from({ length: 5 }, (_, i) => entity({ id: i + 1, typeId: 'fast-inserter', type: 'inserter', x: i * 32 }))
    const store = useCanvasStore
    store.getState().loadEntities(list)
    const before = store.getState().past.length
    store.getState().patchEntitySettings(list.map((e) => e.id), [{ path: 'filters', value: [{ index: 1, name: 'iron-plate' }] }])
    expect(store.getState().past.length).toBe(before + 1)
    expect(store.getState().entities.every((e) => (e.extra?.filters as unknown[])?.length === 1)).toBe(true)
    store.getState().undo()
    expect(store.getState().entities.every((e) => e.extra?.filters === undefined)).toBe(true)
    store.getState().redo()
    expect(store.getState().entities.every((e) => e.extra?.filters !== undefined)).toBe(true)
  })

  it('функция-патч считает значение от текущего значения каждой сущности (слот списка)', () => {
    const a = entity({ id: 1, typeId: 'fast-inserter', type: 'inserter', extra: { filters: [{ index: 1, name: 'coal' }] } })
    const b = entity({ id: 2, typeId: 'fast-inserter', type: 'inserter' })
    useCanvasStore.getState().loadEntities([a, b])
    useCanvasStore.getState().patchEntitySettings([1, 2], (e) => {
      const cur = (readSetting(e, 'filters') as { index: number; name: string }[] | undefined) ?? []
      return [{ path: 'filters', value: [...cur.filter((f) => f.index !== 2), { index: 2, name: 'stone' }] }]
    })
    const [x, y] = useCanvasStore.getState().entities
    expect(x.extra?.filters).toEqual([{ index: 1, name: 'coal' }, { index: 2, name: 'stone' }])
    expect(y.extra?.filters).toEqual([{ index: 2, name: 'stone' }])
  })
})

describe('миграция старого окна', () => {
  it('config манипулятора -> поля чертежа, config очищается', () => {
    const e = entity({
      typeId: 'fast-inserter', type: 'inserter',
      config: { useFilters: true, filterMode: 'blacklist', filters: ['iron-plate', null, 'coal'], overrideStackSize: true, stackSizeOverride: 3, bulkLane: 1 },
    })
    const m = migrateLegacyConfig(e)
    expect(m.extra).toEqual({
      use_filters: true, filter_mode: 'blacklist',
      filters: [{ index: 1, name: 'iron-plate' }, { index: 3, name: 'coal' }], override_stack_size: 3,
    })
    expect(m.config).toEqual({ bulkLane: 1 })
    expect(migrateLegacyConfig(m)).toBe(m) // идемпотентна
  })
})
