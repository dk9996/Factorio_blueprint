import { useMemo } from 'react'
import { useRecipeCatalogStore } from '../store/recipeCatalogStore'
import { isBlankIcon } from '../lib/api/client'

export interface DerivedItem {
  name: string
  icon: string
  label: string
  category: string
  categoryId: string
  categoryOrder: string
  categoryIcon: string | null
  subgroup: string
  subgroupOrder: string
  itemOrder: string
}

const OTHER_CATEGORY = {
  category: 'Прочее',
  categoryId: 'other',
  categoryOrder: 'zzz',
  categoryIcon: null as string | null,
  subgroup: 'other',
  subgroupOrder: 'zzz',
}

// Отдельного каталога предметов на бэкенде нет — собираем список предметов
// из уже загруженного каталога рецептов: ingredients+results всех рецептов
// в сумме содержат практически все предметы игры с иконкой и типом.
// Метку и категорию/подгруппу берём у рецепта, который производит ровно
// этот один предмет (обычная для Factorio связь 1 предмет — 1 рецепт).
// Для предметов без такого рецепта (сырьё вроде руды, которое не
// крафтится, а добывается) — техническое имя и категория "Прочее" в конце.
export function useDerivedItems(): DerivedItem[] {
  const recipes = useRecipeCatalogStore((s) => s.recipes)

  return useMemo(() => {
    const infoByName = new Map<string, Omit<DerivedItem, 'name' | 'icon'>>()
    for (const r of recipes) {
      if (r.results.length !== 1) continue
      infoByName.set(r.results[0].name, {
        label: r.label,
        category: r.displayCategory,
        categoryId: r.displayCategoryId,
        categoryOrder: r.displayCategoryOrder,
        categoryIcon: r.displayCategoryIcon,
        subgroup: r.subgroup,
        subgroupOrder: r.subgroupOrder,
        itemOrder: r.itemOrder,
      })
    }

    const map = new Map<string, DerivedItem>()
    for (const r of recipes) {
      for (const stack of [...r.ingredients, ...r.results]) {
        if (stack.type !== 'item') continue
        if (stack.hidden) continue
        if (map.has(stack.name)) continue
        if (!stack.icon || isBlankIcon(stack.icon)) continue
        const info = infoByName.get(stack.name)
        map.set(stack.name, {
          name: stack.name,
          icon: stack.icon,
          label: info?.label ?? stack.name,
          category: info?.category ?? OTHER_CATEGORY.category,
          categoryId: info?.categoryId ?? OTHER_CATEGORY.categoryId,
          categoryOrder: info?.categoryOrder ?? OTHER_CATEGORY.categoryOrder,
          categoryIcon: info?.categoryIcon ?? OTHER_CATEGORY.categoryIcon,
          subgroup: info?.subgroup ?? OTHER_CATEGORY.subgroup,
          subgroupOrder: info?.subgroupOrder ?? OTHER_CATEGORY.subgroupOrder,
          itemOrder: info?.itemOrder ?? stack.name,
        })
      }
    }
    return Array.from(map.values())
  }, [recipes])
}