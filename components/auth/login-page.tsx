'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Lock, Mail, Loader2, ArrowLeft, IdCard, CheckCircle2 } from 'lucide-react'
import { supabase } from '@/lib/supabase'

type Mode = 'login' | 'forgot' | 'register'

const inputWrap =
  'flex items-center gap-2 px-3 py-2.5 rounded-xl border border-border bg-background focus-within:border-primary transition-colors'
const inputClass =
  'flex-1 bg-transparent text-sm text-foreground placeholder:text-muted-foreground outline-none'
const labelClass = 'text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1.5 block'
const buttonClass =
  'w-full py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-semibold hover:opacity-90 transition-opacity disabled:opacity-60 flex items-center justify-center gap-2'

export function LoginPage() {
  const [mode, setMode] = useState<Mode>('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [dni, setDni] = useState('')
  const [password2, setPassword2] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [info, setInfo] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const switchMode = (m: Mode) => {
    setMode(m)
    setError(null)
    setInfo(null)
    setPassword('')
    setPassword2('')
  }

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setLoading(true)
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) {
      setError(
        error.message === 'Invalid login credentials'
          ? 'Email o contraseña incorrectos'
          : error.message
      )
      setLoading(false)
    }
    // Si el login es exitoso, onAuthStateChange redibuja la app.
  }

  const handleForgot = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setLoading(true)
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
      redirectTo: `${window.location.origin}/sistema/recuperar`,
    })
    setLoading(false)
    if (error) {
      setError('No se pudo enviar el email. Esperá unos minutos y probá de nuevo.')
      return
    }
    setInfo(
      'Si ese email tiene una cuenta, te mandamos un enlace para crear una contraseña nueva. Revisá también el spam.'
    )
  }

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    if (password !== password2) {
      setError('Las contraseñas no coinciden')
      return
    }
    setLoading(true)
    try {
      const res = await fetch('/api/portal/registro', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim(), dni, password }),
      })
      const json = await res.json().catch(() => null)
      if (!res.ok) {
        setError(json?.error ?? 'No se pudo crear la cuenta')
        setLoading(false)
        return
      }
      // Cuenta creada y vinculada: entra directo al portal
      const { error: loginError } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      })
      if (loginError) {
        setInfo('Cuenta creada. Ingresá con tu email y contraseña.')
        switchMode('login')
        setLoading(false)
      }
    } catch {
      setError('No se pudo crear la cuenta. Revisá tu conexión.')
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <div className="w-full max-w-sm">
        <div className="flex flex-col items-center mb-8">
          <div className="w-14 h-14 rounded-2xl bg-primary flex items-center justify-center mb-4">
            <span className="text-primary-foreground font-serif font-bold text-2xl">P</span>
          </div>
          <h1 className="font-serif text-2xl font-semibold text-foreground">PilatesStudio</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {mode === 'register' ? 'Creá tu acceso al portal' : mode === 'forgot' ? 'Recuperar contraseña' : 'Sistema de Gestión'}
          </p>
        </div>

        {mode === 'login' && (
          <form onSubmit={handleLogin} className="bg-card rounded-2xl border border-border p-6 space-y-4 shadow-sm">
            <div>
              <label className={labelClass}>Email</label>
              <div className={inputWrap}>
                <Mail className="w-4 h-4 text-muted-foreground shrink-0" />
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="tu@email.com"
                  required
                  autoComplete="email"
                  className={inputClass}
                />
              </div>
            </div>

            <div>
              <label className={labelClass}>Contraseña</label>
              <div className={inputWrap}>
                <Lock className="w-4 h-4 text-muted-foreground shrink-0" />
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  required
                  autoComplete="current-password"
                  className={inputClass}
                />
              </div>
              <button
                type="button"
                onClick={() => switchMode('forgot')}
                className="mt-1.5 text-xs text-primary font-medium hover:underline"
              >
                ¿Olvidaste tu contraseña?
              </button>
            </div>

            {info && (
              <p className="text-sm text-[#2E6040] bg-[#E8F2EB] rounded-xl px-3 py-2">{info}</p>
            )}
            {error && (
              <p className="text-sm text-destructive bg-destructive/10 rounded-xl px-3 py-2">{error}</p>
            )}

            <button type="submit" disabled={loading} className={buttonClass}>
              {loading && <Loader2 className="w-4 h-4 animate-spin" />}
              {loading ? 'Ingresando...' : 'Ingresar'}
            </button>

            <p className="text-center text-xs text-muted-foreground pt-1">
              ¿Sos alumna del estudio y no tenés cuenta?{' '}
              <button
                type="button"
                onClick={() => switchMode('register')}
                className="text-primary font-semibold hover:underline"
              >
                Creá tu acceso
              </button>
            </p>
          </form>
        )}

        {mode === 'forgot' && (
          <form onSubmit={handleForgot} className="bg-card rounded-2xl border border-border p-6 space-y-4 shadow-sm">
            <p className="text-sm text-muted-foreground">
              Ingresá el email de tu cuenta y te mandamos un enlace para crear una contraseña nueva.
            </p>
            <div>
              <label className={labelClass}>Email</label>
              <div className={inputWrap}>
                <Mail className="w-4 h-4 text-muted-foreground shrink-0" />
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="tu@email.com"
                  required
                  autoComplete="email"
                  className={inputClass}
                />
              </div>
            </div>

            {info && (
              <p className="text-sm text-[#2E6040] bg-[#E8F2EB] rounded-xl px-3 py-2 flex items-start gap-2">
                <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" /> <span>{info}</span>
              </p>
            )}
            {error && (
              <p className="text-sm text-destructive bg-destructive/10 rounded-xl px-3 py-2">{error}</p>
            )}

            <button type="submit" disabled={loading || !!info} className={buttonClass}>
              {loading && <Loader2 className="w-4 h-4 animate-spin" />}
              {loading ? 'Enviando...' : 'Enviarme el enlace'}
            </button>

            <button
              type="button"
              onClick={() => switchMode('login')}
              className="w-full text-center text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              Volver a ingresar
            </button>
          </form>
        )}

        {mode === 'register' && (
          <form onSubmit={handleRegister} className="bg-card rounded-2xl border border-border p-6 space-y-4 shadow-sm">
            <p className="text-sm text-muted-foreground">
              Usá el <strong>mismo email y DNI</strong> que dejaste en el estudio: con eso encontramos
              tu ficha y te damos acceso a tus clases, membresía y pagos.
            </p>
            <div>
              <label className={labelClass}>Email</label>
              <div className={inputWrap}>
                <Mail className="w-4 h-4 text-muted-foreground shrink-0" />
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="tu@email.com"
                  required
                  autoComplete="email"
                  className={inputClass}
                />
              </div>
            </div>
            <div>
              <label className={labelClass}>DNI</label>
              <div className={inputWrap}>
                <IdCard className="w-4 h-4 text-muted-foreground shrink-0" />
                <input
                  type="text"
                  inputMode="numeric"
                  value={dni}
                  onChange={(e) => setDni(e.target.value)}
                  placeholder="Sin puntos"
                  required
                  className={inputClass}
                />
              </div>
            </div>
            <div>
              <label className={labelClass}>Contraseña</label>
              <div className={inputWrap}>
                <Lock className="w-4 h-4 text-muted-foreground shrink-0" />
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Mínimo 6 caracteres"
                  required
                  minLength={6}
                  autoComplete="new-password"
                  className={inputClass}
                />
              </div>
            </div>
            <div>
              <label className={labelClass}>Repetir contraseña</label>
              <div className={inputWrap}>
                <Lock className="w-4 h-4 text-muted-foreground shrink-0" />
                <input
                  type="password"
                  value={password2}
                  onChange={(e) => setPassword2(e.target.value)}
                  placeholder="••••••••"
                  required
                  minLength={6}
                  autoComplete="new-password"
                  className={inputClass}
                />
              </div>
            </div>

            {error && (
              <p className="text-sm text-destructive bg-destructive/10 rounded-xl px-3 py-2">{error}</p>
            )}

            <button type="submit" disabled={loading} className={buttonClass}>
              {loading && <Loader2 className="w-4 h-4 animate-spin" />}
              {loading ? 'Creando tu acceso...' : 'Crear mi acceso'}
            </button>

            <button
              type="button"
              onClick={() => switchMode('login')}
              className="w-full text-center text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              Ya tengo cuenta, volver a ingresar
            </button>
          </form>
        )}

        <p className="text-center text-xs text-muted-foreground mt-6">
          Staff y alumnos de PilatesStudio
        </p>
        <Link
          href="/"
          className="mt-3 flex items-center justify-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          Volver al sitio
        </Link>
      </div>
    </div>
  )
}
