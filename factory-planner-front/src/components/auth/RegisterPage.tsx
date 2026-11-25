import { useState } from 'react'
import { useAuthStore } from '../../store/authStore'
import { useUiStore } from '../../store/uiStore'
import { parseAuthError } from '../../lib/api/auth'

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const USERNAME_RE = /^[A-Za-z0-9_-]+$/

export function RegisterPage() {
  const register = useAuthStore((s) => s.register)
  const returnTo = useUiStore((s) => s.returnTo)
  const setView = useUiStore((s) => s.setView)

  const [email, setEmail] = useState('')
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [passwordConfirm, setPasswordConfirm] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [generalError, setGeneralError] = useState<string | null>(null)
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})

  // Зеркалит серверную валидацию (см. app/schemas/auth.py:RegisterSchema) —
  // серверная ошибка всё равно приоритетнее и подменяет это сообщение
  // под тем же полем, если всё-таки прошло и не совпало на бэкенде
  // (например гонка двух регистраций с одним email).
  function validate(): boolean {
    const errors: Record<string, string> = {}
    if (!EMAIL_RE.test(email.trim())) errors.email = 'Введите корректный email'
    if (username.length < 3 || username.length > 32) {
      errors.username = 'Имя пользователя должно быть от 3 до 32 символов'
    } else if (!USERNAME_RE.test(username)) {
      errors.username = 'Имя пользователя может содержать только буквы, цифры, _ и -'
    }
    if (password.length < 8) errors.password = 'Пароль должен быть не менее 8 символов'
    else if (password.length > 128) errors.password = 'Пароль слишком длинный (максимум 128 символов)'
    if (passwordConfirm !== password) errors.passwordConfirm = 'Пароли не совпадают'
    setFieldErrors(errors)
    return Object.keys(errors).length === 0
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setGeneralError(null)
    if (!validate()) return
    setSubmitting(true)
    try {
      await register(email.trim(), username, password)
      setView(returnTo)
    } catch (err) {
      const info = parseAuthError(err)
      setGeneralError(info.general ?? null)
      setFieldErrors(info.fields ?? {})
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="auth-page">
      <form className="auth-card" onSubmit={handleSubmit}>
        <div className="auth-title">⛭ FACTORY PLANNER</div>
        <div className="auth-subtitle">Регистрация</div>

        {generalError && <div className="auth-error auth-error-general">{generalError}</div>}

        <label className="auth-field">
          <span className="sf-label">Email</span>
          <input
            className="auth-input"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="email"
            autoFocus
          />
          {fieldErrors.email && <div className="auth-error">{fieldErrors.email}</div>}
        </label>

        <label className="auth-field">
          <span className="sf-label">Имя пользователя</span>
          <input
            className="auth-input"
            type="text"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            autoComplete="username"
          />
          {fieldErrors.username && <div className="auth-error">{fieldErrors.username}</div>}
        </label>

        <label className="auth-field">
          <span className="sf-label">Пароль</span>
          <div className="auth-password-row">
            <input
              className="auth-input"
              type={showPassword ? 'text' : 'password'}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="new-password"
            />
            <button
              type="button"
              className="auth-toggle-password"
              onClick={() => setShowPassword((v) => !v)}
              tabIndex={-1}
            >
              {showPassword ? 'Скрыть' : 'Показать'}
            </button>
          </div>
          {fieldErrors.password && <div className="auth-error">{fieldErrors.password}</div>}
        </label>

        <label className="auth-field">
          <span className="sf-label">Подтверждение пароля</span>
          <input
            className="auth-input"
            type={showPassword ? 'text' : 'password'}
            value={passwordConfirm}
            onChange={(e) => setPasswordConfirm(e.target.value)}
            autoComplete="new-password"
          />
          {fieldErrors.passwordConfirm && <div className="auth-error">{fieldErrors.passwordConfirm}</div>}
        </label>

        <button className="auth-submit" type="submit" disabled={submitting}>
          {submitting ? 'Регистрируем…' : 'Зарегистрироваться'}
        </button>

        <div className="auth-switch">
          Уже есть аккаунт?{' '}
          <button type="button" className="auth-switch-link" onClick={() => setView('login')}>
            Войти
          </button>
        </div>
      </form>
    </div>
  )
}
