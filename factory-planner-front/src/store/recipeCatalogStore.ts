import { create } from 'zustand'
import { recipesApi, type Recipe, type RecipeIngredient } from '../lib/api/recipes'
import { resolveAssetUrl } from '../lib/api/client'

// ← добавить эту функцию
function withResolvedStackIcon(stack: RecipeIngredient): RecipeIngredient {
  return { ...stack, icon: stack.icon ? resolveAssetUrl(stack.icon) : null }
}

interface RecipeCatalogStore {
  recipes: Recipe[]
  loading: boolean
  error: string | null
  activeProfile: string | null
  fetchRecipes: (profile?: string) => Promise<void>
}

export const useRecipeCatalogStore = create<RecipeCatalogStore>((set) => ({
  recipes: [],
  loading: false,
  error: null,
  activeProfile: null,

  fetchRecipes: async (profile = 'base') => {
    set({ loading: true, error: null })
    try {
      const recipes = await recipesApi.list(profile)
      const resolved = recipes.map((r) => ({
        ...r,
        icon: r.icon ? resolveAssetUrl(r.icon) : null,
        displayCategoryIcon: r.displayCategoryIcon ? resolveAssetUrl(r.displayCategoryIcon) : null,
        ingredients: r.ingredients.map(withResolvedStackIcon), // ← добавить
        results: r.results.map(withResolvedStackIcon),         // ← добавить
      }))
      set({ recipes: resolved, loading: false, activeProfile: profile })
    } catch (err) {
      set({
        loading: false,
        error: err instanceof Error ? err.message : 'Failed to load recipe catalog',
      })
    }
  },
}))