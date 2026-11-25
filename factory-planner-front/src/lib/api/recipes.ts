import { api } from './client'

export interface RecipeIngredient {
  name: string
  amount: number
  type: 'item' | 'fluid'
  icon: string | null
  hidden: boolean
  // Только у type==='fluid' — для подсказок жидкостных портов
  // (см. src/lib/ioHints.ts), у предметных ингредиентов всегда null.
  fluidboxIndex: number | null
  color: [number, number, number] | null
}

export interface Recipe {
  name: string
  label: string
  category: string
  energyRequired: number
  icon: string | null
  ingredients: RecipeIngredient[]
  results: RecipeIngredient[]
  hidden: boolean
  displayCategory: string
  displayCategoryId: string
  displayCategoryOrder: string
  displayCategoryIcon: string | null
  subgroup: string
  subgroupOrder: string
  itemOrder: string
  // Допустимые эффекты модулей (см. lib/modules.ts). Продуктивность по
  // умолчанию запрещена, остальные — разрешены (значения уже разрешены
  // бэкендом).
  allowProductivity: boolean
  allowSpeed: boolean
  allowConsumption: boolean
  allowPollution: boolean
  allowQuality: boolean
  allowedModuleCategories: string[] | null
}

export const recipesApi = {
  // encodeURIComponent обязателен — см. комментарий в lib/api/entities.ts.
  list: (profile = 'base') => api.get<Recipe[]>(`/entities/recipes?profile=${encodeURIComponent(profile)}`),
}