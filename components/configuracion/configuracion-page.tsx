'use client'

import { useEffect, useState } from 'react'
import {
  CreditCard,
  Loader2,
  CheckCircle2,
  XCircle,
  ExternalLink,
  Eye,
  EyeOff,
  Settings,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { useData } from '@/lib/data-context'
import {
  getMpSettings,
  saveMpSettings,
  testMpConnection,
  type MpAccountInfo,
} from '@/lib/api'

function MercadoPagoSection() {
  const { profile, refresh } = useData()
  const isAdmin = profile?.role === 'admin'

  const [loading, setLoading] = useState(true)
  const [accessToken, setAccessToken] = useState('')
  const [publicKey, setPublicKey] = useState('')
  const [showToken, setShowToken] = useState(false)
  const [testing, setTesting] = useState(false)
  const [saving, setSaving] = useState(false)
  const [account, setAccount] = useState<MpAccountInfo | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [savedMsg, setSavedMsg] = useState(false)

  useEffect(() => {
    getMpSettings()
      .then((s) => {
        setAccessToken(s.accessToken)
        setPublicKey(s.publicKey)
        // si ya hay token guardado, verificamos el estado real de la conexión
        if (s.accessToken) {
          testMpConnection().then(setAccount).catch(() => setAccount(null))
        }
      })
      .catch(() => setError('No se pudo leer la configuración (¿corriste la migración 0002?)'))
      .finally(() => setLoading(false))
  }, [])

  const handleTest = async () => {
    setTesting(true)
    setError(null)
    try {
      const info = await testMpConnection(accessToken || undefined)
      setAccount(info)
    } catch (err) {
      setAccount(null)
      setError(err instanceof Error ? err.message : 'No se pudo probar la conexión')
    } finally {
      setTesting(false)
    }
  }

  const handleSave = async () => {
    setSaving(true)
    setError(null)
    setSavedMsg(false)
    try {
      await saveMpSettings({ accessToken, publicKey })
      await refresh()
      setSavedMsg(true)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo guardar')
    } finally {
      setSaving(false)
    }
  }

  const inputClass =
    'w-full px-3 py-2.5 rounded-xl border border-border bg-background text-sm text-foreground placeholder:text-muted-foreground outline-none focus:border-primary transition-colors font-mono'
  const labelClass =
    'text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1.5 block'

  return (
    <div className="bg-card rounded-2xl border border-border overflow-hidden">
      <div className="flex items-center justify-between px-5 py-4 border-b border-border">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-[#009EE3]/10 flex items-center justify-center">
            <CreditCard className="w-5 h-5 text-[#009EE3]" />
          </div>
          <div>
            <h2 className="text-sm font-bold text-foreground">Mercado Pago</h2>
            <p className="text-xs text-muted-foreground">
              Links de pago para membresías, con acreditación automática
            </p>
          </div>
        </div>
        {account ? (
          <span className="flex items-center gap-1.5 text-xs font-semibold text-[#2E6040] bg-[#E8F2EB] px-2.5 py-1 rounded-full">
            <CheckCircle2 className="w-3.5 h-3.5" />
            Conectado
          </span>
        ) : (
          <span className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground bg-muted px-2.5 py-1 rounded-full">
            <XCircle className="w-3.5 h-3.5" />
            Sin conectar
          </span>
        )}
      </div>

      <div className="px-5 py-5 space-y-4">
        {account && (
          <div className="bg-[#E8F2EB] rounded-xl px-4 py-3 text-sm text-[#2E6040]">
            Conectado como <strong>{account.nickname || account.email}</strong>
            {account.email && account.nickname ? ` (${account.email})` : ''}
          </div>
        )}

        <div className="bg-muted rounded-xl px-4 py-3 text-xs text-muted-foreground space-y-1.5">
          <p className="font-semibold text-foreground">Cómo conectar la cuenta del estudio:</p>
          <p>
            1. Entrá a{' '}
            <a
              href="https://www.mercadopago.com.ar/developers/panel/app"
              target="_blank"
              rel="noreferrer"
              className="text-primary font-medium hover:underline inline-flex items-center gap-0.5"
            >
              Mercado Pago Developers <ExternalLink className="w-3 h-3" />
            </a>{' '}
            con la cuenta de Mercado Pago del estudio.
          </p>
          <p>2. Creá una aplicación (nombre sugerido: PilatesStudio). En "Tipo de solución" elegí Pagos online → Checkout Pro.</p>
          <p>3. En la aplicación, andá a <strong>Credenciales de producción</strong> y copiá el <strong>Access Token</strong> y la <strong>Public Key</strong> acá abajo.</p>
          <p>4. Tocá <strong>Probar conexión</strong> y después <strong>Guardar</strong>. Listo — ya se pueden generar links de pago desde la pantalla Pagos.</p>
        </div>

        {loading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground py-2">
            <Loader2 className="w-4 h-4 animate-spin" /> Cargando configuración...
          </div>
        ) : (
          <>
            <div>
              <label className={labelClass}>Access Token (producción)</label>
              <div className="relative">
                <input
                  type={showToken ? 'text' : 'password'}
                  value={accessToken}
                  onChange={(e) => setAccessToken(e.target.value)}
                  placeholder="APP_USR-..."
                  disabled={!isAdmin}
                  className={cn(inputClass, 'pr-10', !isAdmin && 'opacity-60')}
                />
                <button
                  type="button"
                  onClick={() => setShowToken((s) => !s)}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  aria-label={showToken ? 'Ocultar token' : 'Mostrar token'}
                >
                  {showToken ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <div>
              <label className={labelClass}>Public Key (producción)</label>
              <input
                type="text"
                value={publicKey}
                onChange={(e) => setPublicKey(e.target.value)}
                placeholder="APP_USR-..."
                disabled={!isAdmin}
                className={cn(inputClass, !isAdmin && 'opacity-60')}
              />
            </div>

            {error && (
              <p className="text-sm text-destructive bg-destructive/10 rounded-xl px-3 py-2">{error}</p>
            )}
            {savedMsg && (
              <p className="text-sm text-[#2E6040] bg-[#E8F2EB] rounded-xl px-3 py-2">
                Configuración guardada. Ya se pueden generar links de pago desde Pagos.
              </p>
            )}

            {isAdmin ? (
              <div className="flex gap-3">
                <button
                  onClick={handleTest}
                  disabled={testing || !accessToken}
                  className="flex-1 py-2.5 rounded-xl border border-border text-sm font-semibold text-foreground hover:bg-muted transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {testing && <Loader2 className="w-4 h-4 animate-spin" />}
                  Probar conexión
                </button>
                <button
                  onClick={handleSave}
                  disabled={saving}
                  className="flex-1 py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-semibold hover:opacity-90 transition-opacity disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {saving && <Loader2 className="w-4 h-4 animate-spin" />}
                  Guardar
                </button>
              </div>
            ) : (
              <p className="text-xs text-muted-foreground">
                Solo el rol admin puede modificar estas credenciales.
              </p>
            )}
          </>
        )}
      </div>
    </div>
  )
}

export function ConfiguracionPage() {
  return (
    <div className="p-6 max-w-2xl space-y-6">
      <div className="flex items-center gap-2 text-sm font-semibold text-muted-foreground uppercase tracking-wide">
        <Settings className="w-4 h-4" />
        Integraciones
      </div>

      <MercadoPagoSection />

      <div className="bg-card rounded-2xl border border-dashed border-border px-5 py-4">
        <p className="text-xs text-muted-foreground">
          Próximamente: gestión de salas y profesores, usuarios y roles, avisos por WhatsApp,
          facturación electrónica.
        </p>
      </div>
    </div>
  )
}
