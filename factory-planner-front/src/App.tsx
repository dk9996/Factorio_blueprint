import { useEffect } from 'react'
import { AppLayout } from './components/layout/AppLayout'
import { useTabsStore } from './store/tabsStore'
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

  return <AppLayout />
}