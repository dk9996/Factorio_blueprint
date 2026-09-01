const API_BASE = 'http://localhost:8000/api'
const SERVER_ORIGIN = 'http://localhost:8000'

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  })
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`API ${res.status}: ${text || res.statusText}`)
  }
  return res.json() as Promise<T>
}

export const api = {
  get: <T>(path: string) => request<T>(path),
  post: <T>(path: string, body: unknown) =>
    request<T>(path, { method: 'POST', body: JSON.stringify(body) }),
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