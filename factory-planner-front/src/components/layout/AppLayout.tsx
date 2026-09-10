import { useEffect } from 'react'
import { TopBar } from './TopBar'
import { FactoryList } from '../factory-list/FactoryList'
import { BlueprintCanvas } from '../canvas/BlueprintCanvas'
import { TabsBar } from '../canvas/TabsBar'
import { EntityPalette } from '../palette/EntityPalette'
import { Hotbar } from '../hotbar/Hotbar'
import { EntityPicker } from '../hotbar/EntityPicker'
import { useFactoryStore } from '../../store/factoryStore'
import { useEntityCatalogStore } from '../../store/entityCatalogStore'
import { useRecipeCatalogStore } from '../../store/recipeCatalogStore'

// внутри AppLayout:


export function AppLayout() {
  const fetchFactories = useFactoryStore((s) => s.fetchFactories)
  const fetchEntities = useEntityCatalogStore((s) => s.fetchEntities)
  const fetchRecipes = useRecipeCatalogStore((s) => s.fetchRecipes)

  useEffect(() => {
    fetchFactories()
    fetchEntities()
    fetchRecipes()
  }, [fetchFactories, fetchEntities, fetchRecipes])

  return (
    <div className="app">
      <TopBar />
      <div className="main">
        <FactoryList />
        <div className="canvas-column">
          <TabsBar />
          <BlueprintCanvas />
        </div>
        <EntityPalette />
      </div>
      <Hotbar />
      <EntityPicker />
    </div>
  )
}