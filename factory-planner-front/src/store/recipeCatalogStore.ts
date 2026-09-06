import { create } from 'zustand'
import { recipesApi, type Recipe } from '../lib/api/recipes'
import { resolveAssetUrl } from '../lib/api/client'

interface RecipeCatalogStore {
  recipes: Recipe[]
  loading: boolean
  error: string | null
  fetchRecipes: () => Promise<void>
}

export const useRecipeCatalogStore = create<RecipeCatalogStore>((set) => ({
  recipes: [],
  loading: false,
  error: null,

  fetchRecipes: async () => {
    set({ loading: true, error: null })
    try {
      const recipes = await recipesApi.list()
      const resolved = recipes.map((r) => ({
        ...r,
        icon: r.icon ? resolveAssetUrl(r.icon) : null,
        displayCategoryIcon: r.displayCategoryIcon ? resolveAssetUrl(r.displayCategoryIcon) : null,
      }))
      set({ recipes: resolved, loading: false })
    } catch (err) {
      set({
        loading: false,
        error: err instanceof Error ? err.message : 'Failed to load recipes',
      })
    }
  },
}))