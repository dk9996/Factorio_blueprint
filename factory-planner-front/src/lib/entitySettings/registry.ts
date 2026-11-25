// Реестр настроек сущностей (blueprint 2.0): ключ — имя прототипа
// (typeId) или тип (entity.type); окно <EntitySettingsPanel/> целиком
// строится из этих описаний. Новая сущность или настройка = запись здесь,
// без нового UI-кода. Имена полей — по BlueprintEntity из runtime-api.json
// игры (doc-html); значения и вложенность, не подтверждённые реальной
// blueprint-строкой, помечены в комментариях/`unverified`.
import type { PlacedEntity } from '../../store/canvasStore'
import type { CatalogEntity } from '../../store/entityCatalogStore'

export type FieldKind = 'enum' | 'number' | 'bool' | 'text' | 'color' | 'itemFilter' | 'fluidFilter' | 'signal' | 'itemList'

export interface FieldCtx {
  entity: PlacedEntity
  catalog: CatalogEntity | undefined
  hasQuality: boolean
  hasSpaceAge: boolean
  hasElevatedRails: boolean
}

export interface FieldOption { value: string; label: string }

export interface FieldDef {
  // путь в JSON сущности чертежа
  key: string
  label: string
  kind: FieldKind
  // вид редактора, как в окне игры: switch2 — переключатель из двух
  // значений (подписи — из options); priorityLR — флажок + переключатель
  // влево/вправо; radio — радиокнопки; spoil — флажок + два радио;
  // slider — флажок «включить» (если enableLabel) + ползунок + число;
  // sliderPlain — ползунок без флажка; textarea — многострочный текст
  variant?: 'switch2' | 'priorityLR' | 'radio' | 'spoil' | 'slider' | 'sliderPlain' | 'textarea'
  options?: FieldOption[] | ((ctx: FieldCtx) => FieldOption[])
  // значение enum — число (номер в списке, напр. инструмент колонки)
  numeric?: boolean
  sliderMax?: number
  step?: number
  // slider: показывать флажок «включить» (значения нет = выключено)
  enableLabel?: boolean
  info?: string
  min?: number
  max?: number | ((ctx: FieldCtx) => number)
  integer?: boolean
  // значение, которое игра считает умолчанием (показывается, пока поля нет)
  default?: unknown
  hint?: string
  visibleIf?: (ctx: FieldCtx) => boolean
  // itemList: число слотов
  slots?: (ctx: FieldCtx) => number
  // заглушка уровня 2: поле требует схемной симуляции/условий
  stage2?: boolean
  // имя/вложенность не подтверждены строкой из игры: поле показывается
  // только если уже есть в данных сущности
  unverified?: boolean
  // обязательный вложенный объект чертежа, создаваемый при первой записи:
  // top-level ключ (для control_behavior — сам control_behavior) -> объект
  seed?: Record<string, unknown>
  // при записи этого поля одновременно записать и эти поля (ключ -> значение),
  // например смена инструмента колонки сбрасывает номер ноты
  resets?: Record<string, unknown>
}

// Раскладка окна как в игре: строка — поле во всю ширину; массив —
// колонки в один ряд (строка в колонке — одно поле, вложенный массив —
// поля друг под другом). Поля вне раскладки идут списком в конце.
export type LayoutNode = string | (string | string[])[]

// Панель «Подключение логической сети» (как в игре): у сущности, к которой
// подведён провод, — «Вход» (включить, если <условие>) и «Выход» (что
// сущность выдаёт в сеть). Условие хранится в control_behavior.circuit_condition,
// флажок «Включить, если» — control_behavior.circuit_enabled; выходные
// настройки — обычные поля (FieldDef) со своими путями.
export interface CircuitPanelDef {
  output?: FieldDef[]
}

export interface SettingsDef {
  title: string
  fields: FieldDef[]
  layout?: LayoutNode[]
  // панель логической сети; окно открывается, только пока к сущности
  // подключён провод (иначе у сущности нет настроек вовсе)
  circuit?: CircuitPanelDef
  // подпись строки статуса под заголовком окна (в игре «Нет питания» и т.п.)
  status?: string
}

const whitelist: FieldOption[] = [{ value: 'whitelist', label: 'Белый список' }, { value: 'blacklist', label: 'Чёрный список' }]
const leftRight: FieldOption[] = [{ value: 'left', label: 'Влево' }, { value: 'right', label: 'Вправо' }]
const filterSlots = (ctx: FieldCtx) => ctx.catalog?.filterCount ?? 0
const bar: FieldDef = {
  key: 'bar', label: 'Ограничение слотов', kind: 'number', min: 0, integer: true,
  max: (ctx) => ctx.catalog?.inventorySize ?? 65535,
  hint: 'Слоты с этого номера и дальше закрыты (пусто — без ограничения)',
}
const stage2Condition = (what: string): FieldDef[] => [
  { key: 'control_behavior.circuit_enabled', label: `Включать по схеме: ${what}`, kind: 'bool', stage2: true },
  { key: 'control_behavior.circuit_condition', label: 'Условие включения', kind: 'signal', stage2: true },
]
const requestFilters: FieldDef = { key: 'request_filters', label: 'Логистические запросы', kind: 'itemList', stage2: true }
const priorityField = (key: string, label: string): FieldDef =>
  ({ key, label, kind: 'enum', variant: 'priorityLR', options: leftRight })

const SPEAKER_PARAMS = { parameters: { playback_volume: 1, playback_mode: 'local', allow_polyphony: false, volume_controlled_by_signal: false, volume_signal_id: {} } }
const SPEAKER_ALERT = { alert_parameters: { show_alert: false, show_on_map: true, icon_signal_id: {}, alert_message: '' } }
// control_behavior колонки по ProgrammableSpeakerBlueprintControlBehavior:
// circuit_condition и circuit_parameters (все четыре поля) обязательны
const SPEAKER_CB = {
  control_behavior: {
    circuit_condition: {},
    circuit_parameters: { signal_value_is_pitch: false, stop_playing_sounds: false, instrument_id: 0, note_id: 0 },
  },
}

const speakerInstruments = (ctx: FieldCtx) => ctx.catalog?.speakerInstruments ?? []
const instrumentOptions = (ctx: FieldCtx): FieldOption[] =>
  speakerInstruments(ctx).map((ins, i) => ({ value: String(i), label: ins.label }))
const noteOptions = (ctx: FieldCtx): FieldOption[] => {
  const cp = (ctx.entity.controlBehavior as { circuit_parameters?: { instrument_id?: number } } | undefined)?.circuit_parameters
  const ins = speakerInstruments(ctx)[cp?.instrument_id ?? 0]
  return (ins?.notes ?? []).map((n, i) => ({ value: String(i), label: n.label }))
}

const BELT_CB = { control_behavior: { circuit_contents_read_mode: 0, circuit_read_hand_contents: false } }

const CONTAINER: SettingsDef = { title: 'Контейнер', fields: [bar, { key: 'control_behavior.read_contents', label: 'Считывать содержимое в схему', kind: 'bool', stage2: true }] }
const railSignal = (title: string): SettingsDef => ({
  title,
  fields: [{ key: 'rail_layer', label: 'Слой', kind: 'enum', default: 'ground', visibleIf: (c) => c.hasElevatedRails, options: [{ value: 'ground', label: 'Земля' }, { value: 'elevated', label: 'Эстакада' }] }],
})
const turret: SettingsDef = { title: 'Турель', fields: [{ key: 'ignore-unprioritised', label: 'Игнорировать цели вне приоритета', kind: 'bool', default: false }] }

export const ENTITY_SETTINGS: Record<string, SettingsDef> = {
  // ---- по имени прототипа (приоритетнее типа) ----
  'rail-signal': railSignal('Рельсовый сигнал'),
  'rail-chain-signal': railSignal('Рельсовый сигнал-цепочка'),

  // ---- по типу прототипа ----
  container: CONTAINER,
  'logistic-container': { title: 'Логистический сундук', fields: [bar, requestFilters, ...stage2Condition('режим')] },
  'infinity-container': { title: 'Бесконечный сундук', fields: [bar] },
  'cargo-landing-pad': { title: 'Посадочная площадка', fields: [bar, requestFilters] },
  'space-platform-hub': {
    title: 'Хаб платформы',
    fields: [bar, { key: 'request_missing_construction_materials', label: 'Запрашивать недостающие материалы стройки', kind: 'bool' }, requestFilters],
  },
  inserter: {
    title: 'Манипулятор',
    status: 'Призрак',
    layout: [
      [['use_filters', 'filter_mode'], 'filters'],
      'override_stack_size',
      'spoil_priority',
    ],
    fields: [
      { key: 'use_filters', label: 'Использовать фильтры', kind: 'bool', default: false },
      { key: 'filter_mode', label: 'Режим фильтра', kind: 'enum', variant: 'switch2', options: whitelist, default: 'whitelist' },
      { key: 'filters', label: 'Фильтры', kind: 'itemList', slots: filterSlots },
      { key: 'override_stack_size', label: 'Переопределить размер захвата', kind: 'number', variant: 'slider', enableLabel: true, min: 1, max: 255, sliderMax: 12, integer: true, default: 1 },
      {
        key: 'spoil_priority', label: 'Приоритет свежести', kind: 'enum', variant: 'spoil', visibleIf: (c) => c.hasSpaceAge,
        info: 'Какие предметы манипулятор берёт первыми', default: 'none',
        options: [{ value: 'spoiled_first', label: 'Сначала испорченное' }, { value: 'fresh_first', label: 'Сначала свежее' }],
      },
      ...stage2Condition('манипулятор'),
      { key: 'control_behavior.circuit_set_filters', label: 'Задавать фильтры сигналами', kind: 'bool', stage2: true },
      { key: 'control_behavior.circuit_set_stack_size', label: 'Задавать размер стака сигналом', kind: 'bool', stage2: true },
      { key: 'control_behavior.circuit_read_hand_contents', label: 'Считывать содержимое руки', kind: 'bool', stage2: true },
    ],
  },
  loader: {
    title: 'Погрузчик',
    fields: [
      { key: 'filter_mode', label: 'Режим фильтра', kind: 'enum', default: 'none', options: [{ value: 'none', label: 'Без фильтра' }, ...whitelist] },
      { key: 'filters', label: 'Фильтры', kind: 'itemList', slots: filterSlots },
      { key: 'belt_stack_size_override', label: 'Размер стака на ленте (0 — по умолчанию)', kind: 'number', min: 0, max: 255, integer: true },
      ...stage2Condition('погрузчик'),
    ],
  },
  splitter: {
    title: 'Разветвитель',
    status: 'Призрак',
    layout: ['input_priority', ['output_priority', 'filter']],
    fields: [
      priorityField('input_priority', 'Приоритет входа'),
      priorityField('output_priority', 'Приоритет выхода'),
      { key: 'filter', label: 'Фильтр', kind: 'itemFilter' },
    ],
  },
  pump: {
    title: 'Насос',
    status: 'Призрак',
    layout: ['fluid_filter'],
    fields: [
      { key: 'fluid_filter', label: 'Выберите фильтр', kind: 'fluidFilter' },
      { key: 'control_behavior.set_filter', label: 'Задавать фильтр сигналом', kind: 'bool', stage2: true },
      ...stage2Condition('насос'),
    ],
  },
  valve: {
    title: 'Клапан',
    fields: [
      { key: 'valve_threshold_override', label: 'Порог (0–1; режим клапана задаёт прототип)', kind: 'number', min: 0, max: 1 },
    ],
  },
  'train-stop': {
    title: 'Железнодорожная станция',
    status: 'Призрак',
    layout: [['station', 'color'], 'manual_trains_limit', 'priority'],
    fields: [
      { key: 'station', label: 'Название станции', kind: 'text' },
      { key: 'color', label: 'Цвет', kind: 'color' },
      { key: 'manual_trains_limit', label: 'Ограничить количество поездов', kind: 'number', variant: 'slider', enableLabel: true, min: 0, max: 4294967295, sliderMax: 100, integer: true, default: 0 },
      { key: 'priority', label: 'Приоритет', kind: 'number', variant: 'sliderPlain', min: 0, max: 255, sliderMax: 255, integer: true, default: 50, info: 'Поезда выбирают станцию с большим приоритетом' },
      { key: 'control_behavior.set_trains_limit', label: 'Лимит поездов сигналом', kind: 'bool', stage2: true },
      { key: 'control_behavior.read_trains_count', label: 'Считывать число поездов', kind: 'bool', stage2: true },
      ...stage2Condition('станция'),
    ],
  },
  'artillery-wagon': { title: 'Артиллерийский вагон', fields: [{ key: 'artillery_auto_targeting', label: 'Автоприцеливание', kind: 'bool', default: true }] },
  'artillery-turret': { title: 'Артиллерийская турель', fields: [{ key: 'artillery_auto_targeting', label: 'Автоприцеливание', kind: 'bool', default: true }] },
  'display-panel': {
    title: 'Дисплей',
    layout: ['always_show', 'show_in_chart', 'icon', 'text'],
    fields: [
      { key: 'always_show', label: 'Всегда показывать в "Alt-режиме"', kind: 'bool', default: false, info: 'Текст виден всегда, а не только при зажатом Alt' },
      { key: 'show_in_chart', label: 'Показывать метку на карте', kind: 'bool', default: false, info: 'Текст и значок отображаются на карте' },
      { key: 'icon', label: 'Значок', kind: 'signal' },
      { key: 'text', label: 'Текст', kind: 'text', variant: 'textarea' },
    ],
  },
  lamp: {
    title: 'Фонарь',
    status: 'Призрак',
    layout: ['color', 'always_on'],
    fields: [
      { key: 'color', label: 'Цвет', kind: 'color' },
      { key: 'always_on', label: 'Всегда ВКЛ', kind: 'bool', default: false, info: 'Фонарь горит даже без условия схемы' },
      { key: 'control_behavior.use_colors', label: 'Цвет из сигналов схемы', kind: 'bool', stage2: true },
      { key: 'control_behavior.color_mode', label: 'Режим цвета схемы', kind: 'enum', stage2: true },
      ...stage2Condition('фонарь'),
    ],
  },
  'programmable-speaker': {
    title: 'Программируемый динамик',
    status: 'Призрак',
    layout: [
      'parameters.playback_volume',
      'parameters.playback_mode',
      'control_behavior.circuit_parameters.instrument_id',
      'control_behavior.circuit_parameters.note_id',
      'parameters.allow_polyphony',
      'alert_parameters.show_alert',
      [['alert_parameters.icon_signal_id'], 'alert_parameters.alert_message'],
      'alert_parameters.show_on_map',
    ],
    fields: [
      { key: 'parameters.playback_volume', label: 'Громкость', kind: 'number', variant: 'sliderPlain', min: 0, max: 1, sliderMax: 1, step: 0.01, default: 1, seed: SPEAKER_PARAMS },
      {
        key: 'parameters.playback_mode', label: 'Режим воспроизведения', kind: 'enum', variant: 'radio', default: 'local', seed: SPEAKER_PARAMS,
        options: [{ value: 'local', label: 'Локальный' }, { value: 'surface', label: 'Поверхность' }, { value: 'global', label: 'Вселенная' }],
      },
      // id инструмента/ноты — индекс в списке из прототипа; основание индекса (0) не подтверждено строкой из игры
      { key: 'control_behavior.circuit_parameters.instrument_id', label: 'Категория/Инструмент', kind: 'enum', numeric: true, default: '0', options: instrumentOptions, seed: SPEAKER_CB, resets: { 'control_behavior.circuit_parameters.note_id': 0 } },
      { key: 'control_behavior.circuit_parameters.note_id', label: 'Звук/Нота', kind: 'enum', numeric: true, default: '0', options: noteOptions, seed: SPEAKER_CB },
      { key: 'parameters.allow_polyphony', label: 'Разрешить полифонию', kind: 'bool', default: false, seed: SPEAKER_PARAMS },
      { key: 'alert_parameters.show_alert', label: 'Показать оповещение', kind: 'bool', default: false, seed: SPEAKER_ALERT },
      { key: 'alert_parameters.icon_signal_id', label: 'Значок оповещения', kind: 'signal', seed: SPEAKER_ALERT },
      { key: 'alert_parameters.alert_message', label: 'Текст оповещения', kind: 'text', seed: SPEAKER_ALERT },
      { key: 'alert_parameters.show_on_map', label: 'Показать иконку на карте', kind: 'bool', default: true, seed: SPEAKER_ALERT },
      { key: 'control_behavior.circuit_condition', label: 'Параметры соединения сети', kind: 'signal', stage2: true },
    ],
  },
  'rocket-silo': {
    title: 'Ракетная шахта',
    fields: [
      { key: 'launch_to_orbit_automatically', label: 'Запускать автоматически', kind: 'bool', default: false },
      { key: 'use_transitional_requests', label: 'Переходные запросы', kind: 'bool', default: false, visibleIf: (c) => c.hasSpaceAge },
    ],
  },
  'power-switch': {
    title: 'Выключатель питания',
    status: 'Призрак',
    layout: ['switch_state'],
    fields: [{ key: 'switch_state', label: 'Положение', kind: 'bool', variant: 'switch2', default: false, options: [{ value: 'false', label: 'Выкл' }, { value: 'true', label: 'Вкл' }] }],
  },
  'electric-energy-interface': {
    title: 'Электрический интерфейс',
    fields: [
      { key: 'buffer_size', label: 'Размер буфера', kind: 'number', min: 0 },
      { key: 'power_production', label: 'Производство', kind: 'number', min: 0 },
      { key: 'power_usage', label: 'Потребление', kind: 'number', min: 0 },
    ],
  },
  'heat-interface': {
    title: 'Тепловой интерфейс',
    fields: [
      { key: 'temperature', label: 'Температура', kind: 'number' },
      { key: 'mode', label: 'Режим', kind: 'enum', options: [{ value: 'at-least', label: 'Не меньше' }, { value: 'at-most', label: 'Не больше' }, { value: 'exactly', label: 'Ровно' }, { value: 'add', label: 'Добавить' }, { value: 'remove', label: 'Убрать' }] },
    ],
  },
  'linked-container': { title: 'Связанный сундук', fields: [{ key: 'link_id', label: 'Номер связи', kind: 'number', min: 0, integer: true, default: 0 }] },
  'linked-belt': { title: 'Связанный конвейер', fields: [{ key: 'belt_link', label: 'Номер связи', kind: 'number', min: 0, integer: true }] },
  'ammo-turret': turret,
  'electric-turret': turret,
  'fluid-turret': turret,
  turret,
  'spider-vehicle': { title: 'Паук', fields: [{ key: 'label', label: 'Название', kind: 'text' }, { key: 'color', label: 'Цвет', kind: 'color' }, requestFilters] },
  roboport: { title: 'Роботпорт', fields: [requestFilters, { key: 'control_behavior.read_items_mode', label: 'Считывать предметы в схему', kind: 'bool', stage2: true }] },
  // TransportBeltBlueprintControlBehavior: circuit_contents_read_mode и
  // circuit_read_hand_contents обязательны -> seed. Режимы чтения —
  // defines.control_behavior.transport_belt.content_read_mode (pulse=0, hold=1,
  // entire_belt_hold=2). Поля R/G у «Входа» — circuit_condition.first/second_signal_networks
  // (имена по аналогии с decider, строкой из игры не подтверждены).
  'transport-belt': {
    title: 'Конвейер',
    status: 'Призрак',
    fields: [],
    circuit: {
      output: [
        { key: 'control_behavior.circuit_read_hand_contents', label: 'Считывать содержимое конвейера', kind: 'bool', default: false, seed: BELT_CB },
        {
          key: 'control_behavior.circuit_contents_read_mode', label: 'Режим чтения', kind: 'enum', variant: 'radio', numeric: true, default: '0', seed: BELT_CB,
          options: [{ value: '0', label: 'Импульсы' }, { value: '1', label: 'Непрерывно' }, { value: '2', label: 'Удерживать (все конвейеры)' }],
        },
      ],
    },
  },
}
ENTITY_SETTINGS['loader-1x1'] = ENTITY_SETTINGS.loader

// Описание настроек для сущности: имя прототипа приоритетнее типа.
export function settingsFor(entity: PlacedEntity): SettingsDef | undefined {
  return ENTITY_SETTINGS[entity.typeId] ?? (entity.type ? ENTITY_SETTINGS[entity.type] : undefined)
}

// Окно открывается только если у сущности есть хотя бы одна настоящая
// (не заглушка «после этапа схем») настройка.
export function hasSettings(entity: PlacedEntity, wired = false): boolean {
  const def = settingsFor(entity)
  if (!def) return false
  return def.fields.some((f) => !f.stage2) || (wired && !!def.circuit)
}

// Есть ли у сущности панель логической сети (жёлтая рамка при подключении провода)
export function hasCircuitPanel(entity: PlacedEntity): boolean {
  return !!settingsFor(entity)?.circuit
}
