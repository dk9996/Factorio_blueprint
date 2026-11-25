// В деве бэкенд живёт отдельно (порт 8000) от Vite dev-сервера (5173) —
// дефолты ниже это отражают. В проде (сборка за Caddy, см. DEPLOY.md)
// фронт и бэк на одном домене: VITE_API_BASE=/api (относительный путь,
// чтобы cookie-сессия работала без CORS), VITE_SERVER_ORIGIN='' (пустая
// строка — resolveAssetUrl ниже просто возвращает путь как есть).
const API_BASE = import.meta.env.VITE_API_BASE ?? 'http://localhost:8000/api'
const SERVER_ORIGIN = import.meta.env.VITE_SERVER_ORIGIN ?? 'http://localhost:8000'

// CSRF-токен — НЕ cookie (фронт на 5173, бэк на 8000 — разные origin,
// document.cookie с другого origin не читается, см. отчёт по задаче про
// auth). Токен приходит в JSON-теле ответов register/login/me/refresh
// (см. lib/api/auth.ts/store/authStore.ts) и хранится здесь в памяти —
// подставляется в заголовок на мутирующих запросах (не на GET/HEAD).
let csrfToken: string | null = null
export function setCsrfToken(token: string | null): void {
  csrfToken = token
}

// Колбэк на финальный провал refresh (не импортируем authStore сюда напрямую
// — цикл store->lib/api->store, см. authStore.ts, который сам
// регистрирует этот колбэк один раз).
let onAuthExpired: (() => void) | null = null
export function setOnAuthExpired(fn: () => void): void {
  onAuthExpired = fn
}

async function request<T>(path: string, options?: RequestInit, _retried = false): Promise<T> {
  const method = (options?.method ?? 'GET').toUpperCase()
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  if (method !== 'GET' && method !== 'HEAD' && csrfToken) {
    headers['X-CSRF-Token'] = csrfToken
  }
  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers,
    credentials: 'include',
  })

  if (res.status === 401 && !_retried && path !== '/auth/refresh' && path !== '/auth/login') {
    const refreshed = await fetch(`${API_BASE}/auth/refresh`, {
      method: 'POST',
      credentials: 'include',
    })
    if (refreshed.ok) {
      const body = await refreshed.json().catch(() => null)
      if (body && typeof body.csrf_token === 'string') setCsrfToken(body.csrf_token)
      return request<T>(path, options, true)
    }
    // Рефреш тоже не удался — сессия окончательно мертва, сбрасываем
    // локальное состояние авторизации (см. authStore.ts). Ниже по коду всё
    // равно бросится ошибка из исходного (ещё не перевыполненного) res.
    onAuthExpired?.()
  }

  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`API ${res.status}: ${text || res.statusText}`)
  }
  return res.json() as Promise<T>
}

export function isBlankIcon(icon: string | null | undefined): boolean {
  return !!icon && icon.endsWith('/blank.png')
}

export const api = {
  get: <T>(path: string) => request<T>(path),
  post: <T>(path: string, body: unknown) =>
    request<T>(path, { method: 'POST', body: JSON.stringify(body) }),
  put: <T>(path: string, body: unknown) =>
    request<T>(path, { method: 'PUT', body: JSON.stringify(body) }),
  patch: <T>(path: string, body: unknown) =>
    request<T>(path, { method: 'PATCH', body: JSON.stringify(body) }),
  delete: <T>(path: string) => request<T>(path, { method: 'DELETE' }),
}

// Иконки с бэкенда приходят как относительные пути ('/assets/foo.png'),
// но раздаёт их backend-сервер (порт 8000), а не Vite dev-сервер (5173) —
// поэтому URL нужно достраивать до полного адреса бэкенда.
export function resolveAssetUrl(path: string): string {
  if (path.startsWith('http')) return path
  return `${SERVER_ORIGIN}${path}`
}
