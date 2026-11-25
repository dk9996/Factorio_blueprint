import { useState } from 'react'
import { useAuthStore } from '../../store/authStore'
import { useUiStore } from '../../store/uiStore'
import { parseAuthError } from '../../lib/api/auth'

export function LoginPage() {
  const login = useAuthStore((s) => s.login)
  const returnTo = useUiStore((s) => s.returnTo)
  const setView = useUiStore((s) => s.setView)

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [generalError, setGeneralError] = useState<string | null>(null)
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})

  function validate(): boolean {
    const errors: Record<string, string> = {}
    if (!email.trim()) errors.email = 'Укажите email'
    if (!password) errors.password = 'Укажите пароль'
    setFieldErrors(errors)
    return Object.keys(errors).length === 0
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setGeneralError(null)
    if (!validate()) return
    setSubmitting(true)
    try {
      await login(email.trim(), password)
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
        <div className="auth-subtitle">Вход</div>

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
          <span className="sf-label">Пароль</span>
          <div className="auth-password-row">
            <input
              className="auth-input"
              type={showPassword ? 'text' : 'password'}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
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

        <button className="auth-submit" type="submit" disabled={submitting}>
          {submitting ? 'Входим…' : 'Войти'}
        </button>

        <div className="auth-switch">
          Нет аккаунта?{' '}
          <button type="button" className="auth-switch-link" onClick={() => setView('register')}>
            Зарегистрироваться
          </button>
        </div>
      </form>
    </div>
  )
}
