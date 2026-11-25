import { create } from 'zustand'
import { authRepository, type AuthUser } from '../lib/api/auth'
import { setCsrfToken, setOnAuthExpired } from '../lib/api/client'

interface AuthStore {
  user: AuthUser | null
  status: 'idle' | 'loading' | 'authenticated' | 'unauthenticated'
  fetchMe: () => Promise<void>
  login: (email: string, password: string) => Promise<void>
  register: (email: string, username: string, password: string) => Promise<void>
  logout: () => Promise<void>
}

export const useAuthStore = create<AuthStore>((set) => ({
  user: null,
  status: 'idle',

  fetchMe: async () => {
    set({ status: 'loading' })
    try {
      const res = await authRepository.me()
      setCsrfToken(res.csrf_token)
      set({ user: res.user, status: 'authenticated' })
    } catch {
      // Ожидаемый путь для гостя (ещё не логинился/сессия истекла) — не
      // ошибка, просто "неавторизован", ничего не показываем пользователю.
      setCsrfToken(null)
      set({ user: null, status: 'unauthenticated' })
    }
  },

  // login/register бросают исключение наверх (не глотают, в отличие от
  // fetchMe) — страницам (LoginPage/RegisterPage) нужен точный текст
  // ошибки для показа под нужным полем, см. lib/api/auth.ts:parseAuthError.
  login: async (email, password) => {
    const res = await authRepository.login(email, password)
    setCsrfToken(res.csrf_token)
    set({ user: res.user, status: 'authenticated' })
  },

  register: async (email, username, password) => {
    const res = await authRepository.register(email, username, password)
    setCsrfToken(res.csrf_token)
    set({ user: res.user, status: 'authenticated' })
  },

  logout: async () => {
    try {
      await authRepository.logout()
    } catch {
      // Best-effort, как returnToMenu в lib/projects/projectSession.ts —
      // сеть недоступна и т.п. не должно мешать выйти локально.
    }
    setCsrfToken(null)
    set({ user: null, status: 'unauthenticated' })
  },
}))

// Колбэк на окончательный провал refresh внутри lib/api/client.ts —
// регистрируется один раз при загрузке модуля (не импортируем authStore
// напрямую в client.ts, чтобы не получить цикл store -> lib/api -> store).
setOnAuthExpired(() => {
  setCsrfToken(null)
  useAuthStore.setState({ user: null, status: 'unauthenticated' })
})
