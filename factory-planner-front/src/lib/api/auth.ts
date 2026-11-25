import { api } from './client'

export interface AuthUser {
  id: string
  email: string
  username: string
  created_at: string
}

export interface AuthResponse {
  user: AuthUser
  csrf_token: string
}

export interface RefreshResponse {
  csrf_token: string
}

export const authRepository = {
  register: (email: string, username: string, password: string) =>
    api.post<AuthResponse>('/auth/register', { email, username, password }),
  login: (email: string, password: string) =>
    api.post<AuthResponse>('/auth/login', { email, password }),
  logout: () => api.post<{ ok: boolean }>('/auth/logout', {}),
  me: () => api.get<AuthResponse>('/auth/me'),
  refresh: () => api.post<RefreshResponse>('/auth/refresh', {}),
}

export interface AuthErrorInfo {
  // Общая ошибка (над формой) — generic-сообщение логина, лимит попыток,
  // сетевая ошибка и т.п.
  general?: string
  // Поштучные ошибки регистрации (409 занят email/username, 422 от
  // RegisterSchema-валидаторов в schemas/auth.py) — ключ = имя поля.
  fields?: Record<string, string>
}

function fieldsFromList(list: unknown[]): Record<string, string> {
  const fields: Record<string, string> = {}
  for (const e of list) {
    if (
      e &&
      typeof e === 'object' &&
      typeof (e as Record<string, unknown>).field === 'string' &&
      typeof (e as Record<string, unknown>).message === 'string'
    ) {
      fields[(e as Record<string, string>).field] = (e as Record<string, string>).message
    }
  }
  return fields
}

// client.ts бросает Error('API <status>: <тело ответа>') — тело для
// /api/auth/* бывает трёх видов: {detail: string} (общие бизнес-ошибки —
// неверный пароль, лимит попыток), {detail: [{field,message}]} (409 —
// занят email/username, см. api/auth.py) или {errors: [{field,message}]}
// (422 от валидаторов RegisterSchema, см.
// main.py:auth_validation_exception_handler) — два последних вида
// показываются под конкретным полем формы, первый — общей строкой.
export function parseAuthError(err: unknown): AuthErrorInfo {
  if (!(err instanceof Error)) return { general: 'Неизвестная ошибка' }
  if (err instanceof TypeError) return { general: 'Нет соединения с сервером' }

  const match = err.message.match(/^API \d+: ([\s\S]*)$/)
  if (!match) return { general: err.message }

  try {
    const body = JSON.parse(match[1])
    if (Array.isArray(body?.errors)) return { fields: fieldsFromList(body.errors) }
    if (Array.isArray(body?.detail)) return { fields: fieldsFromList(body.detail) }
    if (typeof body?.detail === 'string') return { general: body.detail }
  } catch {
    // тело не JSON — покажем как есть
  }
  return { general: match[1] }
}
