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
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { useData, useStudio } from '@/lib/data-context'
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
  createSystemUser,
  deleteSystemUser,
  updateUserRole,
  type MpAccountInfo,
  type TeacherInput,
} from '@/lib/api'
import type { Discipline, Profile, Role, Teacher } from '@/lib/types'

const ALL_DISCIPLINES: Discipline[] = [
  'Pilates Mat',
  'Pilates Reformer',
  'Pilates Clínico',
  'Yoga',
  'Stretching',
  'Funcional',
]

const TEACHER_COLORS = ['#C4735A', '#7D9B76', '#D4A854', '#9B6E8E', '#5E8FA8', '#B8956A']

const ROLE_LABELS: Record<string, string> = {
  admin: 'Admin',
  recepcion: 'Recepción',
  profesor: 'Profesor/a',
  alumno: 'Alumno/a',
}

const inputClass =
  'w-full px-3 py-2.5 rounded-xl border border-border bg-background text-sm text-foreground placeholder:text-muted-foreground outline-none focus:border-primary transition-colors'
const labelClass =
  'text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1.5 block'

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

function TeacherFormModal({ teacher, onClose }: { teacher?: Teacher; onClose: () => void }) {
  const { refresh } = useData()
  const isEdit = !!teacher
  const [name, setName] = useState(teacher?.name ?? '')
  const [disciplines, setDisciplines] = useState<Discipline[]>(teacher?.disciplines ?? [])
  const [phone, setPhone] = useState(teacher?.phone ?? '')
  const [email, setEmail] = useState(teacher?.email ?? '')
  const [color, setColor] = useState(teacher?.color ?? TEACHER_COLORS[0])
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
    const input: TeacherInput = { name, disciplines, phone, email, color }
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
              {ALL_DISCIPLINES.map((d) => {
                const active = disciplines.includes(d)
                return (
                  <button
                    key={d}
                    type="button"
                    onClick={() => toggleDiscipline(d)}
                    className={cn(
                      'px-3 py-1.5 rounded-xl border text-xs font-medium transition-colors',
                      active
                        ? 'border-primary bg-primary/10 text-primary'
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
          {error && <p className="text-sm text-destructive bg-destructive/10 rounded-xl px-3 py-2">{error}</p>}
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

  const handleDelete = async (t: Teacher) => {
    if (!window.confirm(`¿Dar de baja a ${t.name}? Sus clases quedan en la agenda hasta que las edites.`)) return
    await deactivateTeacher(t.id)
    await refresh()
  }

  return (
    <div className="bg-card rounded-2xl border border-border overflow-hidden">
      <div className="flex items-center justify-between px-5 py-4 border-b border-border">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center">
            <Users className="w-5 h-5 text-primary" />
          </div>
          <div>
            <h2 className="text-sm font-bold text-foreground">Profesores</h2>
            <p className="text-xs text-muted-foreground">Equipo del estudio y sus disciplinas</p>
          </div>
        </div>
        {canWrite && (
          <button
            onClick={() => {
              setEditing(undefined)
              setShowForm(true)
            }}
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-primary text-primary-foreground text-xs font-semibold hover:opacity-90 transition-opacity"
          >
            <Plus className="w-3.5 h-3.5" />
            Agregar
          </button>
        )}
      </div>

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
                  className="w-8 h-8 rounded-lg hover:bg-destructive/10 flex items-center justify-center text-muted-foreground hover:text-destructive transition-colors"
                  aria-label={`Dar de baja a ${t.name}`}
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </>
            )}
          </div>
        ))}
      </div>

      {showForm && <TeacherFormModal teacher={editing} onClose={() => setShowForm(false)} />}
    </div>
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
    <div className="bg-card rounded-2xl border border-border overflow-hidden">
      <div className="flex items-center gap-3 px-5 py-4 border-b border-border">
        <div className="w-9 h-9 rounded-xl bg-accent/10 flex items-center justify-center">
          <DoorOpen className="w-5 h-5 text-accent" />
        </div>
        <div>
          <h2 className="text-sm font-bold text-foreground">Salas</h2>
          <p className="text-xs text-muted-foreground">Espacios disponibles para las clases</p>
        </div>
      </div>

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
                  className="w-7 h-7 rounded-lg hover:bg-[#E8F2EB] flex items-center justify-center text-muted-foreground hover:text-[#2E6040]"
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
                      className="w-7 h-7 rounded-lg hover:bg-destructive/10 flex items-center justify-center text-muted-foreground hover:text-destructive"
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
        {error && <p className="text-sm text-destructive bg-destructive/10 rounded-xl px-3 py-2">{error}</p>}
      </div>
    </div>
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
        className="bg-card rounded-2xl shadow-2xl w-full max-w-md border border-border overflow-hidden"
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
              <option value="recepcion">Recepción — gestiona alumnos, reservas y cobros</option>
              <option value="profesor">Profesor/a — solo consulta</option>
              <option value="admin">Admin — acceso total y configuración</option>
            </select>
          </div>
          {error && <p className="text-sm text-destructive bg-destructive/10 rounded-xl px-3 py-2">{error}</p>}
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
    if (!window.confirm(`¿Eliminar el usuario ${u.email}? Pierde el acceso al sistema.`)) return
    setBusyId(u.id)
    try {
      await deleteSystemUser(u.id)
      load()
    } catch (err) {
      window.alert(err instanceof Error ? err.message : 'No se pudo eliminar')
    } finally {
      setBusyId(null)
    }
  }

  return (
    <div className="bg-card rounded-2xl border border-border overflow-hidden">
      <div className="flex items-center justify-between px-5 py-4 border-b border-border">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-[#5E8FA8]/10 flex items-center justify-center">
            <UserPlus className="w-5 h-5 text-[#5E8FA8]" />
          </div>
          <div>
            <h2 className="text-sm font-bold text-foreground">Usuarios del sistema</h2>
            <p className="text-xs text-muted-foreground">Quiénes pueden ingresar y con qué permisos</p>
          </div>
        </div>
        <button
          onClick={() => setShowForm(true)}
          className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-primary text-primary-foreground text-xs font-semibold hover:opacity-90 transition-opacity"
        >
          <Plus className="w-3.5 h-3.5" />
          Agregar
        </button>
      </div>

      <div className="divide-y divide-border">
        {loadError && <p className="px-5 py-4 text-sm text-destructive">{loadError}</p>}
        {users.map((u) => {
          const isSelf = u.id === profile.id
          return (
            <div key={u.id} className="flex items-center gap-3 px-5 py-3.5 flex-wrap">
              <div className="flex-1 min-w-40">
                <p className="text-sm font-semibold text-foreground truncate">
                  {u.fullName || u.email}
                  {isSelf && <span className="ml-2 text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-primary/10 text-primary">Vos</span>}
                </p>
                <p className="text-xs text-muted-foreground truncate">{u.email}</p>
              </div>
              {isSelf ? (
                <span className="text-xs font-semibold text-muted-foreground px-3">{ROLE_LABELS[u.role]}</span>
              ) : (
                <>
                  <select
                    value={u.role}
                    disabled={busyId === u.id}
                    onChange={(e) => handleRole(u, e.target.value as Role)}
                    className="px-2.5 py-1.5 rounded-lg border border-border bg-background text-xs text-foreground outline-none focus:border-primary"
                  >
                    {Object.entries(ROLE_LABELS).map(([value, label]) => (
                      <option key={value} value={value}>
                        {label}
                      </option>
                    ))}
                  </select>
                  <button
                    disabled={busyId === u.id}
                    onClick={() => handleDelete(u)}
                    className="w-8 h-8 rounded-lg hover:bg-destructive/10 flex items-center justify-center text-muted-foreground hover:text-destructive transition-colors disabled:opacity-50"
                    aria-label={`Eliminar ${u.email}`}
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </>
              )}
            </div>
          )
        })}
      </div>

      {showForm && <UserFormModal onClose={() => setShowForm(false)} onCreated={load} />}
    </div>
  )
}

export function ConfiguracionPage() {
  return (
    <div className="p-6 max-w-2xl space-y-8">
      <div>
        <div className="flex items-center gap-2 text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-4">
          <Users className="w-4 h-4" />
          Equipo y espacios
        </div>
        <div className="space-y-5">
          <TeachersSection />
          <RoomsSection />
        </div>
      </div>

      <div>
        <div className="flex items-center gap-2 text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-4">
          <UserPlus className="w-4 h-4" />
          Accesos
        </div>
        <UsersSection />
      </div>

      <div>
        <div className="flex items-center gap-2 text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-4">
          <Settings className="w-4 h-4" />
          Integraciones
        </div>
        <MercadoPagoSection />
      </div>
    </div>
  )
}
