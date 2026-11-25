import { useEffect } from 'react'
import { TopBar } from './TopBar'
import { FactoryList } from '../factory-list/FactoryList'
import { BlueprintCanvas } from '../canvas/BlueprintCanvas'
import { TabsBar } from '../canvas/TabsBar'
import { EntityPalette } from '../palette/EntityPalette'
import { Hotbar } from '../hotbar/Hotbar'
import { EntityPicker } from '../hotbar/EntityPicker'
import { useFactoryStore } from '../../store/factoryStore'
import { useAuthStore } from '../../store/authStore'
import { useUiStore } from '../../store/uiStore'
import { useProjectAutosave } from '../../hooks/useProjectAutosave'
import { MainMenu } from '../menu/MainMenu'
import { LoginPage } from '../auth/LoginPage'
import { RegisterPage } from '../auth/RegisterPage'

// внутри AppLayout:


export function AppLayout() {
  const fetchFactories = useFactoryStore((s) => s.fetchFactories)
  const authStatus = useAuthStore((s) => s.status)
  const view = useUiStore((s) => s.view)

  useEffect(() => {
    // Публичный справочный эндпоинт (заводы) — без авторизации, грузим
    // независимо от authStatus. Каталог сущностей/рецептов — по
    // требованию при входе в редактор КОНКРЕТНОГО проекта (зависит от его
    // content_profile, см. lib/projects/projectSession.ts:openProjectInEditor),
    // не на маунте всего приложения — меню им не пользуется вовсе.
    fetchFactories()
  }, [fetchFactories])

  // Защита маршрутов: если гость попытался попасть в меню/редактор —
  // отправляем на /login, запоминая, куда вернуться после входа (см.
  // uiStore.ts:returnTo, LoginPage.tsx/RegisterPage.tsx). Эффектом, а не
  // прямо внутри рендера — иначе побочный эффект (setView) происходил бы
  // во время самого рендера этого же компонента.
  useEffect(() => {
    if (authStatus === 'unauthenticated' && (view === 'menu' || view === 'editor')) {
      useUiStore.getState().setView('login', { returnTo: view })
    }
  }, [authStatus, view])

  // Хук сам активен только когда view==='editor' (см. useProjectAutosave.ts) —
  // вызывается безусловно, чтобы не ломать правила хуков при переключении view.
  useProjectAutosave()

  if (authStatus === 'idle' || authStatus === 'loading') {
    return <div className="app-boot-splash">Загрузка…</div>
  }

  if (view === 'login') return <LoginPage />
  if (view === 'register') return <RegisterPage />

  if (view === 'menu') {
    return <MainMenu />
  }

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