import { useEffect } from 'react'
import { AppLayout } from './components/layout/AppLayout'
import { useAuthStore } from './store/authStore'
import { useTabsStore } from './store/tabsStore'
import { useUiStore } from './store/uiStore'
import './styles/theme.css'
import './styles/global.css'

export default function App() {
  useEffect(() => {
    function handleBeforeUnload(e: BeforeUnloadEvent) {
      const { tabs, isTabDirty } = useTabsStore.getState()
      const hasDirty = tabs.some((t) => isTabDirty(t.id))
      if (hasDirty) {
        e.preventDefault()
        e.returnValue = ''
      }
    }
    window.addEventListener('beforeunload', handleBeforeUnload)
    return () => window.removeEventListener('beforeunload', handleBeforeUnload)
  }, [])

  // Авторизация: /login и /register — единственные настоящие URL в
  // приложении (остальное — view-стейт без роутера, см. uiStore.ts). На
  // маунте — разобрать текущий путь (прямой заход/перезагрузка на /login)
  // и запросить /api/auth/me, чтобы восстановить сессию.
  useEffect(() => {
    const path = window.location.pathname
    if (path === '/login') useUiStore.setState({ view: 'login' })
    else if (path === '/register') useUiStore.setState({ view: 'register' })

    function handlePopState() {
      const p = window.location.pathname
      if (p === '/login') useUiStore.setState({ view: 'login' })
      else if (p === '/register') useUiStore.setState({ view: 'register' })
      else useUiStore.setState((s) => ({ view: s.activeProjectId ? 'editor' : 'menu' }))
    }
    window.addEventListener('popstate', handlePopState)

    useAuthStore.getState().fetchMe()

    return () => window.removeEventListener('popstate', handlePopState)
  }, [])

  return <AppLayout />
}
