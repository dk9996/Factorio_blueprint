// Схемная логика Factorio 2.0 (этап 1: провода + настройка комбинаторов,
// без симуляции). Типы control_behavior повторяют runtime-api игры
// (doc-html/runtime-api.json: ArithmeticCombinatorParameters,
// DeciderCombinatorParameters, SelectorCombinatorParameters, LuaLogisticSection)
// и формат blueprint 2.0 — в модель кладётся ровно тот же JSON, что и в
// чертеже (control_behavior сущности), чтобы импорт/экспорт были тривиальны.

export type WireColor = 'red' | 'green'

// Конец провода: сущность + идентификатор коннектора из каталога
// (комбинаторы: 'input' | 'output', остальные: 'single').
export interface WireEndpoint {
  entityId: number
  connector: string
}

export interface Wire {
  id: string
  color: WireColor
  a: WireEndpoint
  b: WireEndpoint
}

export type SignalType = 'item' | 'fluid' | 'virtual' | 'entity' | 'recipe' | 'space-location' | 'asteroid-chunk' | 'quality'

// SignalID чертежа: type опускается у предметов (по умолчанию item).
export interface SignalID {
  name?: string
  type?: SignalType
  quality?: string
}

export interface NetworkSelection {
  red?: boolean
  green?: boolean
}

export type ArithmeticOperation = '+' | '-' | '*' | '/' | '%' | '^' | '<<' | '>>' | 'AND' | 'OR' | 'XOR'
export type Comparator = '=' | '>' | '<' | '>=' | '<=' | '!=' | '≥' | '≤' | '≠'

export interface ArithmeticParameters {
  first_signal?: SignalID
  first_constant?: number
  first_signal_networks?: NetworkSelection
  operation?: ArithmeticOperation
  second_signal?: SignalID
  second_constant?: number
  second_signal_networks?: NetworkSelection
  output_signal?: SignalID
}
export interface ArithmeticControlBehavior {
  arithmetic_conditions?: ArithmeticParameters
  [key: string]: unknown
}

export interface DeciderCondition {
  first_signal?: SignalID
  first_signal_networks?: NetworkSelection
  comparator?: Comparator
  second_signal?: SignalID
  second_signal_networks?: NetworkSelection
  constant?: number
  compare_type?: 'and' | 'or'
}
export interface DeciderOutput {
  signal?: SignalID
  // true — копировать значение входа, иначе выводится constant (по
  // умолчанию 1)
  copy_count_from_input?: boolean
  constant?: number
  networks?: NetworkSelection
}
export interface DeciderControlBehavior {
  decider_conditions?: {
    conditions?: DeciderCondition[]
    outputs?: DeciderOutput[]
    // 2.1: выходы, когда условие НЕ выполнено — сохраняются как есть
    else_outputs?: DeciderOutput[]
  }
  [key: string]: unknown
}

export interface ConstantFilter {
  index?: number
  type?: SignalType
  name?: string
  quality?: string
  comparator?: Comparator
  count?: number
}
export interface ConstantSection {
  index?: number
  filters?: ConstantFilter[]
  group?: string
  multiplier?: number
  active?: boolean
}
export interface ConstantControlBehavior {
  sections?: { sections?: ConstantSection[] }
  is_on?: boolean
  [key: string]: unknown
}

export type SelectorOperation =
  | 'select' | 'count' | 'random' | 'stack-size' | 'rocket-capacity'
  | 'quality-filter' | 'quality-transfer' | 'quality-select' | 'time'

// Поля SelectorCombinatorParameters (runtime-api) — у всех режимов в одном
// объекте control_behavior, как в чертеже.
export interface SelectorControlBehavior {
  operation?: SelectorOperation
  // select
  select_max?: boolean
  index_signal?: SignalID
  index_constant?: number
  index_comparator?: Comparator
  // count
  count_signal?: SignalID
  // random
  random_update_interval?: number
  // quality-filter
  quality_filter?: { quality?: string; comparator?: Comparator }
  // quality-select
  select_highest_quality?: boolean
  // quality-transfer
  quality_destination_signal?: SignalID
  quality_source_signal?: SignalID
  quality_source_static?: string
  select_quality_from_signal?: boolean
  [key: string]: unknown
}

// Любой control_behavior (манипуляторы, лампы, столбы и т.д. — без окна
// настройки, но сохраняются как есть).
export type ControlBehavior = Record<string, unknown>
