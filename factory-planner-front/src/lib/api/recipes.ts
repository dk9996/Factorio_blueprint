import { api } from './client'

export interface RecipeIngredient {
  name: string
  amount: number
  type: 'item' | 'fluid'
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
}

export const recipesApi = {
  list: () => api.get<Recipe[]>('/entities/recipes'),
}