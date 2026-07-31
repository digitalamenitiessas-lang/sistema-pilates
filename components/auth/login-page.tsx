'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Lock, Mail, Loader2, ArrowLeft } from 'lucide-react'
import { supabase } from '@/lib/supabase'

export function LoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
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

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <div className="w-full max-w-sm">
        <div className="flex flex-col items-center mb-8">
          <div className="w-14 h-14 rounded-2xl bg-primary flex items-center justify-center mb-4">
            <span className="text-primary-foreground font-serif font-bold text-2xl">P</span>
          </div>
          <h1 className="font-serif text-2xl font-semibold text-foreground">PilatesStudio</h1>
          <p className="text-sm text-muted-foreground mt-1">Sistema de Gestión</p>
        </div>

        <form
          onSubmit={handleSubmit}
          className="bg-card rounded-2xl border border-border p-6 space-y-4 shadow-sm"
        >
          <div>
            <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1.5 block">
              Email
            </label>
            <div className="flex items-center gap-2 px-3 py-2.5 rounded-xl border border-border bg-background focus-within:border-primary transition-colors">
              <Mail className="w-4 h-4 text-muted-foreground shrink-0" />
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="tu@email.com"
                required
                autoComplete="email"
                className="flex-1 bg-transparent text-sm text-foreground placeholder:text-muted-foreground outline-none"
              />
            </div>
          </div>

          <div>
            <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1.5 block">
              Contraseña
            </label>
            <div className="flex items-center gap-2 px-3 py-2.5 rounded-xl border border-border bg-background focus-within:border-primary transition-colors">
              <Lock className="w-4 h-4 text-muted-foreground shrink-0" />
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                required
                autoComplete="current-password"
                className="flex-1 bg-transparent text-sm text-foreground placeholder:text-muted-foreground outline-none"
              />
            </div>
          </div>

          {error && (
            <p className="text-sm text-destructive bg-destructive/10 rounded-xl px-3 py-2">{error}</p>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-semibold hover:opacity-90 transition-opacity disabled:opacity-60 flex items-center justify-center gap-2"
          >
            {loading && <Loader2 className="w-4 h-4 animate-spin" />}
            {loading ? 'Ingresando...' : 'Ingresar'}
          </button>
        </form>

        <p className="text-center text-xs text-muted-foreground mt-6">
          Acceso exclusivo para el personal del estudio
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
