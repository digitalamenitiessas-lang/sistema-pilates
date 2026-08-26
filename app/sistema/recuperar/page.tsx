'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Lock, Loader2, CheckCircle2, XCircle } from 'lucide-react'
import { supabase } from '@/lib/supabase'

// Página a la que llega el enlace de "Olvidé mi contraseña". El cliente de
// Supabase detecta el token de la URL y abre una sesión de recuperación;
// acá solo se elige la contraseña nueva.

const inputWrap =
  'flex items-center gap-2 px-3 py-2.5 rounded-xl border border-border bg-background focus-within:border-primary transition-colors'
const inputClass =
  'flex-1 bg-transparent text-sm text-foreground placeholder:text-muted-foreground outline-none'
const labelClass = 'text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1.5 block'

export default function RecuperarPage() {
  const [status, setStatus] = useState<'checking' | 'ready' | 'done' | 'invalid'>('checking')
  const [password, setPassword] = useState('')
  const [password2, setPassword2] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    let cancelled = false

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (cancelled) return
      if (event === 'PASSWORD_RECOVERY' || session) setStatus('ready')
    })

    // Margen para que el cliente procese el token de la URL; si no hay
    // sesión para entonces, el enlace expiró o ya se usó.
    const timer = setTimeout(async () => {
      if (cancelled) return
      const { data: { session } } = await supabase.auth.getSession()
      setStatus((s) => (s === 'checking' ? (session ? 'ready' : 'invalid') : s))
    }, 2500)

    return () => {
      cancelled = true
      clearTimeout(timer)
      subscription.unsubscribe()
    }
  }, [])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    if (password !== password2) {
      setError('Las contraseñas no coinciden')
      return
    }
    setSaving(true)
    const { error } = await supabase.auth.updateUser({ password })
    setSaving(false)
    if (error) {
      setError(
        /same.*password|different from the old/i.test(error.message)
          ? 'La contraseña nueva tiene que ser distinta a la anterior'
          : 'No se pudo guardar la contraseña. Probá de nuevo.'
      )
      return
    }
    setStatus('done')
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <div className="w-full max-w-sm">
        <div className="flex flex-col items-center mb-8">
          <div className="w-14 h-14 rounded-2xl bg-primary flex items-center justify-center mb-4">
            <span className="text-primary-foreground font-serif font-bold text-2xl">P</span>
          </div>
          <h1 className="font-serif text-2xl font-semibold text-foreground">PilatesStudio</h1>
          <p className="text-sm text-muted-foreground mt-1">Nueva contraseña</p>
        </div>

        {status === 'checking' && (
          <div className="bg-card rounded-2xl border border-border p-8 flex flex-col items-center gap-3 shadow-sm">
            <Loader2 className="w-6 h-6 text-primary animate-spin" />
            <p className="text-sm text-muted-foreground">Verificando el enlace...</p>
          </div>
        )}

        {status === 'invalid' && (
          <div className="bg-card rounded-2xl border border-border p-8 flex flex-col items-center gap-3 text-center shadow-sm">
            <XCircle className="w-8 h-8 text-destructive" />
            <p className="text-sm font-semibold text-foreground">El enlace no es válido o venció</p>
            <p className="text-xs text-muted-foreground">
              Pedí uno nuevo desde &quot;¿Olvidaste tu contraseña?&quot; en la pantalla de ingreso.
            </p>
            <Link
              href="/sistema"
              className="mt-2 px-6 py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-semibold hover:opacity-90"
            >
              Ir al ingreso
            </Link>
          </div>
        )}

        {status === 'ready' && (
          <form onSubmit={handleSubmit} className="bg-card rounded-2xl border border-border p-6 space-y-4 shadow-sm">
            <div>
              <label className={labelClass}>Contraseña nueva</label>
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

            <button
              type="submit"
              disabled={saving}
              className="w-full py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-semibold hover:opacity-90 transition-opacity disabled:opacity-60 flex items-center justify-center gap-2"
            >
              {saving && <Loader2 className="w-4 h-4 animate-spin" />}
              {saving ? 'Guardando...' : 'Guardar contraseña'}
            </button>
          </form>
        )}

        {status === 'done' && (
          <div className="bg-card rounded-2xl border border-border p-8 flex flex-col items-center gap-3 text-center shadow-sm">
            <CheckCircle2 className="w-8 h-8 text-[#2E6040]" />
            <p className="text-sm font-semibold text-foreground">¡Contraseña actualizada!</p>
            <p className="text-xs text-muted-foreground">Ya podés usar el sistema con tu clave nueva.</p>
            <Link
              href="/sistema"
              className="mt-2 px-6 py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-semibold hover:opacity-90"
            >
              Entrar
            </Link>
          </div>
        )}
      </div>
    </div>
  )
}
