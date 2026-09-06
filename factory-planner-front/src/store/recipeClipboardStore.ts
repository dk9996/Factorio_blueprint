import { create } from 'zustand'

interface RecipeClipboardEntry {
  recipe: string | null
  craftingCategories: string[]
}

interface RecipeClipboardStore {
  entry: RecipeClipboardEntry | null
  copy: (recipe: string | null | undefined, craftingCategories: string[] | undefined) => void
}

export const useRecipeClipboardStore = create<RecipeClipboardStore>((set) => ({
  entry: null,
  copy: (recipe, craftingCategories) =>
    set({ entry: { recipe: recipe ?? null, craftingCategories: craftingCategories ?? [] } }),
}))
