'use client'

/**
 * La pantalla que aparece la primera vez, y no se puede saltear.
 *
 * El acceso de una clienta nace con su documento como contraseña (decisión
 * del estudio, 17/09): así el mostrador no inventa ni dicta nada y el mail
 * que recibe le dice algo que ya sabe de memoria. El problema es que **el
 * documento no es un secreto** — es el mismo par mail + DNI por el que se
 * apagó el auto-registro en la 0057.
 *
 * Esta pantalla es lo que hace que el documento sirva UNA vez. Mientras la
 * cuenta tenga la marca `debe_cambiar_clave`, no se llega ni al portal ni
 * al sistema: no hay menú, no hay atrás, y la única salida es elegir una
 * contraseña propia.
 *
 * La marca se apaga en la MISMA llamada que fija la clave nueva
 * (`updateUser({ password, data })`), así no puede quedar una cuenta con
 * la clave cambiada y la marca puesta, ni al revés.
 *
 * No es una reja contra un atacante: quien quiera saltearla puede tocar su
 * propia metadata, y sólo se expone a sí mismo. Es lo que evita que
 * cuarenta clientas se queden para siempre con una contraseña que está
 * escrita en su ficha.
 */

import { useState } from 'react'
import { Lock, Loader2, LogOut } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useNombreDelEstudio } from '@/lib/estudio-client'
import { Logotipo } from '@/components/layout/logotipo'

const inputWrap =
  'flex items-center gap-2 px-3 py-2.5 rounded-xl border border-border bg-background focus-within:border-primary transition-colors'
const inputClass =
  'flex-1 bg-transparent text-sm text-foreground placeholder:text-muted-foreground outline-none'
const labelClass = 'text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1.5 block'

export function CambiarClaveObligatorio({
  onListo,
  onSalir,
}: {
  onListo: () => void
  onSalir: () => void
}) {
  const estudio = useNombreDelEstudio()
  const [password, setPassword] = useState('')
  const [password2, setPassword2] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const guardar = async (e: React.FormEvent) => {
    e.preventDefault()
    if (password !== password2) return setError('Las dos contraseñas no coinciden')
    setSaving(true)
    setError(null)
    // La clave y la marca, en una sola llamada. Si Supabase rechaza la
    // clave —por corta o por igual a la anterior— la marca no se toca.
    const { error: err } = await supabase.auth.updateUser({
      password,
      data: { debe_cambiar_clave: false },
    })
    if (err) {
      setError(
        /different from the old|should be different/i.test(err.message)
          ? 'La contraseña nueva tiene que ser distinta a tu documento'
          : err.message || 'No se pudo cambiar la contraseña'
      )
      setSaving(false)
      return
    }
    onListo()
  }

  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center p-6">
      <div className="w-full max-w-sm">
        <div className="text-center mb-6">
          <Logotipo nombre={estudio} className="text-4xl text-foreground text-center" />
        </div>

        <form onSubmit={guardar} className="bg-card rounded-2xl border border-border p-6 space-y-4 shadow-sm">
          <div>
            <h1 className="text-base font-bold text-foreground">Elegí tu contraseña</h1>
            <p className="text-xs text-muted-foreground mt-1">
              Entraste con tu documento, que no es un secreto. Elegí una contraseña propia para
              seguir — es lo único que falta.
            </p>
          </div>

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
                autoFocus
                className={inputClass}
              />
            </div>
          </div>

          <div>
            <label className={labelClass}>Repetila</label>
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
            <p className="text-sm text-destructive-fuerte bg-destructive/10 rounded-xl px-3 py-2">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={saving}
            className="w-full py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-semibold hover:opacity-90 transition-opacity disabled:opacity-60 flex items-center justify-center gap-2"
          >
            {saving && <Loader2 className="w-4 h-4 animate-spin" />}
            {saving ? 'Guardando...' : 'Guardar y entrar'}
          </button>
        </form>

        {/* La única otra salida es irse. Sin esto, alguien que entró por
            error en el teléfono de otra persona queda encerrado. */}
        <button
          onClick={onSalir}
          className="w-full mt-4 py-2 text-xs font-semibold text-muted-foreground hover:text-foreground flex items-center justify-center gap-1.5"
        >
          <LogOut className="w-3.5 h-3.5" />
          Cerrar sesión
        </button>
      </div>
    </div>
  )
}
