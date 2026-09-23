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
  Users,
  UserPlus,
  DoorOpen,
  Plus,
  Pencil,
  Trash2,
  Check,
  X,
  SlidersHorizontal,
  Building2,
  Shapes,
  Wallet,
  ShieldCheck,
  Info,
  Lock,
  UserMinus,
  RotateCcw,
  ChevronsUpDown,
  ChevronsDownUp,
  Landmark,
  Tag,
  Send,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { useData, useStudio } from '@/lib/data-context'
import {
  SeccionPlegable,
  SeccionesPlegables,
  useSeccionesPlegables,
} from '@/components/ui/seccion-plegable'
import {
  getMpSettings,
  saveMpSettings,
  testMpConnection,
  createTeacher,
  updateTeacher,
  deactivateTeacher,
  createRoom,
  renameRoom,
  deactivateRoom,
  fetchProfiles,
  setTeacherUser,
  createSystemUser,
  deleteSystemUser,
  reactivateSystemUser,
  updateUserRole,
  createDiscipline,
  updateDiscipline,
  deactivateDiscipline,
  createPaymentMethod,
  renamePaymentMethod,
  setPaymentMethodActive,
  setPaymentMethodAjuste,
  saveSettings,
  fetchPermissionMatrix,
  setRolePermission,
  clearUserPermission,
  setUserPermission,
  fetchPromociones,
  createPromocion,
  updatePromocion,
  setPromocionRige,
  deactivatePromocion,
  anunciarPromocion,
  type MpAccountInfo,
  type TeacherInput,
  type DisciplineInput,
  type PromocionInput,
} from '@/lib/api'
import {
  fetchAccounts,
  createAccount,
  updateAccount,
  deactivateAccount,
  setMethodAccount,
  type AccountInput,
} from '@/lib/caja-api'
import type {
  Account,
  AccountKind,
  Discipline,
  DisciplineItem,
  PermissionKey,
  PermissionMatrix,
  Profile,
  Role,
  Promocion,
  SettingGroup,
  StudioSetting,
  Teacher,
} from '@/lib/types'

const TEACHER_COLORS = ['#847164', '#9AA08C', '#BCBAAE', '#B79B72', '#8792A0', '#A5786C']

const ROLE_LABELS: Record<string, string> = {
  admin: 'Admin',
  recepcion: 'Recepción',
  profesor: 'Profesor/a',
  alumno: 'Cliente',
}

const inputClass =
  'w-full px-3 py-2.5 rounded-xl border border-border bg-background text-sm text-foreground placeholder:text-muted-foreground outline-none focus:border-primary transition-colors'
const labelClass =
  'text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1.5 block'

/**
 * Lo que muestra una sección cerrada: cuántas cosas tiene adentro. Sirve
 * para decidir si vale la pena abrirla sin abrirla. En pantalla angosta se
 * esconde — es un dato lindo de tener, no información que haga falta.
 */
function Conteo({ n, singular, plural }: { n: number; singular: string; plural: string }) {
  return (
    <span className="hidden sm:inline text-xs text-muted-foreground tabular-nums">
      {n} {n === 1 ? singular : plural}
    </span>
  )
}

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
    // Desde 0008 solo el admin lee las credenciales; recepción solo ve el
    // estado de conexión (el servidor prueba con el token guardado).
    if (!isAdmin) {
      testMpConnection().then(setAccount).catch(() => setAccount(null))
      setLoading(false)
      return
    }
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
  }, [isAdmin])

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
    <SeccionPlegable
      id="mercadopago"
      icono={CreditCard}
      colorIcono="bg-info/10 text-info-fuerte"
      titulo="Mercado Pago"
      ayuda="Links de pago para membresías, con acreditación automática"
      resumen={
        account ? (
          <span className="flex items-center gap-1.5 text-xs font-semibold text-exito-fuerte bg-exito-suave px-2.5 py-1 rounded-full">
            <CheckCircle2 className="w-3.5 h-3.5" />
            Conectado
          </span>
        ) : (
          <span className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground bg-muted px-2.5 py-1 rounded-full">
            <XCircle className="w-3.5 h-3.5" />
            Sin conectar
          </span>
        )
      }
    >
      <div className="px-5 py-5 space-y-4">
        {account && (
          <div className="bg-exito-suave rounded-xl px-4 py-3 text-sm text-exito-fuerte">
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
              className="text-primary-fuerte font-medium hover:underline inline-flex items-center gap-0.5"
            >
              Mercado Pago Developers <ExternalLink className="w-3 h-3" />
            </a>{' '}
            con la cuenta de Mercado Pago del estudio.
          </p>
          <p>2. Creá una aplicación con el nombre del estudio. En "Tipo de solución" elegí Pagos online → Checkout Pro.</p>
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
                {isAdmin && (
                  <button
                    type="button"
                    onClick={() => setShowToken((s) => !s)}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                    aria-label={showToken ? 'Ocultar token' : 'Mostrar token'}
                  >
                    {showToken ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                )}
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
              <p className="text-sm text-destructive-fuerte bg-destructive/10 rounded-xl px-3 py-2">{error}</p>
            )}
            {savedMsg && (
              <p className="text-sm text-exito-fuerte bg-exito-suave rounded-xl px-3 py-2">
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
    </SeccionPlegable>
  )
}

/**
 * Crear la cuenta de una profesora desde su propia fila.
 *
 * Hasta hoy eran dos pasos en dos secciones: crear el usuario en Accesos
 * y después venir acá a vincularlo, en ese orden y sin que nada lo
 * dijera. Una cuenta creada y no vinculada entra al sistema pero
 * `my_teacher_ids()` no la encuentra, así que el sistema no sabe qué
 * clases son suyas — existe y no sirve para lo que se creó.
 *
 * Es el mismo modal que la ficha de la clienta usa para su portal, con
 * el rol y el vínculo que le corresponden.
 */
function TeacherAccessModal({ teacher, onClose }: { teacher: Teacher; onClose: () => void }) {
  const { refresh } = useData()
  const [email, setEmail] = useState(teacher.email ?? '')
  const [password, setPassword] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)
    setError(null)
    try {
      await createSystemUser({
        email,
        password,
        fullName: teacher.name,
        role: 'profesor',
        teacherId: teacher.id,
      })
      await refresh()
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo crear la cuenta')
      setSaving(false)
    }
  }

  const inputClass =
    'w-full px-3 py-2.5 rounded-xl border border-border bg-background text-sm text-foreground placeholder:text-muted-foreground outline-none focus:border-primary transition-colors'
  const labelClass =
    'text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1.5 block'

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-foreground/20 backdrop-blur-sm" onClick={onClose}>
      <form
        onSubmit={handleSubmit}
        className="bg-card rounded-2xl shadow-2xl w-full max-w-md border border-border overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-6 py-4 border-b border-border">
          <h2 className="text-base font-bold text-foreground">Cuenta para entrar al sistema</h2>
          <p className="text-xs text-muted-foreground">{teacher.name}</p>
        </div>

        <div className="px-6 py-5 space-y-4">
          <div>
            <label className={labelClass}>Email de acceso *</label>
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required className={inputClass} />
            {/* El alta la crea confirmada, así que un dominio que el
                estudio no tenga sirve para entrar. Lo que no va a andar
                es recuperar la contraseña: ese mail no llega a ningún
                lado. Se dice acá y no después. */}
            <p className="text-[11px] text-muted-foreground mt-1.5">
              Si el dominio no es del estudio, la cuenta entra igual — pero "olvidé mi contraseña" no
              le va a llegar.
            </p>
          </div>
          <div>
            <label className={labelClass}>Contraseña inicial *</label>
            <input
              type="text"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={6}
              placeholder="Mínimo 6 caracteres"
              className={inputClass}
            />
            <p className="text-[11px] text-muted-foreground mt-1.5">
              Se la pasás y con eso entra. Conviene que la cambie: con su cuenta se ven los datos de
              las clientas.
            </p>
          </div>

          <p className="text-[11px] text-muted-foreground bg-muted rounded-xl px-3 py-2.5">
            La cuenta queda vinculada a esta ficha sola. Para que además pueda{' '}
            <span className="font-semibold">tomar asistencia</span> hacen falta los permisos de
            Reservas, y que ese grupo esté encendido.
          </p>

          {error && <p className="text-sm text-destructive-fuerte bg-destructive/10 rounded-xl px-3 py-2">{error}</p>}
        </div>

        <div className="flex gap-3 px-6 py-4 border-t border-border">
          <button type="button" onClick={onClose} className="flex-1 py-2.5 rounded-xl border border-border text-sm font-semibold text-muted-foreground hover:bg-muted transition-colors">
            Cancelar
          </button>
          <button type="submit" disabled={saving} className="flex-1 py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-semibold hover:opacity-90 disabled:opacity-60 flex items-center justify-center gap-2">
            {saving && <Loader2 className="w-4 h-4 animate-spin" />}
            Crear la cuenta
          </button>
        </div>
      </form>
    </div>
  )
}

function TeacherFormModal({ teacher, onClose }: { teacher?: Teacher; onClose: () => void }) {
  const { refresh } = useData()
  const { disciplines: catalog } = useStudio()
  const isEdit = !!teacher
  const [name, setName] = useState(teacher?.name ?? '')
  const [disciplines, setDisciplines] = useState<Discipline[]>(teacher?.disciplines ?? [])
  const [phone, setPhone] = useState(teacher?.phone ?? '')
  const [email, setEmail] = useState(teacher?.email ?? '')
  const [color, setColor] = useState(teacher?.color ?? TEACHER_COLORS[0])
  // La ficha laboral (0053). Existía en la base y ningún formulario la
  // escribía, que es el mismo modo de falla que tuvieron el contacto de
  // emergencia y las dos columnas de la 0022.
  const [fechaIngreso, setFechaIngreso] = useState(teacher?.laboral?.fechaIngreso ?? '')
  const [fechaBaja, setFechaBaja] = useState(teacher?.laboral?.fechaBaja ?? '')
  const [dni, setDni] = useState(teacher?.laboral?.dni ?? '')
  const [notasLaborales, setNotasLaborales] = useState(teacher?.laboral?.notasLaborales ?? '')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const toggleDiscipline = (d: Discipline) =>
    setDisciplines((prev) => (prev.includes(d) ? prev.filter((x) => x !== d) : [...prev, d]))

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (disciplines.length === 0) {
      setError('Seleccioná al menos una disciplina')
      return
    }
    setSaving(true)
    setError(null)
    const input: TeacherInput = {
      name, disciplines, phone, email, color,
      fechaIngreso, fechaBaja, dni, notasLaborales,
    }
    try {
      if (isEdit) await updateTeacher(teacher.id, input)
      else await createTeacher(input)
      await refresh()
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo guardar')
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-foreground/20 backdrop-blur-sm" onClick={onClose}>
      <form
        onSubmit={handleSubmit}
        className="bg-card rounded-2xl shadow-2xl w-full max-w-md border border-border overflow-hidden max-h-[90vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-6 py-4 border-b border-border shrink-0">
          <h2 className="text-base font-bold text-foreground">{isEdit ? 'Editar profesor/a' : 'Nuevo profesor/a'}</h2>
          <button type="button" onClick={onClose} className="w-8 h-8 rounded-full hover:bg-muted flex items-center justify-center text-muted-foreground">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="px-6 py-5 space-y-4 overflow-y-auto">
          <div>
            <label className={labelClass}>Nombre completo *</label>
            <input value={name} onChange={(e) => setName(e.target.value)} required placeholder="Ej: Carolina Paz" className={inputClass} />
          </div>
          <div>
            <label className={labelClass}>Disciplinas que dicta *</label>
            <div className="flex flex-wrap gap-2">
              {catalog.map((item) => {
                const d = item.name
                const active = disciplines.includes(d)
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => toggleDiscipline(d)}
                    className={cn(
                      'px-3 py-1.5 rounded-xl border text-xs font-medium transition-colors',
                      active
                        ? 'border-primary bg-primary/10 text-primary-fuerte'
                        : 'border-border text-muted-foreground hover:border-primary/40 hover:text-foreground'
                    )}
                  >
                    {d}
                  </button>
                )
              })}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={labelClass}>Teléfono</label>
              <input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+54 ..." className={inputClass} />
            </div>
            <div>
              <label className={labelClass}>Email</label>
              <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="profe@..." className={inputClass} />
            </div>
          </div>
          <div>
            <label className={labelClass}>Color en la agenda</label>
            <div className="flex gap-2 pt-1">
              {TEACHER_COLORS.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setColor(c)}
                  className={cn(
                    'w-6 h-6 rounded-full border-2 transition-colors',
                    color === c ? 'border-foreground' : 'border-transparent hover:border-foreground/30'
                  )}
                  style={{ backgroundColor: c }}
                />
              ))}
            </div>
          </div>
          {/* La ficha laboral (0053). Va acá y no en Personal porque es
              parte de quién es la persona, no de cuánto cobra: lo que
              cobra está en Personal, bajo su propia clave. */}
          <div className="pt-1 border-t border-border">
            <p className={cn(labelClass, 'pt-3')}>Ficha laboral</p>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-[11px] text-muted-foreground block mb-1">Fecha de ingreso</label>
                <input type="date" value={fechaIngreso ?? ''} onChange={(e) => setFechaIngreso(e.target.value)} className={inputClass} />
              </div>
              <div>
                <label className="text-[11px] text-muted-foreground block mb-1">DNI</label>
                <input value={dni} onChange={(e) => setDni(e.target.value)} className={inputClass} />
              </div>
            </div>
            <div className="mt-3">
              <label className="text-[11px] text-muted-foreground block mb-1">Fecha de baja</label>
              <input type="date" value={fechaBaja ?? ''} onChange={(e) => setFechaBaja(e.target.value)} className={inputClass} />
              {/* Que quede claro que son dos cosas distintas: si se
                  confunden, una liquidación pasada deja de mostrarla. */}
              <p className="text-[11px] text-muted-foreground mt-1.5">
                Cuándo dejó de trabajar. No es lo mismo que darla de baja del catálogo: con la fecha
                puesta sigue apareciendo en las liquidaciones de los meses que sí trabajó.
              </p>
            </div>
            <div className="mt-3">
              <label className="text-[11px] text-muted-foreground block mb-1">Notas</label>
              <textarea rows={2} value={notasLaborales} onChange={(e) => setNotasLaborales(e.target.value)} placeholder="Condiciones de contratación, acuerdos..." className={`${inputClass} resize-none`} />
            </div>
          </div>

          {error && <p className="text-sm text-destructive-fuerte bg-destructive/10 rounded-xl px-3 py-2">{error}</p>}
        </div>

        <div className="flex gap-3 px-6 py-4 border-t border-border shrink-0">
          <button type="button" onClick={onClose} className="flex-1 py-2.5 rounded-xl border border-border text-sm font-semibold text-muted-foreground hover:bg-muted transition-colors">
            Cancelar
          </button>
          <button type="submit" disabled={saving} className="flex-1 py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-semibold hover:opacity-90 transition-opacity disabled:opacity-60 flex items-center justify-center gap-2">
            {saving && <Loader2 className="w-4 h-4 animate-spin" />}
            {isEdit ? 'Guardar cambios' : 'Crear'}
          </button>
        </div>
      </form>
    </div>
  )
}

function TeachersSection() {
  const { refresh, canWrite } = useData()
  const { teachers } = useStudio()
  const [showForm, setShowForm] = useState(false)
  const [editing, setEditing] = useState<Teacher | undefined>(undefined)
  const [creandoCuenta, setCreandoCuenta] = useState<Teacher | undefined>(undefined)
  // Las cuentas con rol profesor, para poder vincularlas con su ficha.
  const [cuentas, setCuentas] = useState<Profile[]>([])
  const [vinculando, setVinculando] = useState<string | null>(null)
  const [errorVinculo, setErrorVinculo] = useState<string | null>(null)

  useEffect(() => {
    if (!canWrite) return
    fetchProfiles()
      .then((ps) => setCuentas(ps.filter((p) => p.role === 'profesor' && p.active)))
      .catch(() => setCuentas([]))
  }, [canWrite])

  const vincular = async (t: Teacher, userId: string) => {
    setVinculando(t.id)
    setErrorVinculo(null)
    try {
      await setTeacherUser(t.id, userId || null)
      await refresh()
    } catch (err) {
      setErrorVinculo(err instanceof Error ? err.message : 'No se pudo vincular')
    } finally {
      setVinculando(null)
    }
  }

  const handleDelete = async (t: Teacher) => {
    if (!window.confirm(`¿Dar de baja a ${t.name}? Sus clases quedan en la agenda hasta que las edites.`)) return
    await deactivateTeacher(t.id)
    await refresh()
  }

  return (
    <>
    <SeccionPlegable
      id="profesores"
      icono={Users}
      titulo="Profesores"
      ayuda="Equipo del estudio, sus disciplinas y con qué cuenta entra cada una"
      resumen={<Conteo n={teachers.length} singular="profesor" plural="profesores" />}
      accion={
        canWrite ? (
          <button
            onClick={() => {
              setEditing(undefined)
              setShowForm(true)
            }}
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-primary text-primary-foreground text-xs font-semibold hover:opacity-90 transition-opacity"
          >
            <Plus className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Agregar</span>
          </button>
        ) : undefined
      }
    >
      <div className="divide-y divide-border">
        {teachers.length === 0 && (
          <p className="px-5 py-6 text-sm text-muted-foreground text-center">Sin profesores cargados</p>
        )}
        {teachers.map((t) => (
          <div key={t.id} className="flex items-center gap-3 px-5 py-3.5">
            <span className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: t.color }} />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-foreground truncate">{t.name}</p>
              <p className="text-xs text-muted-foreground truncate">{t.disciplines.join(' · ')}</p>
            </div>
            {canWrite && (
              <select
                value={t.userId ?? ''}
                disabled={vinculando === t.id}
                onChange={(e) => vincular(t, e.target.value)}
                className="px-2 py-1.5 rounded-lg border border-border bg-background text-xs text-foreground outline-none focus:border-primary max-w-[11rem] shrink-0"
                aria-label={`Cuenta de ${t.name}`}
              >
                <option value="">Sin cuenta</option>
                {cuentas.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.fullName || c.email}
                  </option>
                ))}
              </select>
            )}
            {/* Crear la cuenta desde acá, que es donde aparece la falta.
                Antes había que ir a Accesos, crearla, volver y
                vincularla — en ese orden y sin que nada lo dijera. */}
            {canWrite && !t.userId && (
              <button
                onClick={() => setCreandoCuenta(t)}
                className="px-2.5 py-1.5 rounded-lg bg-primary/10 text-primary-fuerte text-[11px] font-semibold hover:bg-primary/20 transition-colors whitespace-nowrap shrink-0"
              >
                Crear cuenta
              </button>
            )}
            {canWrite && (
              <>
                <button
                  onClick={() => {
                    setEditing(t)
                    setShowForm(true)
                  }}
                  className="w-8 h-8 rounded-lg hover:bg-muted flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors"
                  aria-label={`Editar ${t.name}`}
                >
                  <Pencil className="w-3.5 h-3.5" />
                </button>
                <button
                  onClick={() => handleDelete(t)}
                  className="w-8 h-8 rounded-lg hover:bg-destructive/10 flex items-center justify-center text-muted-foreground hover:text-destructive-fuerte transition-colors"
                  aria-label={`Dar de baja a ${t.name}`}
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </>
            )}
          </div>
        ))}
      </div>

      {canWrite && (
        <div className="px-5 py-3 border-t border-border space-y-1">
          {errorVinculo && <p className="text-xs text-destructive-fuerte">{errorVinculo}</p>}
          <p className="text-[11px] text-muted-foreground">
            La cuenta es con la que la profesora entra al sistema. Sin vincularla,
            el sistema no sabe qué clases son suyas y no puede mostrarle solo las
            de ella. Con «Crear cuenta» se hacen las dos cosas de una.{' '}
            {cuentas.length === 0 &&
              'Todavía no hay ninguna cuenta con rol profesor.'}
          </p>
        </div>
      )}
    </SeccionPlegable>

    {showForm && <TeacherFormModal teacher={editing} onClose={() => setShowForm(false)} />}
    {creandoCuenta && (
      <TeacherAccessModal teacher={creandoCuenta} onClose={() => setCreandoCuenta(undefined)} />
    )}
    </>
  )
}

function RoomsSection() {
  const { refresh, canWrite } = useData()
  const { rooms } = useStudio()
  const [newName, setNewName] = useState('')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editName, setEditName] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const run = async (action: () => Promise<void>) => {
    setBusy(true)
    setError(null)
    try {
      await action()
      await refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo guardar')
    } finally {
      setBusy(false)
    }
  }

  return (
    <SeccionPlegable
      id="salas"
      icono={DoorOpen}
      colorIcono="bg-primary/10 text-primary-fuerte"
      titulo="Salas"
      ayuda="Espacios disponibles para las clases"
      resumen={<Conteo n={rooms.length} singular="sala" plural="salas" />}
    >
      <div className="px-5 py-4 space-y-2">
        {rooms.length === 0 && (
          <p className="text-xs text-muted-foreground">
            Sin salas cargadas. Si ya tenías clases, corré la migración 0004 para importarlas.
          </p>
        )}
        {rooms.map((r) => (
          <div key={r.id} className="flex items-center gap-2 rounded-xl border border-border px-3 py-2">
            {editingId === r.id ? (
              <>
                <input
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  className="flex-1 bg-transparent text-sm text-foreground outline-none"
                  autoFocus
                />
                <button
                  disabled={busy || !editName.trim()}
                  onClick={() =>
                    run(async () => {
                      await renameRoom(r.id, r.name, editName)
                      setEditingId(null)
                    })
                  }
                  className="w-7 h-7 rounded-lg hover:bg-exito-suave flex items-center justify-center text-muted-foreground hover:text-exito-fuerte"
                  aria-label="Guardar nombre"
                >
                  <Check className="w-3.5 h-3.5" />
                </button>
                <button
                  onClick={() => setEditingId(null)}
                  className="w-7 h-7 rounded-lg hover:bg-muted flex items-center justify-center text-muted-foreground"
                  aria-label="Cancelar"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </>
            ) : (
              <>
                <span className="flex-1 text-sm text-foreground">{r.name}</span>
                {canWrite && (
                  <>
                    <button
                      onClick={() => {
                        setEditingId(r.id)
                        setEditName(r.name)
                      }}
                      className="w-7 h-7 rounded-lg hover:bg-muted flex items-center justify-center text-muted-foreground hover:text-foreground"
                      aria-label={`Renombrar ${r.name}`}
                    >
                      <Pencil className="w-3.5 h-3.5" />
                    </button>
                    <button
                      disabled={busy}
                      onClick={() => {
                        if (window.confirm(`¿Dar de baja la sala "${r.name}"?`)) {
                          run(() => deactivateRoom(r.id))
                        }
                      }}
                      className="w-7 h-7 rounded-lg hover:bg-destructive/10 flex items-center justify-center text-muted-foreground hover:text-destructive-fuerte"
                      aria-label={`Dar de baja ${r.name}`}
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </>
                )}
              </>
            )}
          </div>
        ))}

        {canWrite && (
          <div className="flex items-center gap-2 pt-1">
            <input
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="Nueva sala..."
              className={cn(inputClass, 'flex-1')}
            />
            <button
              disabled={busy || !newName.trim()}
              onClick={() =>
                run(async () => {
                  await createRoom(newName)
                  setNewName('')
                })
              }
              className="px-4 py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-semibold hover:opacity-90 transition-opacity disabled:opacity-50"
            >
              Agregar
            </button>
          </div>
        )}
        {error && <p className="text-sm text-destructive-fuerte bg-destructive/10 rounded-xl px-3 py-2">{error}</p>}
      </div>
    </SeccionPlegable>
  )
}

function UserFormModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [fullName, setFullName] = useState('')
  const [role, setRole] = useState<Role>('recepcion')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)
    setError(null)
    try {
      await createSystemUser({ email, password, fullName, role })
      onCreated()
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo crear el usuario')
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-foreground/20 backdrop-blur-sm" onClick={onClose}>
      <form
        onSubmit={handleSubmit}
        className="bg-card rounded-2xl shadow-2xl w-full max-w-md border border-border max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-6 py-4 border-b border-border">
          <h2 className="text-base font-bold text-foreground">Nuevo usuario</h2>
          <button type="button" onClick={onClose} className="w-8 h-8 rounded-full hover:bg-muted flex items-center justify-center text-muted-foreground">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="px-6 py-5 space-y-4">
          <div>
            <label className={labelClass}>Nombre</label>
            <input value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder="Ej: Marcela Díaz" className={inputClass} />
          </div>
          <div>
            <label className={labelClass}>Email *</label>
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required placeholder="marcela@estudio.com" className={inputClass} />
          </div>
          <div>
            <label className={labelClass}>Contraseña inicial *</label>
            <input
              type="text"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={6}
              placeholder="Mínimo 6 caracteres"
              className={inputClass}
            />
            <p className="text-[11px] text-muted-foreground mt-1.5">Compartila con la persona; puede cambiarla después.</p>
          </div>
          <div>
            <label className={labelClass}>Rol</label>
            <select value={role} onChange={(e) => setRole(e.target.value as Role)} className={inputClass}>
              <option value="recepcion">Recepción — gestiona clientes, reservas y cobros</option>
              <option value="profesor">Profesor/a — solo consulta</option>
              <option value="admin">Admin — acceso total y configuración</option>
            </select>
          </div>
          {error && <p className="text-sm text-destructive-fuerte bg-destructive/10 rounded-xl px-3 py-2">{error}</p>}
        </div>

        <div className="flex gap-3 px-6 py-4 border-t border-border">
          <button type="button" onClick={onClose} className="flex-1 py-2.5 rounded-xl border border-border text-sm font-semibold text-muted-foreground hover:bg-muted transition-colors">
            Cancelar
          </button>
          <button type="submit" disabled={saving} className="flex-1 py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-semibold hover:opacity-90 transition-opacity disabled:opacity-60 flex items-center justify-center gap-2">
            {saving && <Loader2 className="w-4 h-4 animate-spin" />}
            Crear usuario
          </button>
        </div>
      </form>
    </div>
  )
}

function UsersSection() {
  const { profile } = useData()
  const [users, setUsers] = useState<Profile[]>([])
  const [loadError, setLoadError] = useState<string | null>(null)
  const [showForm, setShowForm] = useState(false)
  const [busyId, setBusyId] = useState<string | null>(null)

  const load = () => {
    fetchProfiles()
      .then((u) => {
        setUsers(u)
        setLoadError(null)
      })
      .catch(() => setLoadError('No se pudo cargar la lista (¿corriste la migración 0004?)'))
  }
  useEffect(load, [])

  if (profile?.role !== 'admin') return null

  const handleRole = async (u: Profile, role: Role) => {
    setBusyId(u.id)
    try {
      await updateUserRole(u.id, role)
      load()
    } catch (err) {
      window.alert(err instanceof Error ? err.message : 'No se pudo cambiar el rol')
    } finally {
      setBusyId(null)
    }
  }

  const handleDelete = async (u: Profile) => {
    if (
      !window.confirm(
        `¿Dar de baja el acceso de ${u.email}? No va a poder entrar más, pero se conserva todo lo que hizo: clases, asistencias y movimientos.`
      )
    )
      return
    setBusyId(u.id)
    try {
      await deleteSystemUser(u.id)
      load()
    } catch (err) {
      window.alert(err instanceof Error ? err.message : 'No se pudo dar de baja')
    } finally {
      setBusyId(null)
    }
  }

  const handleReactivate = async (u: Profile) => {
    setBusyId(u.id)
    try {
      await reactivateSystemUser(u.id)
      load()
    } catch (err) {
      window.alert(err instanceof Error ? err.message : 'No se pudo reactivar')
    } finally {
      setBusyId(null)
    }
  }

  return (
    <>
    <SeccionPlegable
      id="usuarios"
      icono={UserPlus}
      colorIcono="bg-info/10 text-info-fuerte"
      titulo="Usuarios del sistema"
      ayuda="Quiénes pueden ingresar y con qué permisos"
      resumen={<Conteo n={users.filter((u) => u.active).length} singular="cuenta activa" plural="cuentas activas" />}
      accion={
        <button
          onClick={() => setShowForm(true)}
          className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-primary text-primary-foreground text-xs font-semibold hover:opacity-90 transition-opacity"
        >
          <Plus className="w-3.5 h-3.5" />
          <span className="hidden sm:inline">Agregar</span>
        </button>
      }
    >
      <div className="divide-y divide-border">
        {loadError && <p className="px-5 py-4 text-sm text-destructive-fuerte">{loadError}</p>}
        {users.map((u) => {
          const isSelf = u.id === profile.id
          return (
            <div key={u.id} className="flex items-center gap-3 px-5 py-3.5 flex-wrap">
              <div className="flex-1 min-w-40">
                <p className={cn('text-sm font-semibold truncate', u.active ? 'text-foreground' : 'text-muted-foreground')}>
                  {u.fullName || u.email}
                  {isSelf && <span className="ml-2 text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-primary/10 text-primary-fuerte">Vos</span>}
                  {!u.active && (
                    <span className="ml-2 text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-muted text-muted-foreground">
                      Dado de baja
                    </span>
                  )}
                </p>
                <p className="text-xs text-muted-foreground truncate">{u.email}</p>
              </div>
              {isSelf ? (
                <span className="text-xs font-semibold text-muted-foreground px-3">{ROLE_LABELS[u.role]}</span>
              ) : (
                <>
                  <select
                    value={u.role}
                    disabled={busyId === u.id || !u.active}
                    onChange={(e) => handleRole(u, e.target.value as Role)}
                    className="px-2.5 py-1.5 rounded-lg border border-border bg-background text-xs text-foreground outline-none focus:border-primary disabled:opacity-50"
                  >
                    {Object.entries(ROLE_LABELS).map(([value, label]) => (
                      <option key={value} value={value}>
                        {label}
                      </option>
                    ))}
                  </select>
                  {u.active ? (
                    <button
                      disabled={busyId === u.id}
                      onClick={() => handleDelete(u)}
                      className="w-8 h-8 rounded-lg hover:bg-destructive/10 flex items-center justify-center text-muted-foreground hover:text-destructive-fuerte transition-colors disabled:opacity-50"
                      aria-label={`Dar de baja ${u.email}`}
                      title="Dar de baja el acceso"
                    >
                      <UserMinus className="w-3.5 h-3.5" />
                    </button>
                  ) : (
                    <button
                      disabled={busyId === u.id}
                      onClick={() => handleReactivate(u)}
                      className="w-8 h-8 rounded-lg hover:bg-exito-suave flex items-center justify-center text-muted-foreground hover:text-exito-fuerte transition-colors disabled:opacity-50"
                      aria-label={`Reactivar ${u.email}`}
                      title="Reactivar el acceso"
                    >
                      <RotateCcw className="w-3.5 h-3.5" />
                    </button>
                  )}
                </>
              )}
            </div>
          )
        })}
      </div>

    </SeccionPlegable>

    {showForm && <UserFormModal onClose={() => setShowForm(false)} onCreated={load} />}
    </>
  )
}

/**
 * Cómo se llama cada grupo en pantalla. Es solo la traducción: los grupos
 * que existen salen del catálogo, así que un módulo nuevo agrega el suyo
 * con un INSERT y aparece igual, con el nombre de la clave si todavía no
 * está acá.
 */
const NOMBRE_GRUPO: Record<string, { title: string; help: string }> = {
  estudio: { title: 'Datos del estudio', help: 'Lo que se muestra en la web pública y en los emails' },
  reservas: { title: 'Reservas y clases', help: 'Reglas de cancelación y lista de espera' },
  membresias: { title: 'Membresías', help: 'Aviso de vencimiento, congelamiento y lista de contacto' },
  cobros: { title: 'Cobros', help: 'Vencimiento de la cuota y redondeo del precio' },
  avisos: { title: 'Avisos automáticos', help: 'Con cuánta anticipación sale cada recordatorio' },
  caja: { title: 'Caja y arqueo', help: 'Cómo se cierra la caja y qué diferencia se tolera' },
  gastos: { title: 'Gastos', help: 'Cómo se cargan los egresos del estudio' },
  general: { title: 'General', help: '' },
}

function tituloGrupo(key: string) {
  return NOMBRE_GRUPO[key] ?? { title: key.charAt(0).toUpperCase() + key.slice(1), help: '' }
}

/**
 * Los parámetros del negocio. La pantalla se arma sola con lo que trae la
 * tabla studio_settings (etiqueta, ayuda y tipo de campo vienen con cada
 * fila), así que sumar un parámetro nuevo no requiere tocar este archivo.
 */
function SettingsSection({ group }: { group: SettingGroup }) {
  const { refresh, canWrite, profile } = useData()
  const { settingsMeta } = useStudio()
  const meta = settingsMeta.filter((s) => s.group === group)
  const info = tituloGrupo(group)

  const [draft, setDraft] = useState<Record<string, string>>({})
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)

  const esAdmin = profile?.role === 'admin'
  const valueOf = (s: StudioSetting) => draft[s.key] ?? s.value
  // Los de control aflojan el arqueo, así que no viven en manos de quien
  // cierra la caja. La base lo exige igual con una política restrictiva.
  const editable = (s: StudioSetting) => canWrite && (!s.soloAdmin || esAdmin)
  const dirty = Object.keys(draft).some((k) => draft[k] !== meta.find((s) => s.key === k)?.value)

  const set = (key: string, value: string) => {
    setDraft((d) => ({ ...d, [key]: value }))
    setSaved(false)
  }

  const save = async () => {
    setBusy(true)
    setError(null)
    try {
      const changes = Object.fromEntries(
        Object.entries(draft).filter(([k, v]) => v !== meta.find((s) => s.key === k)?.value)
      )
      await saveSettings(changes)
      await refresh()
      setDraft({})
      setSaved(true)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo guardar')
    } finally {
      setBusy(false)
    }
  }

  if (meta.length === 0) return null

  return (
    <SeccionPlegable
      id={`parametros-${group}`}
      icono={group === 'estudio' ? Building2 : SlidersHorizontal}
      titulo={info.title}
      ayuda={info.help}
      abiertaPorDefecto={group === 'estudio'}
      resumen={
        // Contraer la sección no descarta lo tipeado, pero sí lo esconde:
        // el cartel es para que nadie se vaya creyendo que guardó.
        dirty ? (
          <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-aviso-suave text-aviso-fuerte">
            Sin guardar
          </span>
        ) : (
          <Conteo n={meta.length} singular="parámetro" plural="parámetros" />
        )
      }
    >
      <div className="px-5 py-4 space-y-4">
        {meta.map((s) => (
          <div key={s.key}>
            <label className="flex items-center gap-2 text-xs font-semibold text-foreground mb-1.5">
              {s.label}
              {!s.rige && (
                <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-aviso-suave text-aviso-fuerte">
                  Todavía no rige
                </span>
              )}
            </label>

            {s.kind === 'boolean' ? (
              <button
                type="button"
                disabled={!editable(s)}
                onClick={() => set(s.key, valueOf(s) === 'true' ? 'false' : 'true')}
                className={cn(
                  'relative w-11 h-6 rounded-full transition-colors',
                  valueOf(s) === 'true' ? 'bg-primary' : 'bg-muted',
                  !editable(s) && 'opacity-50 cursor-not-allowed'
                )}
                aria-label={s.label}
              >
                <span
                  className={cn(
                    'absolute top-0.5 w-5 h-5 rounded-full bg-card shadow transition-transform',
                    valueOf(s) === 'true' ? 'translate-x-5' : 'translate-x-0.5'
                  )}
                />
              </button>
            ) : s.kind === 'choice' ? (
              <select
                value={valueOf(s)}
                disabled={!editable(s)}
                onChange={(e) => set(s.key, e.target.value)}
                className="w-full px-3 py-2 rounded-xl border border-border bg-background text-sm text-foreground outline-none focus:border-primary/50 disabled:opacity-50"
              >
                {s.options.map((opt) => {
                  const [label, value] = opt.split('|')
                  return (
                    <option key={value ?? label} value={value ?? label}>
                      {label}
                    </option>
                  )
                })}
              </select>
            ) : s.kind === 'textarea' ? (
              // Cuatro renglones y no dos: desde la 0044 la dirección y el
              // horario se guardan en varias líneas, y con dos el campo
              // escondía la mitad del dato que el estudio está editando.
              <textarea
                value={valueOf(s)}
                disabled={!editable(s)}
                rows={4}
                onChange={(e) => set(s.key, e.target.value)}
                className="w-full px-3 py-2 rounded-xl border border-border bg-background text-sm text-foreground outline-none focus:border-primary/50 disabled:opacity-50"
              />
            ) : (
              <input
                type={s.kind === 'number' ? 'number' : s.kind === 'time' ? 'time' : 'text'}
                value={valueOf(s)}
                disabled={!editable(s)}
                onChange={(e) => set(s.key, e.target.value)}
                className="w-full px-3 py-2 rounded-xl border border-border bg-background text-sm text-foreground outline-none focus:border-primary/50 disabled:opacity-50"
              />
            )}

            {s.help && <p className="text-[11px] text-muted-foreground mt-1">{s.help}</p>}
            {!s.rige && (
              <p className="text-[11px] text-aviso-fuerte mt-1">
                Se puede dejar cargado, pero el sistema todavía no lo tiene en
                cuenta. Cuando empiece a regir, el cartel desaparece.
              </p>
            )}
            {s.soloAdmin && !esAdmin && (
              <p className="text-[11px] text-muted-foreground mt-1 flex items-center gap-1">
                <Lock className="w-3 h-3" />
                Solo lo cambia el admin: afloja el control del arqueo.
              </p>
            )}
          </div>
        ))}

        {error && <p className="text-xs text-destructive-fuerte">{error}</p>}

        {canWrite && (
          <div className="flex items-center gap-3 pt-1">
            <button
              onClick={save}
              disabled={busy || !dirty}
              className="px-4 py-2 rounded-xl bg-primary text-primary-foreground text-sm font-semibold disabled:opacity-40 flex items-center gap-2"
            >
              {busy && <Loader2 className="w-4 h-4 animate-spin" />}
              Guardar
            </button>
            {saved && !dirty && (
              <span className="text-xs text-exito-fuerte flex items-center gap-1">
                <CheckCircle2 className="w-3.5 h-3.5" /> Guardado
              </span>
            )}
          </div>
        )}
      </div>
    </SeccionPlegable>
  )
}

function DisciplineFormModal({
  discipline,
  onClose,
}: {
  discipline?: DisciplineItem
  onClose: () => void
}) {
  const { refresh } = useData()
  const isEdit = !!discipline
  const [name, setName] = useState(discipline?.name ?? '')
  const [color, setColor] = useState(discipline?.color ?? TEACHER_COLORS[0])
  const [bgColor, setBgColor] = useState(discipline?.bgColor ?? '#BCBAAE')
  const [textColor, setTextColor] = useState(discipline?.textColor ?? '#000000')
  const [blurb, setBlurb] = useState(discipline?.blurb ?? '')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)
    setError(null)
    const input: DisciplineInput = { name, color, bgColor, textColor, blurb }
    try {
      if (isEdit) await updateDiscipline(discipline.id, discipline.name, input)
      else await createDiscipline(input)
      await refresh()
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo guardar')
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-foreground/40 flex items-center justify-center p-4" onClick={onClose}>
      <div
        className="bg-card rounded-2xl shadow-2xl w-full max-w-sm border border-border max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-5 py-4 border-b border-border">
          <h2 className="text-base font-bold text-foreground">
            {isEdit ? 'Editar disciplina' : 'Nueva disciplina'}
          </h2>
          {isEdit && (
            <p className="text-xs text-muted-foreground mt-1">
              Si cambiás el nombre, se actualiza en las clases, los planes y los profesores.
            </p>
          )}
        </div>

        <form onSubmit={submit} className="px-5 py-4 space-y-4">
          <div>
            <label className="block text-xs font-semibold text-foreground mb-1.5">Nombre *</label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              placeholder="Ej: Pilates para embarazadas"
              className="w-full px-3 py-2 rounded-xl border border-border bg-background text-sm text-foreground outline-none focus:border-primary/50"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-foreground mb-1.5">
              Descripción para la web
            </label>
            <textarea
              value={blurb}
              onChange={(e) => setBlurb(e.target.value)}
              rows={2}
              placeholder="Una línea que explique de qué se trata"
              className="w-full px-3 py-2 rounded-xl border border-border bg-background text-sm text-foreground outline-none focus:border-primary/50"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-foreground mb-1.5">Color</label>
            <div className="flex flex-wrap gap-2">
              {TEACHER_COLORS.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setColor(c)}
                  className={cn(
                    'w-8 h-8 rounded-full border-2 transition-transform',
                    color === c ? 'border-foreground scale-110' : 'border-transparent'
                  )}
                  style={{ backgroundColor: c }}
                  aria-label={`Color ${c}`}
                />
              ))}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-foreground mb-1.5">
                Fondo de la etiqueta
              </label>
              <input
                type="color"
                value={bgColor}
                onChange={(e) => setBgColor(e.target.value)}
                className="w-full h-9 rounded-xl border border-border bg-background"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-foreground mb-1.5">
                Texto de la etiqueta
              </label>
              <input
                type="color"
                value={textColor}
                onChange={(e) => setTextColor(e.target.value)}
                className="w-full h-9 rounded-xl border border-border bg-background"
              />
            </div>
          </div>

          <div
            className="rounded-xl px-3 py-2 text-xs font-semibold inline-block"
            style={{ backgroundColor: bgColor, color: textColor }}
          >
            {name || 'Así se va a ver'}
          </div>

          {error && <p className="text-xs text-destructive-fuerte">{error}</p>}

          <div className="flex gap-2 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-2.5 rounded-xl border border-border text-sm font-semibold text-muted-foreground"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={saving}
              className="flex-1 py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-semibold disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {saving && <Loader2 className="w-4 h-4 animate-spin" />}
              {isEdit ? 'Guardar' : 'Crear'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

function DisciplinesSection() {
  const { refresh, canWrite } = useData()
  const { disciplines } = useStudio()
  const [showForm, setShowForm] = useState(false)
  const [editing, setEditing] = useState<DisciplineItem | undefined>()
  const [busy, setBusy] = useState(false)

  const remove = async (d: DisciplineItem) => {
    if (!window.confirm(`¿Dar de baja la disciplina "${d.name}"? Las clases que la usan no se tocan.`)) return
    setBusy(true)
    try {
      await deactivateDiscipline(d.id)
      await refresh()
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
    <SeccionPlegable
      id="disciplinas"
      icono={Shapes}
      colorIcono="bg-primary/10 text-primary-fuerte"
      titulo="Disciplinas"
      ayuda="Las que aparecen en la agenda, los planes y la web"
      resumen={<Conteo n={disciplines.length} singular="disciplina" plural="disciplinas" />}
      accion={
        canWrite ? (
          <button
            onClick={() => {
              setEditing(undefined)
              setShowForm(true)
            }}
            className="w-8 h-8 rounded-xl bg-primary/10 text-primary-fuerte flex items-center justify-center hover:bg-primary/20 transition-colors"
            aria-label="Nueva disciplina"
          >
            <Plus className="w-4 h-4" />
          </button>
        ) : undefined
      }
    >
      <div className="px-5 py-4 space-y-2">
        {disciplines.length === 0 && (
          <p className="text-xs text-muted-foreground">
            Sin disciplinas cargadas. Corré la migración 0011 para importar las que ya usabas.
          </p>
        )}
        {disciplines.map((d) => (
          <div key={d.id} className="flex items-center gap-2 rounded-xl border border-border px-3 py-2">
            <span
              className="text-[11px] font-semibold px-2 py-0.5 rounded-full shrink-0"
              style={{ backgroundColor: d.bgColor, color: d.textColor }}
            >
              {d.name}
            </span>
            <span className="flex-1 text-xs text-muted-foreground truncate">{d.blurb}</span>
            {canWrite && (
              <>
                <button
                  onClick={() => {
                    setEditing(d)
                    setShowForm(true)
                  }}
                  className="w-7 h-7 rounded-lg hover:bg-muted flex items-center justify-center text-muted-foreground hover:text-foreground"
                  aria-label={`Editar ${d.name}`}
                >
                  <Pencil className="w-3.5 h-3.5" />
                </button>
                <button
                  disabled={busy}
                  onClick={() => remove(d)}
                  className="w-7 h-7 rounded-lg hover:bg-destructive/10 flex items-center justify-center text-muted-foreground hover:text-destructive-fuerte"
                  aria-label={`Dar de baja ${d.name}`}
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </>
            )}
          </div>
        ))}
      </div>

    </SeccionPlegable>

    {showForm && <DisciplineFormModal discipline={editing} onClose={() => setShowForm(false)} />}
    </>
  )
}

/**
 * Los tipos de cuenta, con el nombre que usa quien atiende y no el de la
 * base. 'transitoria' no está: es de la cuenta "A imputar", que la crea el
 * sistema y nadie más.
 */
const TIPOS_DE_CUENTA: Array<{ kind: AccountKind; label: string; ayuda: string }> = [
  { kind: 'caja', label: 'Caja', ayuda: 'Plata en el cajón, que se cuenta a mano al cerrar' },
  { kind: 'banco', label: 'Banco', ayuda: 'Una cuenta bancaria del estudio' },
  { kind: 'billetera', label: 'Billetera virtual', ayuda: 'Mercado Pago, Ualá, Cuenta DNI' },
  { kind: 'pasarela', label: 'Tarjetas a acreditar', ayuda: 'Lo que el posnet todavía no depositó' },
]

const NOMBRE_TIPO: Record<AccountKind, string> = {
  caja: 'Caja',
  banco: 'Banco',
  billetera: 'Billetera',
  pasarela: 'Tarjetas',
  transitoria: 'Del sistema',
}

function CuentaFormModal({
  cuenta,
  onClose,
  onSaved,
}: {
  cuenta?: Account
  onClose: () => void
  onSaved: () => void
}) {
  const [name, setName] = useState(cuenta?.name ?? '')
  const [kind, setKind] = useState<AccountKind>(cuenta?.kind ?? 'banco')
  const [arquea, setArquea] = useState(cuenta?.arquea ?? false)
  const [bankName, setBankName] = useState(cuenta?.bankName ?? '')
  const [cbu, setCbu] = useState(cuenta?.cbu ?? '')
  const [alias, setAlias] = useState(cuenta?.alias ?? '')
  const [holder, setHolder] = useState(cuenta?.holder ?? '')
  const [notes, setNotes] = useState(cuenta?.notes ?? '')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const esCaja = kind === 'caja'
  const tipo = TIPOS_DE_CUENTA.find((t) => t.kind === kind)

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)
    setError(null)
    const input: AccountInput = {
      name,
      kind,
      // Arquear es contar la plata con la mano, y eso sólo se puede hacer
      // con la que está en el cajón. Se fuerza acá en vez de confiar en el
      // tilde: una cuenta de banco marcada para arquear le pediría a la
      // encargada que cuente un saldo que no puede tocar.
      arquea: esCaja ? arquea : false,
      bankName,
      cbu,
      alias,
      holder,
      notes,
    }
    try {
      if (cuenta) await updateAccount(cuenta.id, input)
      else await createAccount(input)
      onSaved()
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo guardar la cuenta')
      setSaving(false)
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-foreground/20 backdrop-blur-sm"
      onClick={onClose}
    >
      <form
        onClick={(e) => e.stopPropagation()}
        onSubmit={submit}
        className="bg-card rounded-2xl border border-border w-full max-w-md max-h-[90vh] overflow-y-auto"
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <h2 className="font-bold text-foreground">
            {cuenta ? 'Editar cuenta' : 'Nueva cuenta'}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-lg hover:bg-muted flex items-center justify-center text-muted-foreground"
            aria-label="Cerrar"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="px-5 py-4 space-y-4">
          <div>
            <label className={labelClass}>Nombre *</label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              autoFocus
              placeholder="Cuenta Macro"
              className={inputClass}
            />
          </div>

          <div>
            <label className={labelClass}>Tipo</label>
            <select
              value={kind}
              onChange={(e) => setKind(e.target.value as AccountKind)}
              className={inputClass}
            >
              {TIPOS_DE_CUENTA.map((t) => (
                <option key={t.kind} value={t.kind}>
                  {t.label}
                </option>
              ))}
            </select>
            {tipo && <p className="text-[11px] text-muted-foreground mt-1.5">{tipo.ayuda}</p>}
          </div>

          {esCaja && (
            <label className="flex items-start gap-2.5 cursor-pointer">
              <input
                type="checkbox"
                checked={arquea}
                onChange={(e) => setArquea(e.target.checked)}
                className="mt-0.5"
              />
              <span className="text-xs text-foreground">
                Se arquea al cerrar el día
                <span className="block text-[11px] text-muted-foreground">
                  Al cerrar, el sistema pide contar la plata y asienta la diferencia.
                </span>
              </span>
            </label>
          )}

          {!esCaja && (
            <>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={labelClass}>Banco</label>
                  <input value={bankName} onChange={(e) => setBankName(e.target.value)} className={inputClass} />
                </div>
                <div>
                  <label className={labelClass}>Titular</label>
                  <input value={holder} onChange={(e) => setHolder(e.target.value)} className={inputClass} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={labelClass}>CBU</label>
                  <input value={cbu} onChange={(e) => setCbu(e.target.value)} className={inputClass} />
                </div>
                <div>
                  <label className={labelClass}>Alias</label>
                  <input value={alias} onChange={(e) => setAlias(e.target.value)} className={inputClass} />
                </div>
              </div>
            </>
          )}

          <div>
            <label className={labelClass}>Notas</label>
            <input value={notes} onChange={(e) => setNotes(e.target.value)} className={inputClass} />
          </div>

          {error && <p className="text-xs text-destructive-fuerte">{error}</p>}
        </div>

        <div className="flex gap-2 px-5 py-4 border-t border-border">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 py-2.5 rounded-xl border border-border text-sm font-semibold text-foreground hover:bg-muted transition-colors"
          >
            Cancelar
          </button>
          <button
            type="submit"
            disabled={saving || !name.trim()}
            className="flex-1 py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-semibold hover:opacity-90 disabled:opacity-40 transition-opacity"
          >
            {saving ? 'Guardando…' : cuenta ? 'Guardar' : 'Crear cuenta'}
          </button>
        </div>
      </form>
    </div>
  )
}

/**
 * Las cuentas del estudio: dónde está la plata.
 *
 * Existía la tabla, existían las funciones en `lib/caja-api.ts` desde la
 * 0020 y no las llamaba nadie: las cinco cuentas que sembró esa migración
 * eran las únicas cinco que podía haber, y agregar la del banco nuevo era
 * entrar al SQL Editor. Esto es la pantalla que faltaba.
 *
 * La de baja es en dos pasos y con un cartel propio, no con `window.confirm`:
 * los carteles nativos los descarta solo el navegador embebido y el botón
 * parece muerto.
 */
function CuentasSection({
  cuentas,
  recargar,
}: {
  cuentas: Account[]
  recargar: () => Promise<void>
}) {
  // `caja.cuentas` y no el rol crudo: es la clave que exige la base para
  // crear y editar una cuenta (0020:195-202), y su grupo RIGE desde que se
  // encendió Caja. O sea que recepción —que tiene `caja.ver` pero no
  // `caja.cuentas`— ve la lista y no puede tocarla. Mostrarle los botones
  // sería ofrecerle una acción que la base va a rechazar.
  const { can } = useData()
  const puedeEditar = can('caja.cuentas')
  const [showForm, setShowForm] = useState(false)
  const [editing, setEditing] = useState<Account | undefined>()
  const [confirmando, setConfirmando] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const darDeBaja = async (c: Account) => {
    setBusy(true)
    setError(null)
    try {
      await deactivateAccount(c.id)
      await recargar()
      setConfirmando(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo dar de baja')
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <SeccionPlegable
        id="cuentas"
        icono={Landmark}
        colorIcono="bg-primary/10 text-primary-fuerte"
        titulo="Cuentas"
        ayuda="Dónde queda la plata: el cajón, los bancos, las billeteras"
        resumen={<Conteo n={cuentas.length} singular="cuenta" plural="cuentas" />}
        accion={
          puedeEditar ? (
            <button
              onClick={() => {
                setEditing(undefined)
                setShowForm(true)
              }}
              className="w-8 h-8 rounded-xl bg-primary/10 text-primary-fuerte flex items-center justify-center hover:bg-primary/20 transition-colors"
              aria-label="Nueva cuenta"
            >
              <Plus className="w-4 h-4" />
            </button>
          ) : undefined
        }
      >
        <div className="px-5 py-4 space-y-2">
          <p className="text-[11px] text-muted-foreground pb-1">
            Cada medio de pago manda su plata a una cuenta, y el saldo de cada una
            se ve en Caja. Las cuentas <strong>no se borran</strong>: se dan de
            baja, así los cobros que ya entraron siguen teniendo dónde estar.
          </p>

          {cuentas.length === 0 && (
            <p className="text-xs text-muted-foreground">
              Sin cuentas a la vista. Puede ser que falte correr la migración 0020,
              o que tu rol no tenga permiso para ver la caja — una tabla sin
              permiso vuelve vacía, no da error.
            </p>
          )}

          {!puedeEditar && cuentas.length > 0 && (
            <p className="text-[11px] text-muted-foreground">
              Tu rol puede ver las cuentas pero no modificarlas.
            </p>
          )}

          {cuentas.map((c) => (
            <div key={c.id} className="flex items-center gap-2 rounded-xl border border-border px-3 py-2">
              <span className="flex-1 text-sm text-foreground truncate">{c.name}</span>
              <span className="text-[10px] text-muted-foreground bg-muted px-2 py-0.5 rounded-full shrink-0">
                {NOMBRE_TIPO[c.kind]}
              </span>
              {c.arquea && (
                <span className="text-[10px] text-primary-fuerte bg-primary/10 px-2 py-0.5 rounded-full shrink-0">
                  se arquea
                </span>
              )}
              {/* La cuenta del sistema ("A imputar") no se toca: la base la
                  blinda con un trigger, y la pantalla no ofrece lo que la
                  base va a rechazar. */}
              {puedeEditar && !c.isSystem && (
                confirmando === c.id ? (
                  <>
                    <span className="text-[11px] text-aviso-fuerte shrink-0">¿Darla de baja?</span>
                    <button
                      disabled={busy}
                      onClick={() => darDeBaja(c)}
                      className="px-2 h-7 rounded-lg bg-destructive/10 text-destructive-fuerte text-[11px] font-semibold hover:bg-destructive/20"
                    >
                      Sí
                    </button>
                    <button
                      onClick={() => setConfirmando(null)}
                      className="w-7 h-7 rounded-lg hover:bg-muted flex items-center justify-center text-muted-foreground"
                      aria-label="No dar de baja"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </>
                ) : (
                  <>
                    <button
                      onClick={() => {
                        setEditing(c)
                        setShowForm(true)
                      }}
                      className="w-7 h-7 rounded-lg hover:bg-muted flex items-center justify-center text-muted-foreground hover:text-foreground"
                      aria-label={`Editar ${c.name}`}
                    >
                      <Pencil className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => setConfirmando(c.id)}
                      className="w-7 h-7 rounded-lg hover:bg-destructive/10 flex items-center justify-center text-muted-foreground hover:text-destructive-fuerte"
                      aria-label={`Dar de baja ${c.name}`}
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </>
                )
              )}
            </div>
          ))}

          {error && <p className="text-xs text-destructive-fuerte">{error}</p>}
        </div>
      </SeccionPlegable>

      {showForm && (
        <CuentaFormModal
          cuenta={editing}
          onClose={() => setShowForm(false)}
          onSaved={recargar}
        />
      )}
    </>
  )
}

// ---------------------------------------------------------------
// Promociones (0079)
// ---------------------------------------------------------------

/** Cómo se lee una promoción de un vistazo, sin abrirla. */
function comoSeLee(p: Promocion): string {
  const cuanto = p.tipo === 'porcentaje' ? `${p.valor}%` : `$${p.valor.toLocaleString('es-AR')}`
  const cuando =
    p.ventana === 'fechas' && p.desde && p.hasta
      ? `del ${p.desde.slice(8, 10)}/${p.desde.slice(5, 7)} al ${p.hasta.slice(8, 10)}/${p.hasta.slice(5, 7)}`
      : p.ventana === 'dias_mes' && p.diaDesde && p.diaHasta
        ? p.diaDesde === p.diaHasta
          ? `el día ${p.diaDesde} de cada mes`
          : `del ${p.diaDesde} al ${p.diaHasta} de cada mes`
        : 'siempre'
  return `${cuanto} · ${cuando}`
}

function PromocionFormModal({
  promo,
  onClose,
  onSaved,
}: {
  promo?: Promocion
  onClose: () => void
  onSaved: () => void
}) {
  const { plans } = useStudio()
  const [nombre, setNombre] = useState(promo?.nombre ?? '')
  const [tipo, setTipo] = useState<'porcentaje' | 'monto'>(promo?.tipo ?? 'porcentaje')
  const [valor, setValor] = useState(String(promo?.valor ?? ''))
  const [ventana, setVentana] = useState<'siempre' | 'fechas' | 'dias_mes'>(promo?.ventana ?? 'siempre')
  const [desde, setDesde] = useState(promo?.desde ?? '')
  const [hasta, setHasta] = useState(promo?.hasta ?? '')
  const [diaDesde, setDiaDesde] = useState(String(promo?.diaDesde ?? 1))
  const [diaHasta, setDiaHasta] = useState(String(promo?.diaHasta ?? 10))
  const [codigo, setCodigo] = useState(promo?.codigo ?? '')
  const [usosMax, setUsosMax] = useState(promo?.usosMax != null ? String(promo.usosMax) : '')
  const [usosPorCliente, setUsosPorCliente] = useState(
    promo?.usosPorCliente != null ? String(promo.usosPorCliente) : ''
  )
  const [planes, setPlanes] = useState<string[]>(promo?.planes ?? [])
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const num = Number(valor)
  const valorValido =
    valor.trim() !== '' && num > 0 && (tipo !== 'porcentaje' || num <= 100)

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)
    setError(null)
    const input: PromocionInput = {
      nombre,
      tipo,
      valor: num,
      ventana,
      desde,
      hasta,
      diaDesde: Number(diaDesde),
      diaHasta: Number(diaHasta),
      codigo,
      // Vacío es "sin tope", que no es lo mismo que cero: cero sería una
      // promo que no se puede usar nunca.
      usosMax: usosMax.trim() === '' ? null : Number(usosMax),
      usosPorCliente: usosPorCliente.trim() === '' ? null : Number(usosPorCliente),
      planes,
    }
    try {
      if (promo) await updatePromocion(promo.id, input)
      else await createPromocion(input)
      onSaved()
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo guardar la promoción')
      setSaving(false)
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-foreground/20 backdrop-blur-sm"
      onClick={onClose}
    >
      <form
        onClick={(e) => e.stopPropagation()}
        onSubmit={submit}
        className="bg-card rounded-2xl border border-border w-full max-w-md max-h-[90vh] overflow-y-auto"
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <h2 className="font-bold text-foreground">
            {promo ? 'Editar promoción' : 'Nueva promoción'}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-lg hover:bg-muted flex items-center justify-center text-muted-foreground"
            aria-label="Cerrar"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="px-5 py-4 space-y-4">
          <div>
            <label className={labelClass}>Nombre *</label>
            <input
              value={nombre}
              onChange={(e) => setNombre(e.target.value)}
              required
              autoFocus
              placeholder="Pago temprano"
              className={inputClass}
            />
            <p className="text-[11px] text-muted-foreground mt-1.5">
              Lo va a ver la clienta en el mail y en el comprobante.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelClass}>Descuento</label>
              <select
                value={tipo}
                onChange={(e) => setTipo(e.target.value as 'porcentaje' | 'monto')}
                className={inputClass}
              >
                <option value="porcentaje">Porcentaje</option>
                <option value="monto">Monto fijo</option>
              </select>
            </div>
            <div>
              <label className={labelClass}>{tipo === 'porcentaje' ? '% *' : '$ *'}</label>
              <input
                type="number"
                inputMode="decimal"
                min={tipo === 'porcentaje' ? 1 : 1}
                max={tipo === 'porcentaje' ? 100 : undefined}
                value={valor}
                onChange={(e) => setValor(e.target.value)}
                required
                placeholder={tipo === 'porcentaje' ? '20' : '10000'}
                className={inputClass}
              />
            </div>
          </div>

          <div>
            <label className={labelClass}>Cuándo vale</label>
            <select
              value={ventana}
              onChange={(e) => setVentana(e.target.value as typeof ventana)}
              className={inputClass}
            >
              <option value="siempre">Siempre</option>
              <option value="dias_mes">Ciertos días de cada mes</option>
              <option value="fechas">Entre dos fechas</option>
            </select>
          </div>

          {ventana === 'dias_mes' && (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={labelClass}>Del día</label>
                <input
                  type="number"
                  min={1}
                  max={31}
                  value={diaDesde}
                  onChange={(e) => setDiaDesde(e.target.value)}
                  className={inputClass}
                />
              </div>
              <div>
                <label className={labelClass}>Al día</label>
                <input
                  type="number"
                  min={1}
                  max={31}
                  value={diaHasta}
                  onChange={(e) => setDiaHasta(e.target.value)}
                  className={inputClass}
                />
              </div>
            </div>
          )}

          {ventana === 'fechas' && (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={labelClass}>Desde</label>
                <input
                  type="date"
                  value={desde}
                  onChange={(e) => setDesde(e.target.value)}
                  required
                  className={inputClass}
                />
              </div>
              <div>
                <label className={labelClass}>Hasta</label>
                <input
                  type="date"
                  value={hasta}
                  onChange={(e) => setHasta(e.target.value)}
                  required
                  className={inputClass}
                />
              </div>
            </div>
          )}

          <div>
            <label className={labelClass}>Código</label>
            <input
              value={codigo}
              onChange={(e) => setCodigo(e.target.value)}
              placeholder="AMIGA"
              className={cn(inputClass, 'uppercase')}
            />
            <p className="text-[11px] text-muted-foreground mt-1.5">
              <strong>Vacío = automática:</strong> se aplica sola al cobrar, sin
              que nadie la pida. Con código hay que escribirlo en el cobro, así
              que sirve para lo que se reparte a algunas y no a todas.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelClass}>Usos en total</label>
              <input
                type="number"
                min={1}
                value={usosMax}
                onChange={(e) => setUsosMax(e.target.value)}
                placeholder="sin tope"
                className={inputClass}
              />
            </div>
            <div>
              <label className={labelClass}>Por clienta</label>
              <input
                type="number"
                min={1}
                value={usosPorCliente}
                onChange={(e) => setUsosPorCliente(e.target.value)}
                placeholder="sin tope"
                className={inputClass}
              />
            </div>
          </div>

          <div>
            <label className={labelClass}>Planes</label>
            {/* Ninguno tildado = todos. Se dice con todas las letras porque
                una lista vacía se lee igual de bien como "ninguno". */}
            <p className="text-[11px] text-muted-foreground mb-2">
              Sin tildar ninguno vale para <strong>todos</strong> los planes.
            </p>
            <div className="space-y-1.5 max-h-40 overflow-y-auto">
              {plans.map((pl) => (
                <label key={pl.id} className="flex items-center gap-2.5 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={planes.includes(pl.id)}
                    onChange={(e) =>
                      setPlanes((prev) =>
                        e.target.checked ? [...prev, pl.id] : prev.filter((x) => x !== pl.id)
                      )
                    }
                  />
                  <span className="text-xs text-foreground">{pl.name}</span>
                </label>
              ))}
            </div>
          </div>

          {error && <p className="text-xs text-destructive-fuerte">{error}</p>}
        </div>

        <div className="flex gap-2 px-5 py-4 border-t border-border">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 py-2.5 rounded-xl border border-border text-sm font-semibold text-foreground hover:bg-muted transition-colors"
          >
            Cancelar
          </button>
          <button
            type="submit"
            disabled={saving || !nombre.trim() || !valorValido}
            className="flex-1 py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-semibold hover:opacity-90 disabled:opacity-40 transition-opacity"
          >
            {saving ? 'Guardando…' : promo ? 'Guardar' : 'Crear promoción'}
          </button>
        </div>
      </form>
    </div>
  )
}

/**
 * Las promociones del estudio.
 *
 * Nacen APAGADAS y la pantalla lo dice: una promo cargada a medias no
 * puede empezar a descontar sola mientras se la termina de escribir. El
 * mismo criterio que los permisos en sombra.
 *
 * El aviso por mail también es un botón aparte, y por el mismo motivo al
 * revés: un mail al padrón entero no se deshace, así que no puede ser un
 * efecto secundario de apretar "Crear".
 */
function PromocionesSection() {
  const { can } = useData()
  const puedeEditar = can('promos.administrar')
  const [promos, setPromos] = useState<Promocion[]>([])
  const [showForm, setShowForm] = useState(false)
  const [editing, setEditing] = useState<Promocion | undefined>()
  const [confirmando, setConfirmando] = useState<string | null>(null)
  const [anunciando, setAnunciando] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [resultado, setResultado] = useState<string | null>(null)

  const recargar = async () => {
    try {
      setPromos(await fetchPromociones())
    } catch {
      setPromos([])
    }
  }
  useEffect(() => {
    void recargar()
  }, [])

  const alternarRige = async (p: Promocion) => {
    setBusy(true)
    setError(null)
    try {
      await setPromocionRige(p.id, !p.rige)
      await recargar()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo cambiar el estado')
    } finally {
      setBusy(false)
    }
  }

  const darDeBaja = async (p: Promocion) => {
    setBusy(true)
    setError(null)
    try {
      await deactivatePromocion(p.id)
      await recargar()
      setConfirmando(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo dar de baja')
    } finally {
      setBusy(false)
    }
  }

  const anunciar = async (p: Promocion, prueba: boolean) => {
    setBusy(true)
    setError(null)
    setResultado(null)
    try {
      const data = await anunciarPromocion(p.id, prueba)
      if (prueba) {
        setResultado('Te mandamos la prueba a tu mail. Mirala antes de anunciarla.')
      } else {
        setResultado(
          `Anunciada: ${data.enviados} de ${data.conMail} mails salieron` +
            (data.enCampana ? `, y ${data.enCampana} avisos en el portal` : '') +
            '.' +
            (data.motivo ? ` No salieron todos: ${data.motivo}` : '') +
            (data.aviso ? ` ${data.aviso}` : '')
        )
        setAnunciando(null)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo enviar')
    } finally {
      setBusy(false)
    }
  }

  const vivas = promos.filter((p) => p.active)

  return (
    <>
      <SeccionPlegable
        id="promociones"
        icono={Tag}
        colorIcono="bg-primary/10 text-primary-fuerte"
        titulo="Promociones"
        ayuda="Descuentos y cupones: cuánto, cuándo y para quién"
        resumen={<Conteo n={vivas.length} singular="promoción" plural="promociones" />}
        accion={
          puedeEditar ? (
            <button
              onClick={() => {
                setEditing(undefined)
                setShowForm(true)
              }}
              className="w-8 h-8 rounded-xl bg-primary/10 text-primary-fuerte flex items-center justify-center hover:bg-primary/20 transition-colors"
              aria-label="Nueva promoción"
            >
              <Plus className="w-4 h-4" />
            </button>
          ) : undefined
        }
      >
        <div className="px-5 py-4 space-y-2">
          <p className="text-[11px] text-muted-foreground pb-1">
            El descuento se aplica <strong>al cobrar la cuota</strong>, y lo
            calcula la base: la pantalla no puede cobrar otra cosa. Una promo
            reemplaza al ajuste del medio de pago, no se suman.
          </p>

          {vivas.length === 0 && (
            <p className="text-xs text-muted-foreground">
              Todavía no hay promociones. Si acabás de correr la migración 0079 y
              no ves nada, es porque ninguna se creó aún — no es un error.
            </p>
          )}

          {!puedeEditar && vivas.length > 0 && (
            <p className="text-[11px] text-muted-foreground">
              Tu rol puede ver las promociones pero no modificarlas.
            </p>
          )}

          {vivas.map((p) => (
            <div key={p.id} className="rounded-xl border border-border px-3 py-2 space-y-1.5">
              <div className="flex items-center gap-2">
                <span className="flex-1 text-sm text-foreground truncate">{p.nombre}</span>
                {p.codigo && (
                  <span className="text-[10px] font-mono text-primary-fuerte bg-primary/10 px-2 py-0.5 rounded-full shrink-0">
                    {p.codigo}
                  </span>
                )}
                {!p.rige && (
                  <span className="text-[10px] text-aviso-fuerte bg-aviso/15 px-2 py-0.5 rounded-full shrink-0">
                    no rige
                  </span>
                )}
                {puedeEditar && (
                  confirmando === p.id ? (
                    <>
                      <span className="text-[11px] text-aviso-fuerte shrink-0">¿Darla de baja?</span>
                      <button
                        disabled={busy}
                        onClick={() => darDeBaja(p)}
                        className="px-2 h-7 rounded-lg bg-destructive/10 text-destructive-fuerte text-[11px] font-semibold hover:bg-destructive/20"
                      >
                        Sí
                      </button>
                      <button
                        onClick={() => setConfirmando(null)}
                        className="w-7 h-7 rounded-lg hover:bg-muted flex items-center justify-center text-muted-foreground"
                        aria-label="No dar de baja"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </>
                  ) : (
                    <>
                      {p.rige && (
                        <button
                          onClick={() => {
                            setResultado(null)
                            setAnunciando(anunciando === p.id ? null : p.id)
                          }}
                          className="w-7 h-7 rounded-lg hover:bg-muted flex items-center justify-center text-muted-foreground hover:text-foreground"
                          aria-label={`Avisar por mail: ${p.nombre}`}
                        >
                          <Send className="w-3.5 h-3.5" />
                        </button>
                      )}
                      <button
                        onClick={() => {
                          setEditing(p)
                          setShowForm(true)
                        }}
                        className="w-7 h-7 rounded-lg hover:bg-muted flex items-center justify-center text-muted-foreground hover:text-foreground"
                        aria-label={`Editar ${p.nombre}`}
                      >
                        <Pencil className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => setConfirmando(p.id)}
                        className="w-7 h-7 rounded-lg hover:bg-destructive/10 flex items-center justify-center text-muted-foreground hover:text-destructive-fuerte"
                        aria-label={`Dar de baja ${p.nombre}`}
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </>
                  )
                )}
              </div>

              <div className="flex items-center gap-2">
                <span className="text-[11px] text-muted-foreground flex-1">{comoSeLee(p)}</span>
                {puedeEditar && (
                  <button
                    disabled={busy}
                    onClick={() => alternarRige(p)}
                    className={cn(
                      'text-[11px] font-semibold px-2 h-6 rounded-lg transition-colors disabled:opacity-40',
                      p.rige
                        ? 'bg-exito/15 text-exito-fuerte hover:bg-exito/25'
                        : 'bg-muted text-muted-foreground hover:bg-border'
                    )}
                  >
                    {p.rige ? 'Descontando' : 'Encender'}
                  </button>
                )}
              </div>

              {anunciando === p.id && (
                <div className="rounded-lg bg-muted/60 p-2.5 space-y-2">
                  <p className="text-[11px] text-foreground">
                    Les llega un mail a todas las clientas activas con mail
                    cargado, y un aviso en el portal a todas. <strong>Esto no se
                    deshace</strong>, así que conviene mandarse la prueba primero.
                  </p>
                  <div className="flex gap-2">
                    <button
                      disabled={busy}
                      onClick={() => anunciar(p, true)}
                      className="flex-1 h-8 rounded-lg border border-border text-[11px] font-semibold text-foreground hover:bg-card disabled:opacity-40"
                    >
                      Probar conmigo
                    </button>
                    <button
                      disabled={busy}
                      onClick={() => anunciar(p, false)}
                      className="flex-1 h-8 rounded-lg bg-primary text-primary-foreground text-[11px] font-semibold hover:opacity-90 disabled:opacity-40"
                    >
                      {busy ? 'Enviando…' : 'Avisarles a todas'}
                    </button>
                  </div>
                </div>
              )}
            </div>
          ))}

          {resultado && <p className="text-xs text-exito-fuerte">{resultado}</p>}
          {error && <p className="text-xs text-destructive-fuerte">{error}</p>}
        </div>
      </SeccionPlegable>

      {showForm && (
        <PromocionFormModal
          promo={editing}
          onClose={() => setShowForm(false)}
          onSaved={recargar}
        />
      )}
    </>
  )
}

function PaymentMethodsSection({ cuentas }: { cuentas: Account[] }) {
  const { refresh, canWrite } = useData()
  const { paymentMethods } = useStudio()
  const [newName, setNewName] = useState('')
  const [editingCode, setEditingCode] = useState<string | null>(null)
  const [editName, setEditName] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const run = async (action: () => Promise<void>) => {
    setBusy(true)
    setError(null)
    try {
      await action()
      await refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo guardar')
    } finally {
      setBusy(false)
    }
  }

  return (
    <SeccionPlegable
      id="medios-de-pago"
      icono={Wallet}
      colorIcono="bg-primary/10 text-primary-fuerte"
      titulo="Medios de pago"
      ayuda="Con los que se puede cobrar, a qué cuenta va cada uno y qué le hace al precio"
      resumen={
        <Conteo
          n={paymentMethods.filter((m) => m.active).length}
          singular="medio activo"
          plural="medios activos"
        />
      }
    >
      <div className="px-5 py-4 space-y-2">
        <p className="text-[11px] text-muted-foreground pb-1">
          El porcentaje ajusta el precio de lista al cobrar: <strong>−5</strong> es
          cinco por ciento de descuento, <strong>25</strong> es veinticinco por
          ciento de recargo, <strong>0</strong> deja el precio tal cual.
        </p>
        {/* Que este número salga en la web es de la 0056, y quien lo edita
            tiene que saberlo antes de tocarlo: es el mismo número en los
            dos lados justamente para que no puedan decir cosas distintas. */}
        <p className="text-[11px] text-muted-foreground pb-1">
          Los <strong>descuentos</strong> se publican en la web, debajo de los
          planes. Los recargos no.
        </p>
        <p className="text-[11px] text-muted-foreground pb-1">
          La <strong>cuenta</strong> es a dónde entra la plata cobrada con ese
          medio. Las cuentas se cargan arriba, en su propia sección.
        </p>
        {paymentMethods.length === 0 && (
          <p className="text-xs text-muted-foreground">
            Sin medios cargados. Corré la migración 0011.
          </p>
        )}
        {paymentMethods.map((m) => (
          <div key={m.code} className="flex items-center gap-2 rounded-xl border border-border px-3 py-2">
            {editingCode === m.code ? (
              <>
                <input
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  className="flex-1 bg-transparent text-sm text-foreground outline-none"
                  autoFocus
                />
                <button
                  disabled={busy || !editName.trim()}
                  onClick={() =>
                    run(async () => {
                      await renamePaymentMethod(m.code, editName)
                      setEditingCode(null)
                    })
                  }
                  className="w-7 h-7 rounded-lg hover:bg-exito-suave flex items-center justify-center text-muted-foreground hover:text-exito-fuerte"
                  aria-label="Guardar nombre"
                >
                  <Check className="w-3.5 h-3.5" />
                </button>
                <button
                  onClick={() => setEditingCode(null)}
                  className="w-7 h-7 rounded-lg hover:bg-muted flex items-center justify-center text-muted-foreground"
                  aria-label="Cancelar"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </>
            ) : (
              <>
                <span className={cn('flex-1 text-sm', m.active ? 'text-foreground' : 'text-muted-foreground line-through')}>
                  {m.name}
                </span>
                {!m.isManual && (
                  <span className="text-[10px] text-muted-foreground bg-muted px-2 py-0.5 rounded-full">
                    automático
                  </span>
                )}
                {/* A qué cuenta va la plata de este medio. Es el
                    `default_account_id` que la 0020 dejó en la tabla y que
                    hasta hoy no tenía dónde configurarse: la base ya imputa
                    el cobro sola leyendo esta columna, así que con elegir
                    acá alcanza para que la caja lo refleje.

                    Un medio sin cuenta no pierde la plata: cae en "A
                    imputar", que es visible y corregible. Por eso la opción
                    vacía existe y lo dice. */}
                {canWrite && cuentas.length > 0 && (
                  <select
                    value={m.defaultAccountId ?? ''}
                    disabled={busy}
                    onChange={(e) => {
                      const id = e.target.value || null
                      if (id !== (m.defaultAccountId ?? null)) {
                        run(() => setMethodAccount(m.code, id))
                      }
                    }}
                    className="shrink-0 max-w-[9rem] px-2 py-1 rounded-lg border border-border bg-background text-xs text-foreground outline-none focus:border-primary"
                    aria-label={`Cuenta de ${m.name}`}
                  >
                    <option value="">Sin cuenta (a imputar)</option>
                    {cuentas
                      // Un medio que acredita una integración no puede ir a
                      // una caja que se arquea: la plata no está en el
                      // cajón. La base lo rechaza con un trigger; acá
                      // directamente no se ofrece.
                      .filter((c) => !c.isSystem && (m.isManual || !c.arquea))
                      .map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name}
                        </option>
                      ))}
                  </select>
                )}
                {!canWrite && m.defaultAccountId && (
                  <span className="text-[11px] text-muted-foreground shrink-0 truncate max-w-[9rem]">
                    {cuentas.find((c) => c.id === m.defaultAccountId)?.name ?? '—'}
                  </span>
                )}
                {/* El ajuste se edita acá mismo: es un número y esto es su
                    lugar natural. Vacío o cero = el precio de lista. */}
                {canWrite ? (
                  <span className="flex items-center gap-1 shrink-0">
                    <input
                      type="number"
                      step="0.5"
                      min="-100"
                      max="100"
                      defaultValue={m.ajustePct}
                      disabled={busy}
                      onBlur={(e) => {
                        const v = Number(e.target.value) || 0
                        if (v !== m.ajustePct) run(() => setPaymentMethodAjuste(m.code, v))
                      }}
                      className="w-16 px-2 py-1 rounded-lg border border-border bg-background text-xs text-foreground text-right tabular-nums outline-none focus:border-primary"
                      aria-label={`Ajuste de ${m.name}`}
                    />
                    <span className="text-xs text-muted-foreground">%</span>
                  </span>
                ) : m.ajustePct !== 0 ? (
                  <span className="text-xs text-muted-foreground tabular-nums shrink-0">
                    {m.ajustePct > 0 ? '+' : ''}{m.ajustePct}%
                  </span>
                ) : null}
                {canWrite && (
                  <>
                    <button
                      onClick={() => {
                        setEditingCode(m.code)
                        setEditName(m.name)
                      }}
                      className="w-7 h-7 rounded-lg hover:bg-muted flex items-center justify-center text-muted-foreground hover:text-foreground"
                      aria-label={`Renombrar ${m.name}`}
                    >
                      <Pencil className="w-3.5 h-3.5" />
                    </button>
                    <button
                      disabled={busy}
                      onClick={() => run(() => setPaymentMethodActive(m.code, !m.active))}
                      className="w-7 h-7 rounded-lg hover:bg-muted flex items-center justify-center text-muted-foreground hover:text-foreground"
                      aria-label={m.active ? `Desactivar ${m.name}` : `Activar ${m.name}`}
                    >
                      {m.active ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                    </button>
                  </>
                )}
              </>
            )}
          </div>
        ))}

        {canWrite && (
          <div className="flex items-center gap-2 pt-1">
            <input
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="Nuevo medio de pago (ej: Cuenta DNI)"
              className="flex-1 px-3 py-2 rounded-xl border border-border bg-background text-sm text-foreground outline-none focus:border-primary/50"
            />
            <button
              disabled={busy || !newName.trim()}
              onClick={() =>
                run(async () => {
                  await createPaymentMethod(newName, newName)
                  setNewName('')
                })
              }
              className="w-9 h-9 rounded-xl bg-primary/10 text-primary-fuerte flex items-center justify-center hover:bg-primary/20 disabled:opacity-40"
              aria-label="Agregar medio de pago"
            >
              <Plus className="w-4 h-4" />
            </button>
          </div>
        )}

        {error && <p className="text-xs text-destructive-fuerte">{error}</p>}
      </div>
    </SeccionPlegable>
  )
}

const ROLES_MATRIZ: Array<{ key: Role; label: string }> = [
  { key: 'admin', label: 'Admin' },
  { key: 'recepcion', label: 'Recepción' },
  { key: 'profesor', label: 'Profesor/a' },
  { key: 'alumno', label: 'Cliente' },
]

/** Por qué una clave no se puede tocar. */
const MOTIVO_BLOQUEO: Record<string, string> = {
  fija: 'La necesitan todos para que el portal y la web funcionen',
  estructural: 'Tildarla dejaría a alguien elevarse a sí mismo',
  servicio: 'Es del sistema (procesos automáticos), no de una persona',
  futuro: 'El módulo todavía no existe',
}

function PermisosSection() {
  const { profile } = useData()
  const [matriz, setMatriz] = useState<PermissionMatrix | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [abierto, setAbierto] = useState<string | null>(null)

  const load = () => {
    fetchPermissionMatrix()
      .then((m) => {
        setMatriz(m)
        setLoadError(null)
      })
      .catch((err) => setLoadError(err instanceof Error ? err.message : 'No se pudo cargar'))
  }

  useEffect(load, [])

  // Solo el admin administra permisos, y la base lo exige igual.
  if (profile?.role !== 'admin') return null

  const toggle = async (role: Role, k: PermissionKey, granted: boolean) => {
    const id = `${role}|${k.clave}`
    setBusy(id)
    setError(null)
    try {
      await setRolePermission(role, k.clave, !granted)
      setMatriz((m) => {
        if (!m) return m
        const next = new Set(m.granted)
        if (granted) next.delete(id)
        else next.add(id)
        return { ...m, granted: next }
      })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo guardar')
    } finally {
      setBusy(null)
    }
  }

  const grupos = matriz
    ? [...new Set(matriz.keys.map((k) => k.grupo))]
    : []
  const enSombra = matriz?.keys.filter((k) => k.modo === 'sombra').length ?? 0
  const total = matriz?.keys.length ?? 0

  return (
    <SeccionPlegable
      id="permisos"
      icono={ShieldCheck}
      titulo="Permisos"
      ayuda="Qué puede hacer cada rol"
      resumen={
        // Que algo esté en sombra es lo que más conviene ver sin abrir:
        // significa que lo que se tilde acá todavía no rige.
        matriz && enSombra > 0 ? (
          <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-aviso-suave text-aviso-fuerte">
            {enSombra === total ? 'En sombra' : `${enSombra} en sombra`}
          </span>
        ) : (
          <Conteo n={total} singular="permiso" plural="permisos" />
        )
      }
    >
      {loadError && (
        <p className="px-5 py-4 text-xs text-destructive-fuerte">
          {loadError} — si dice que la tabla no existe, falta correr la migración 0012.
        </p>
      )}

      {matriz && enSombra > 0 && (
        <div className="mx-5 mt-4 rounded-xl bg-aviso-suave border border-aviso/40 px-4 py-3 flex gap-2.5">
          <Info className="w-4 h-4 text-aviso-fuerte shrink-0 mt-0.5" />
          <div className="text-xs text-aviso-fuerte leading-relaxed">
            <strong>
              {enSombra === total
                ? 'Los permisos todavía no están en vigencia.'
                : `${enSombra} de ${total} permisos todavía no están en vigencia.`}
            </strong>{' '}
            Cada rol sigue funcionando como venía. Podés dejar la matriz como la
            querés y recién después se activa, de a un grupo por vez, para que si
            algo queda mal se vea en el momento y no en medio de la jornada.
          </div>
        </div>
      )}

      {error && <p className="px-5 pt-4 text-xs text-destructive-fuerte">{error}</p>}

      <div className="px-5 py-4 space-y-5">
        {grupos.map((grupo) => {
          const claves = matriz!.keys.filter((k) => k.grupo === grupo)
          return (
            <div key={grupo}>
              <h3 className="text-[11px] font-bold text-muted-foreground uppercase tracking-wide mb-2">
                {grupo}
              </h3>

              <div className="rounded-xl border border-border overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-border bg-muted/40">
                      <th className="text-left font-semibold text-muted-foreground px-3 py-2">
                        Puede…
                      </th>
                      {ROLES_MATRIZ.map((r) => (
                        <th
                          key={r.key}
                          className="font-semibold text-muted-foreground px-2 py-2 w-20 text-center"
                        >
                          {r.label}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {claves.map((k) => {
                      const bloqueada = k.tipo !== 'permiso'
                      return (
                        <tr key={k.clave} className="border-b border-border last:border-0">
                          <td className="px-3 py-2 align-top">
                            <button
                              type="button"
                              onClick={() => setAbierto(abierto === k.clave ? null : k.clave)}
                              className="text-left"
                            >
                              <span className="text-foreground font-medium flex items-center gap-1.5">
                                {k.etiqueta}
                                {bloqueada && <Lock className="w-3 h-3 text-muted-foreground" />}
                              </span>
                              {abierto === k.clave && (
                                <span className="block text-[11px] text-muted-foreground mt-1 max-w-md">
                                  {bloqueada && (
                                    <strong className="block text-foreground/70">
                                      No se puede cambiar: {MOTIVO_BLOQUEO[k.tipo]}.
                                    </strong>
                                  )}
                                  {k.ayuda}
                                </span>
                              )}
                            </button>
                          </td>

                          {ROLES_MATRIZ.map((r) => {
                            const id = `${r.key}|${k.clave}`
                            const granted = matriz!.granted.has(id)
                            return (
                              <td key={r.key} className="px-2 py-2 text-center">
                                <button
                                  type="button"
                                  disabled={bloqueada || busy === id}
                                  onClick={() => toggle(r.key, k, granted)}
                                  aria-label={`${k.etiqueta} — ${r.label}`}
                                  className={cn(
                                    'w-5 h-5 rounded-md border transition-colors inline-flex items-center justify-center',
                                    granted
                                      ? 'bg-primary border-primary text-primary-foreground'
                                      : 'bg-background border-border',
                                    bloqueada
                                      ? 'opacity-40 cursor-not-allowed'
                                      : 'hover:border-primary/60'
                                  )}
                                >
                                  {busy === id ? (
                                    <Loader2 className="w-3 h-3 animate-spin" />
                                  ) : granted ? (
                                    <Check className="w-3 h-3" />
                                  ) : null}
                                </button>
                              </td>
                            )
                          })}
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )
        })}

        {matriz && (
          <p className="text-[11px] text-muted-foreground leading-relaxed">
            Tocá el nombre de un permiso para ver qué hace exactamente. Los que
            tienen candado no se pueden cambiar, y el motivo está ahí explicado.
            <br />
            Ojo con una cosa: sacarle <strong>Ver información financiera</strong> a
            un rol le esconde los pagos y la facturación, pero no el precio que
            figura en la membresía de cada cliente. La base filtra por dato, no por
            campo suelto.
          </p>
        )}
      </div>
    </SeccionPlegable>
  )
}

export function ConfiguracionPage() {
  const { settingsMeta } = useStudio()

  // Las cuentas no viajan en el paquete del estudio —son del módulo de
  // Caja— así que se leen acá una sola vez y se bajan a las dos secciones
  // que las necesitan: la que las administra y la que le asigna una a cada
  // medio de pago. Si cada una las leyera por su cuenta, crear una cuenta
  // no la haría aparecer en el selector de al lado hasta recargar.
  //
  // Se piden las activas nomás: una cuenta dada de baja no tiene que poder
  // elegirse como destino de un medio.
  const [cuentas, setCuentas] = useState<Account[]>([])
  const recargarCuentas = async () => {
    // Sin permiso sobre `accounts` la consulta vuelve vacía, no con error
    // (RLS filtra filas). La sección lo dice con su propio cartel en vez
    // de mostrar una lista vacía sin explicación.
    try {
      setCuentas(await fetchAccounts())
    } catch {
      setCuentas([])
    }
  }
  useEffect(() => {
    void recargarCuentas()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Los grupos salen del catálogo, no de una lista escrita acá: cuando un
  // módulo nuevo agrega sus parámetros con un INSERT, su sección aparece
  // sola. 'estudio' va aparte porque tiene su propio encabezado.
  const gruposDeReglas = [...new Set(settingsMeta.map((s) => s.group))]
    .filter((g) => g !== 'estudio')
    // El orden lo da NOMBRE_GRUPO, que va de lo más cotidiano a lo más
    // administrativo. Un grupo que todavía no esté ahí va al final, no en
    // el medio por orden alfabético.
    .sort((a, b) => {
      const claves = Object.keys(NOMBRE_GRUPO)
      const pos = (g: string) => {
        const i = claves.indexOf(g)
        return i === -1 ? claves.length : i
      }
      return pos(a) - pos(b) || a.localeCompare(b)
    })

  return (
    <SeccionesPlegables memoria="configuracion">
      <div className="p-4 md:p-6 max-w-2xl space-y-7">
        <BarraDeControl />

        <BloqueDeSecciones icono={Building2} titulo="El estudio">
          <SettingsSection group="estudio" />
        </BloqueDeSecciones>

        <BloqueDeSecciones icono={SlidersHorizontal} titulo="Reglas del negocio">
          {gruposDeReglas.map((g) => (
            <SettingsSection key={g} group={g} />
          ))}
        </BloqueDeSecciones>

        <BloqueDeSecciones icono={Shapes} titulo="Catálogos">
          <DisciplinesSection />
          <CuentasSection cuentas={cuentas} recargar={recargarCuentas} />
          <PaymentMethodsSection cuentas={cuentas} />
          <PromocionesSection />
        </BloqueDeSecciones>

        <BloqueDeSecciones icono={Users} titulo="Equipo y espacios">
          <TeachersSection />
          <RoomsSection />
        </BloqueDeSecciones>

        <BloqueDeSecciones icono={UserPlus} titulo="Accesos">
          <UsersSection />
          <PermisosSection />
        </BloqueDeSecciones>

        <BloqueDeSecciones icono={Settings} titulo="Integraciones">
          <MercadoPagoSection />
        </BloqueDeSecciones>
      </div>
    </SeccionesPlegables>
  )
}

/**
 * Un bloque agrupa secciones afines bajo un rótulo. El rótulo no se
 * plega: es lo que queda fijo para orientarse cuando todo lo demás está
 * cerrado.
 */
function BloqueDeSecciones({
  icono: Icono,
  titulo,
  children,
}: {
  icono: React.ComponentType<{ className?: string }>
  titulo: string
  children: React.ReactNode
}) {
  return (
    <section>
      <h2 className="flex items-center gap-2 text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2.5 px-1">
        <Icono className="w-3.5 h-3.5" />
        {titulo}
      </h2>
      <div className="space-y-2.5">{children}</div>
    </section>
  )
}

/** Abrir o cerrar todo de una vez, para quien vino a revisar y no a tocar. */
function BarraDeControl() {
  const { cantidadAbiertas, desplegarTodo, contraerTodo } = useSeccionesPlegables()
  const todoCerrado = cantidadAbiertas === 0

  return (
    <div className="flex items-center justify-between gap-3 flex-wrap">
      <p className="text-xs text-muted-foreground">
        Tocá el título de cada sección para abrirla o cerrarla. El sistema
        recuerda cómo la dejaste.
      </p>
      <button
        onClick={todoCerrado ? desplegarTodo : contraerTodo}
        className="shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-border bg-card text-xs font-semibold text-muted-foreground hover:text-foreground hover:border-primary/40 transition-colors"
      >
        {todoCerrado ? (
          <>
            <ChevronsUpDown className="w-3.5 h-3.5" />
            Desplegar todo
          </>
        ) : (
          <>
            <ChevronsDownUp className="w-3.5 h-3.5" />
            Contraer todo
          </>
        )}
      </button>
    </div>
  )
}
