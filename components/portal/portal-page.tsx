'use client'

import { useEffect, useMemo, useState } from 'react'
import {
  BookOpen,
  CalendarDays,
  CalendarPlus,
  CheckCircle2,
  ChevronDown,
  ClipboardList,
  ChevronLeft,
  ChevronRight,
  Clock,
  CreditCard,
  Home,
  KeyRound,
  Loader2,
  LogOut,
  MapPin,
  RefreshCw,
  User,
  X,
  XCircle,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { Sello } from '@/components/layout/logotipo'
import { supabase } from '@/lib/supabase'
import { useData, useStudio } from '@/lib/data-context'
import { disciplineStyle } from '@/lib/disciplines'
import { NotificationsBell } from '@/components/layout/notifications-bell'
import { AvisosEnEsteCelu } from '@/components/pwa/avisos-en-este-celu'
import { InstalarEnElCelu } from '@/components/pwa/instalar-en-el-celu'
import {
  addDays,
  mondayOf,
  ahoraDelEstudio,
  reservaCerrada,
  cancelacionEnPlazo,
  createReservation,
  updateReservationStatus,
  fetchWeekOccupancy,
  type Occupancy,
  credencial,
  cuentaDeDias,
  settingBool,
  suerteDeLaReserva,
  enDias,
  settingNum,
  settingText,
  esOferta,
  ordenDeCobro,
} from '@/lib/api'
import type { Discipline, Membership, Reservation, Student } from '@/lib/types'

const DAYS_SHORT = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb']
const MONTHS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']

function pretty(iso: string): string {
  const [, m, d] = iso.split('-').map(Number)
  return `${d} ${MONTHS[m - 1]}`
}

function ChangePasswordModal({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const [password, setPassword] = useState('')
  const [password2, setPassword2] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const inputClass =
    'w-full px-3 py-2.5 rounded-xl border border-border bg-background text-sm text-foreground placeholder:text-muted-foreground outline-none focus:border-primary transition-colors'
  const labelClass = 'text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1.5 block'

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
          ? 'La contraseña nueva tiene que ser distinta a la actual'
          : 'No se pudo cambiar la contraseña. Probá de nuevo.'
      )
      return
    }
    onDone()
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-foreground/20 backdrop-blur-sm"
      onClick={onClose}
    >
      <form
        onSubmit={handleSubmit}
        className="bg-card rounded-2xl shadow-2xl w-full max-w-sm border border-border max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <h2 className="text-base font-bold text-foreground">Cambiar contraseña</h2>
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-full hover:bg-muted flex items-center justify-center text-muted-foreground"
            aria-label="Cerrar"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="px-5 py-5 space-y-4">
          <div>
            <label className={labelClass}>Contraseña nueva</label>
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
          <div>
            <label className={labelClass}>Repetir contraseña</label>
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
          {error && (
            <p className="text-sm text-destructive-fuerte bg-destructive/10 rounded-xl px-3 py-2">{error}</p>
          )}
          <button
            type="submit"
            disabled={saving}
            className="w-full py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-semibold hover:opacity-90 transition-opacity disabled:opacity-60 flex items-center justify-center gap-2"
          >
            {saving && <Loader2 className="w-4 h-4 animate-spin" />}
            {saving ? 'Guardando...' : 'Guardar'}
          </button>
        </div>
      </form>
    </div>
  )
}

function MembershipCard({ student }: { student: Student }) {
  const ms = student.membership
  if (!ms) {
    return (
      <div className="bg-card rounded-2xl border border-border p-5 text-center">
        <BookOpen className="w-8 h-8 mx-auto mb-2 text-muted-foreground opacity-40" />
        <p className="text-sm font-semibold text-foreground mb-1">Sin membresía activa</p>
        <p className="text-xs text-muted-foreground">
          Consultá en recepción para activar tu plan y empezar a reservar.
        </p>
      </div>
    )
  }

  const left = ms.classesTotal - ms.classesUsed
  const pct = Math.min(100, Math.round((ms.classesUsed / ms.classesTotal) * 100))
  const statusCfg =
    ms.status === 'activa'
      ? { label: 'Activa', class: 'bg-exito-suave text-exito-fuerte' }
      : ms.status === 'por vencer'
      ? { label: 'Por vencer', class: 'bg-aviso-suave text-aviso-fuerte' }
      : ms.status === 'vencida'
      ? { label: 'Vencida', class: 'bg-destructive-suave text-destructive-fuerte' }
      : ms.status === 'futura'
      ? { label: 'Empieza después', class: 'bg-info-suave text-info-fuerte' }
      // 'cancelada' (0069) tiene su propio rótulo: caía en el `else` y la
      // clienta leía "Suspendida", que es otra cosa — suspendida sugiere
      // que vuelve. El estado existe desde que el estudio puede cancelar
      // un período, y este `else` es de cuando no existía.
      : ms.status === 'cancelada'
      ? { label: 'Cancelada', class: 'bg-muted text-muted-foreground' }
      : { label: 'Suspendida', class: 'bg-muted text-muted-foreground' }

  return (
    <div className="bg-card rounded-2xl border border-border p-5">
      <div className="flex items-start justify-between gap-2 mb-3">
        <div>
          <p className="text-xs text-muted-foreground">Tu plan</p>
          <h2 className="text-lg font-bold text-foreground">{ms.planName}</h2>
        </div>
        <span className={cn('text-[10px] font-semibold px-2.5 py-1 rounded-full', statusCfg.class)}>
          {statusCfg.label}
        </span>
      </div>

      <div className="flex items-center gap-3 mb-1.5">
        <div className="flex-1 h-2.5 rounded-full bg-muted overflow-hidden">
          <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${pct}%` }} />
        </div>
        <span className="text-xs font-semibold text-foreground shrink-0">
          {ms.classesUsed}/{ms.classesTotal}
        </span>
      </div>

      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span>
          Te quedan <strong className="text-primary-fuerte">{left}</strong> clase{left !== 1 ? 's' : ''}
        </span>
        {/* A un período que todavía no arrancó no se le dice cuándo vence:
            el dato que la clienta necesita es desde cuándo lo puede usar. */}
        <span>
          {ms.status === 'futura'
            ? `Arranca el ${pretty(ms.startDate)}`
            : `Vence el ${pretty(ms.endDate)}`}
        </span>
      </div>

      {/* Desde cuándo rige. Lo pidió el estudio el 17/09 con estas
          palabras: "¿Desde cuándo está activa la membresía?". La tarjeta
          decía cuándo vence y nunca cuándo empezó, así que la clienta no
          tenía con qué chequear su propio mes. Para un período que todavía
          no arrancó no se repite: arriba ya dice "Arranca el X". */}
      {/* La cuenta de días al lado de la fecha. El estudio la pidió el
          17/09 pensando en la clienta: "vence el 14 oct" no se lee como
          urgencia y "vence en 3 días" sí, y es la diferencia entre
          renovar a tiempo y perder el turno fijo. */}
      <p className="text-[11px] text-muted-foreground mt-1.5">
        {ms.status === 'futura'
          ? `Arranca ${enDias(ms.startDate)}`
          : `Activa desde el ${pretty(ms.startDate)} · ${cuentaDeDias(ms.endDate)}`}
      </p>
    </div>
  )
}

/**
 * Qué le puede pasar a la clase si la cancela ahora, para poder decírselo
 * ANTES. Tres casos distintos, y el tercero importa tanto como los otros:
 *
 *   'vuelve'      → está en plazo, la clase vuelve al plan
 *   'no-consume'  → la reserva no sale de ningún plan (entró por una
 *                   excepción que el estudio autorizó, `membershipId` en
 *                   nulo), así que no hay nada que perder. Sin esta rama
 *                   el cartel rojo le mentiría: le diría que pierde una
 *                   clase que nunca se le descontó.
 *   'se-pierde'   → fuera de plazo. Acá va el recupero.
 *
 * El recupero se cuenta igual que en la base (0046): reposiciones hechas
 * contra ESA membresía, sin contar las canceladas, contra el tope de
 * `recovery_max`. Es la segunda cuenta duplicada del portal, por el mismo
 * motivo que la del plazo — el cliente tiene que saberlo antes de
 * apretar—, y como la otra, la base es la que decide.
 */
function suerteDeLaClase(
  reserva: Reservation,
  reservas: Reservation[],
  membresias: Membership[],
  horasDePlazo: number,
  tope: number
): {
  caso: 'vuelve' | 'no-consume' | 'se-pierde'
  tope: number
  restantes: number
  hastaCuando: string | null
} {
  const enPlazo = cancelacionEnPlazo(reserva.date, reserva.time, horasDePlazo)
  const hechas = reserva.membershipId
    ? reservas.filter(
        (r) =>
          r.membershipId === reserva.membershipId &&
          r.recoversReservationId != null &&
          r.status !== 'cancelada'
      ).length
    : 0
  return {
    caso: enPlazo ? 'vuelve' : !reserva.membershipId ? 'no-consume' : 'se-pierde',
    tope,
    restantes: Math.max(0, tope - hechas),
    // El recupero tiene que caer dentro del período que pagó la clase, así
    // que el vencimiento es parte del aviso: con el período por cerrarse,
    // "te quedan 2" sin fecha es una promesa que no se puede usar.
    hastaCuando: membresias.find((m) => m.id === reserva.membershipId)?.endDate ?? null,
  }
}

/**
 * El cartel de cancelar.
 *
 * Reemplaza un `window.confirm`, y no por gusto: los carteles nativos los
 * descartan solos los navegadores embebidos —el de Instagram, el panel de
 * vista previa— sin mostrar nada y devolviendo "no". Ahí el botón
 * Cancelar parecía roto: no pasaba absolutamente nada. El portal vive en
 * el teléfono y buena parte de las clientas lo van a abrir desde un link
 * de Instagram, así que la confirmación tiene que ser de la página.
 *
 * Y de paso arregla lo que el `confirm` genérico no decía: si la clase se
 * devuelve o se pierde. El plazo sale de `cancel_hours`, el mismo
 * parámetro con el que la base sella `cancel_kind`, y el aviso se calcula
 * contra la hora real de ESA clase, no contra una regla escrita a mano.
 */
function ConfirmarCancelacion({
  reserva,
  suerte,
  horasDePlazo,
  trabajando,
  onCerrar,
  onConfirmar,
}: {
  reserva: Reservation
  suerte: ReturnType<typeof suerteDeLaClase>
  horasDePlazo: number
  trabajando: boolean
  onCerrar: () => void
  onConfirmar: () => void
}) {
  const plazo = `${horasDePlazo} ${horasDePlazo === 1 ? 'hora' : 'horas'}`
  const { caso, tope, restantes, hastaCuando } = suerte

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-foreground/20 backdrop-blur-sm"
      onClick={onCerrar}
    >
      <div
        className="bg-card rounded-2xl shadow-2xl w-full max-w-sm border border-border"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <h2 className="text-base font-bold text-foreground">¿Cancelar la clase?</h2>
          <button
            type="button"
            onClick={onCerrar}
            className="w-8 h-8 rounded-full hover:bg-muted flex items-center justify-center text-muted-foreground"
            aria-label="Cerrar"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="px-5 py-5 space-y-4">
          <div>
            <p className="text-sm font-semibold text-foreground">{reserva.className}</p>
            <p className="text-xs text-muted-foreground">
              {pretty(reserva.date)} · {reserva.time} · {reserva.teacherName}
            </p>
          </div>

          {/* Lo que le pasa a la clase, que es el dato que faltaba. En
              verde y en rojo porque son cosas distintas, no dos
              redacciones de la misma. */}
          {caso === 'vuelve' && (
            <div className="rounded-xl bg-exito-suave px-3.5 py-3">
              <p className="text-sm font-semibold text-exito-fuerte">
                La clase vuelve a tu plan
              </p>
              <p className="text-xs text-exito-fuerte/90 mt-1">
                Estás cancelando con más de {plazo} de anticipación, así que la podés
                usar en otro horario.
              </p>
            </div>
          )}

          {caso === 'no-consume' && (
            <div className="rounded-xl bg-muted px-3.5 py-3">
              <p className="text-sm font-semibold text-foreground">
                No perdés ninguna clase
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                Esta reserva no sale de tu plan, así que cancelarla no te descuenta
                nada. Avisale al estudio igual, para que puedan darle el lugar a otra
                persona.
              </p>
            </div>
          )}

          {caso === 'se-pierde' && (
            <div className="rounded-xl bg-destructive/10 px-3.5 py-3">
              <p className="text-sm font-semibold text-destructive-fuerte">
                Esta clase no se te devuelve
              </p>
              <p className="text-xs text-destructive-fuerte/90 mt-1">
                El plazo para recuperarla era hasta {plazo} antes de que empiece.
              </p>

              {/* La salida. Antes el cartel rojo terminaba acá y era un
                  callejón: le decía que la perdía y no que el estudio
                  puede reponérsela. El tope y las usadas son las de la
                  base, no un número escrito a mano. */}
              {tope <= 0 ? (
                <p className="text-xs text-destructive-fuerte/90 mt-2">
                  Si no podés venir, avisale al estudio igual.
                </p>
              ) : restantes > 0 ? (
                <p className="text-xs text-destructive-fuerte/90 mt-2">
                  <strong className="font-semibold">Pero se puede recuperar:</strong> el
                  estudio repone hasta {tope} {tope === 1 ? 'clase' : 'clases'} por
                  período y te {restantes === 1 ? 'queda' : 'quedan'} {restantes}.
                  Pedila en recepción
                  {hastaCuando ? ` antes del ${pretty(hastaCuando)}` : ''}.
                </p>
              ) : (
                <p className="text-xs text-destructive-fuerte/90 mt-2">
                  Ya usaste {tope === 1 ? 'la recuperación' : `las ${tope} recuperaciones`}{' '}
                  de este período, así que esta no se puede reponer. Avisale al estudio
                  igual.
                </p>
              )}
            </div>
          )}

          <div className="flex gap-2">
            <button
              type="button"
              onClick={onCerrar}
              disabled={trabajando}
              className="flex-1 py-2.5 rounded-xl border border-border text-sm font-semibold text-foreground hover:bg-muted transition-colors disabled:opacity-60"
            >
              Mejor no
            </button>
            <button
              type="button"
              onClick={onConfirmar}
              disabled={trabajando}
              className="flex-1 py-2.5 rounded-xl bg-destructive text-white text-sm font-semibold hover:opacity-90 transition-opacity disabled:opacity-60 flex items-center justify-center gap-2"
            >
              {trabajando && <Loader2 className="w-4 h-4 animate-spin" />}
              {trabajando ? 'Cancelando...' : 'Sí, cancelar'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

/**
 * Las clases de este plan, una por una.
 *
 * Lo pidió el estudio el 17/09 y es el "no" que faltaba del portal: la
 * clienta veía "te quedan 2" y no cuáles fueron las otras 6, así que no
 * tenía con qué auditar su propio plan. Cada "¿por qué me quedan 2?"
 * terminaba en el mostrador.
 *
 * El número de arriba es el de la BASE (`classesUsed`), no la suma de
 * esta lista: la autoridad es el contador y esto lo explica. Si por algo
 * no coinciden —un ajuste manual en `classes_used_base`— se dice en vez
 * de disimularlo, porque una lista que no cierra con el número de arriba
 * es peor que no tener lista.
 *
 * Arranca plegada a propósito: es información para cuando surge la duda,
 * y desplegada empujaría la grilla de reservar, que es para lo que la
 * clienta entra.
 */
function ClasesDelPlan({
  ms,
  reservas,
  suspendidas,
  ausenciaConsume,
  hoy,
}: {
  ms: Membership
  reservas: Reservation[]
  suspendidas: Map<string, string>
  ausenciaConsume: boolean
  hoy: string
}) {
  const [abierto, setAbierto] = useState(false)

  const filas = useMemo(
    () =>
      reservas
        .filter((r) => r.membershipId === ms.id)
        .sort((a, b) => (b.date + b.time).localeCompare(a.date + a.time))
        .map((r) => ({
          r,
          suerte: suerteDeLaReserva(r, {
            suspendida: suspendidas.has(`${r.classId}|${r.date}`),
            ausenciaConsume,
            hoy,
          }),
        })),
    [reservas, ms.id, suspendidas, ausenciaConsume, hoy]
  )

  const contadas = filas.filter((f) => f.suerte.conto).length
  const ajuste = ms.classesUsed - contadas
  const quedan = Math.max(0, ms.classesTotal - ms.classesUsed)

  return (
    <div className="bg-card rounded-2xl border border-border overflow-hidden">
      <button
        onClick={() => setAbierto((v) => !v)}
        className="w-full px-4 py-3 flex items-center gap-3 text-left hover:bg-muted/50 transition-colors"
      >
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-foreground">Tus clases de este plan</p>
          <p className="text-xs text-muted-foreground">
            Usaste {ms.classesUsed} de {ms.classesTotal} · te {quedan === 1 ? 'queda' : 'quedan'}{' '}
            {quedan}
          </p>
        </div>
        <span className="text-[11px] font-semibold text-primary-fuerte shrink-0">
          {abierto ? 'Ocultar' : 'Ver el detalle'}
        </span>
      </button>

      {abierto && (
        <div className="px-4 pb-4 pt-1 border-t border-border">
          {filas.length === 0 ? (
            <p className="text-xs text-muted-foreground py-3">
              Todavía no reservaste ninguna clase de este plan.
            </p>
          ) : (
            <div className="divide-y divide-border">
              {filas.map(({ r, suerte }) => (
                <div key={r.id} className="py-2.5 flex items-start gap-3">
                  {/* El punto dice de un vistazo si contó o no. */}
                  <span
                    className={cn(
                      'w-1.5 h-1.5 rounded-full shrink-0 mt-1.5',
                      suerte.conto ? 'bg-primary' : 'bg-border'
                    )}
                  />
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium text-foreground">
                      {pretty(r.date)} · {r.time}
                    </p>
                    <p className="text-[11px] text-muted-foreground truncate">{r.className}</p>
                    {suerte.detalle && (
                      <p className="text-[11px] text-muted-foreground mt-0.5">{suerte.detalle}</p>
                    )}
                  </div>
                  <span
                    className={cn(
                      'text-[10px] font-semibold px-2 py-0.5 rounded-full shrink-0',
                      suerte.conto ? 'bg-muted text-foreground' : 'bg-muted text-muted-foreground'
                    )}
                  >
                    {suerte.etiqueta}
                  </span>
                </div>
              ))}
            </div>
          )}

          <p className="text-[11px] text-muted-foreground mt-3">
            Los puntos llenos son las clases que te contaron: {contadas} de esta lista.
            {ajuste !== 0 &&
              ` Y ${ajuste > 0 ? `${ajuste} más` : `${-ajuste} menos`} que el estudio ajustó a mano.`}{' '}
            La clase se descuenta al reservar, no al venir.
          </p>
        </div>
      )}
    </div>
  )
}

function UpcomingList({
  reservations,
  suspendidas,
  onCancel,
  busyId,
  alReservar,
}: {
  reservations: Reservation[]
  /** clase|fecha de los días que el estudio suspendió, con su motivo */
  suspendidas: Map<string, string>
  onCancel: (r: Reservation) => void
  busyId: string | null
  /**
   * Lleva a la pestaña de Reservar. Antes el vacío decía "¡Elegí una acá
   * abajo!" y era verdad: la grilla estaba abajo, en la misma página. Con
   * las pestañas dejó de estarlo, así que el texto mandaba a mirar un
   * lugar que ya no existe — y quien no tiene nada reservado es justo
   * quien necesita el camino.
   */
  alReservar?: () => void
}) {
  const { disciplines } = useStudio()
  if (reservations.length === 0) {
    return (
      <div className="text-center py-6">
        <p className="text-xs text-muted-foreground">Todavía no reservaste ninguna clase.</p>
        {alReservar && (
          <button
            onClick={alReservar}
            className="mt-3 px-5 py-2 rounded-xl bg-primary text-primary-foreground text-xs font-semibold hover:opacity-90 transition-opacity"
          >
            Ver los horarios
          </button>
        )}
      </div>
    )
  }
  return (
    <div className="space-y-2">
      {reservations.map((r) => {
        // Suspender una fecha no cancela las reservas —esa decisión la toma
        // el estudio—, así que la reserva seguía acá como si nada y el
        // cliente viajaba a una clase que no se dictaba.
        const motivo = suspendidas.get(`${r.classId}|${r.date}`)
        return (
        <div key={r.id} className="bg-card rounded-2xl border border-border px-4 py-3 flex items-center gap-3">
          <div
            className="w-1 self-stretch rounded-full shrink-0"
            style={{ backgroundColor: motivo !== undefined ? 'var(--secondary)' : disciplineStyle(disciplines, r.discipline).dot }}
          />
          <div className="flex-1 min-w-0">
            <p className={cn('text-sm font-semibold truncate', motivo !== undefined ? 'text-muted-foreground line-through' : 'text-foreground')}>
              {r.className}
            </p>
            <p className="text-xs text-muted-foreground">
              {pretty(r.date)} · {r.time} · {r.teacherName}
            </p>
            {motivo !== undefined && (
              <p className="text-xs text-destructive-fuerte font-medium mt-0.5">
                El estudio suspendió esta clase{motivo ? `: ${motivo}` : ''}
              </p>
            )}
          </div>
          {motivo !== undefined ? (
            <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-destructive/10 text-destructive-fuerte shrink-0">
              Suspendida
            </span>
          ) : r.status === 'lista de espera' ? (
            <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-aviso-suave text-aviso-fuerte shrink-0">
              En espera
            </span>
          ) : null}
          {/* Si el estudio la suspendió no hay nada que cancelar, y con el
              consumo encendido esa clase no se le descuenta. */}
          {motivo === undefined && (
            <button
              disabled={busyId === r.id}
              onClick={() => onCancel(r)}
              className="shrink-0 px-2.5 py-1.5 rounded-lg text-[11px] font-semibold text-muted-foreground hover:bg-destructive/10 hover:text-destructive-fuerte transition-colors disabled:opacity-50"
            >
              {busyId === r.id ? '...' : 'Cancelar'}
            </button>
          )}
        </div>
        )
      })}
    </div>
  )
}

/**
 * Por qué no puede reservar, en un solo lugar.
 *
 * Este texto vivía adentro de la sección Reservar, que con la página
 * scrolleada alcanzaba: la clienta veía la tarjeta del plan y, más abajo,
 * el motivo. Con las pestañas, Inicio es lo primero que abre y mostraba
 * la tarjeta con un rótulo —"Empieza después", "Vencida"— y ninguna
 * explicación de qué hacer.
 *
 * Así que se dice en los dos lugares y sale de una sola función, para que
 * no se desincronicen el día que cambie una de las dos.
 *
 * El orden de las ramas importa: 'futura' va antes que las clases porque
 * a quien pagó adelantado no se le puede decir que está vencida ni que
 * gastó un plan que todavía no empezó.
 */
function motivoSinReservar(
  ms: Membership | undefined,
  clasesQueQuedan: number
): string | null {
  if (!ms) return 'Necesitás una membresía activa para reservar.'
  if (ms.status === 'futura')
    return `Tu plan arranca el ${pretty(ms.startDate)}: desde ese día podés reservar. Para una clase de antes, consultá en recepción.`
  // Antes que las clases: una cancelada puede tener clases sin usar, y
  // decirle "usaste todas" sería mentirle dos veces.
  if (ms.status === 'cancelada')
    return 'Tu plan se dio de baja. Consultá en recepción para volver a activarlo.'
  if (clasesQueQuedan === 0)
    return 'Usaste todas las clases de tu plan. Consultá en recepción para renovar.'
  return 'Tu membresía está vencida o suspendida. Consultá en recepción.'
}

/**
 * La pestaña de Perfil.
 *
 * Reúne lo que estaba repartido: los datos de la clienta (que hasta ahora
 * no veía en ningún lado), su credencial, y las tres acciones que vivían
 * como iconos sueltos en el header — donde nadie las encontraba— más las
 * dos que no existían: activar los avisos en este teléfono e instalar la
 * app.
 *
 * Los datos son SOLO DE LECTURA, decisión del estudio (18/09): los carga
 * el mostrador y hay una sola fuente de verdad. Por eso el pie dice a
 * dónde ir si algo está mal, en vez de ofrecer un lápiz que no existe.
 */
function TabPerfil({
  me,
  credencial: cred,
  onCambiarClave,
  onSalir,
}: {
  me: Student
  credencial: string
  onCambiarClave: () => void
  onSalir: () => void
}) {
  const [abierta, setAbierta] = useState(false)

  const datos: { etiqueta: string; valor: string }[] = [
    { etiqueta: 'Nombre', valor: me.name },
    { etiqueta: 'Email', valor: me.email || '—' },
    { etiqueta: 'Teléfono', valor: me.phone || '—' },
    { etiqueta: 'Documento', valor: me.dni || '—' },
    {
      etiqueta: 'Fecha de nacimiento',
      valor: me.birthdate ? new Date(`${me.birthdate}T00:00`).toLocaleDateString('es-AR') : '—',
    },
    {
      etiqueta: 'Cliente desde',
      valor: new Date(`${me.joinDate}T00:00`).toLocaleDateString('es-AR'),
    },
  ]

  return (
    <div className="space-y-4">
      {/* Quién es */}
      <div className="bg-card rounded-2xl border border-border p-5 flex items-center gap-4">
        <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
          <span className="text-primary-fuerte font-bold text-lg">{me.avatar}</span>
        </div>
        <div className="min-w-0">
          <p className="text-base font-bold text-foreground truncate">{me.name}</p>
          {cred && (
            <p className="text-xs text-muted-foreground mt-0.5">
              Credencial <span className="font-bold tabular-nums text-foreground/70">{cred}</span>
            </p>
          )}
        </div>
      </div>

      {/* Sus datos */}
      <div className="bg-card rounded-2xl border border-border overflow-hidden">
        <button
          onClick={() => setAbierta((v) => !v)}
          aria-expanded={abierta}
          className="w-full px-4 py-3.5 flex items-center gap-3 text-left hover:bg-muted/50 transition-colors"
        >
          <User className="w-4 h-4 text-primary-fuerte shrink-0" />
          <span className="flex-1 text-sm font-semibold text-foreground">Información personal</span>
          <ChevronDown
            className={cn(
              'w-4 h-4 text-muted-foreground transition-transform shrink-0',
              abierta && 'rotate-180'
            )}
          />
        </button>
        {abierta && (
          <div className="px-4 pb-4 pt-1 border-t border-border divide-y divide-border">
            {datos.map(({ etiqueta, valor }) => (
              <div key={etiqueta} className="py-2.5 flex items-baseline justify-between gap-3">
                <span className="text-[11px] text-muted-foreground uppercase tracking-wide shrink-0">
                  {etiqueta}
                </span>
                <span className="text-sm text-foreground text-right min-w-0 break-words">{valor}</span>
              </div>
            ))}
            <p className="text-[11px] text-muted-foreground pt-2.5">
              Si algo de esto está mal, avisanos en el estudio y lo corregimos.
            </p>
          </div>
        )}
      </div>

      {/* Su teléfono */}
      <div className="bg-card rounded-2xl border border-border overflow-hidden divide-y divide-border">
        <AvisosEnEsteCelu variante="fila" />
        <InstalarEnElCelu />
      </div>

      {/* Su cuenta */}
      <div className="bg-card rounded-2xl border border-border overflow-hidden divide-y divide-border">
        <button
          onClick={onCambiarClave}
          className="w-full flex items-center gap-3 px-4 py-3.5 text-left hover:bg-muted/50 transition-colors"
        >
          <KeyRound className="w-4 h-4 text-primary-fuerte shrink-0" />
          <span className="text-sm font-medium text-foreground">Cambiar mi contraseña</span>
        </button>
        <button
          onClick={onSalir}
          className="w-full flex items-center gap-3 px-4 py-3.5 text-left hover:bg-destructive/10 text-destructive-fuerte transition-colors"
        >
          <LogOut className="w-4 h-4 shrink-0" />
          <span className="text-sm font-medium">Cerrar sesión</span>
        </button>
      </div>
    </div>
  )
}

/**
 * Las cuatro pestañas del portal.
 *
 * El portal era una sola página que se scrolleaba: el plan arriba, las
 * clases en el medio y la grilla de reservar al final. Funcionaba, pero
 * no se sentía una app, y lo que estaba al final lo encontraba sólo quien
 * scrolleaba hasta ahí. El estudio pidió que se navegue con una barra
 * abajo (18/09).
 */
type Pestana = 'inicio' | 'reservar' | 'clases' | 'pagos' | 'perfil'

/**
 * Cinco, y en este orden a propósito: `inicio` queda en el medio, que es
 * donde va el botón redondo elevado. Con cuatro pestañas no hay centro y
 * el diseño no cierra.
 */
const PESTANAS: { key: Pestana; label: string; Icon: React.ComponentType<{ className?: string }> }[] = [
  { key: 'reservar', label: 'Reservar', Icon: CalendarPlus },
  { key: 'clases', label: 'Mis clases', Icon: ClipboardList },
  { key: 'inicio', label: 'Inicio', Icon: Home },
  { key: 'pagos', label: 'Pagos', Icon: CreditCard },
  { key: 'perfil', label: 'Perfil', Icon: User },
]

/**
 * La barra fija de abajo.
 *
 * `role="tablist"` y `aria-selected` no son adorno: sin eso, un lector de
 * pantalla lee cuatro botones sueltos y no sabe cuál está activo.
 *
 * El `padding` con `env(safe-area-inset-bottom)` es para el iPhone. Vale
 * cero mientras el viewport no tenga `viewport-fit: cover` —que no lo
 * tiene, a propósito: ponerlo afecta TODA la app, incluido el panel del
 * mostrador, y hay que verificar pantalla por pantalla antes—. Queda
 * escrito para que el día que se haga, la barra ya esté lista.
 */
function BarraPestanas({
  activa,
  onCambiar,
  pendientes,
}: {
  activa: Pestana
  onCambiar: (p: Pestana) => void
  /** Cuántas clases tiene reservadas, para el globito de "Mis clases". */
  pendientes: number
}) {
  return (
    <nav
      role="tablist"
      aria-label="Secciones"
      className="fixed bottom-0 inset-x-0 z-40 bg-card/95 backdrop-blur-md border-t border-border overflow-visible"
      style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
    >
      <div className="max-w-lg mx-auto flex items-end">
        {PESTANAS.map(({ key, label, Icon }) => {
          const esta = activa === key
          const centro = key === 'inicio'

          // El botón redondo del medio: el de Inicio se dibuja elevado,
          // como en las apps que la clienta ya usa.
          if (centro) {
            return (
              <button
                key={key}
                role="tab"
                aria-selected={esta}
                aria-current={esta ? 'page' : undefined}
                onClick={() => onCambiar(key)}
                className="flex-1 flex flex-col items-center -mt-5"
              >
                <span
                  className={cn(
                    'w-14 h-14 rounded-full flex items-center justify-center border-4 border-background transition-colors',
                    esta
                      ? 'bg-primary text-primary-foreground'
                      : 'bg-card text-muted-foreground border-background ring-1 ring-border'
                  )}
                >
                  <Icon className="w-6 h-6" />
                </span>
                <span
                  className={cn(
                    'text-[10px] pb-2 pt-0.5',
                    esta ? 'font-semibold text-primary-fuerte' : 'text-muted-foreground'
                  )}
                >
                  {label}
                </span>
              </button>
            )
          }

          return (
            <button
              key={key}
              role="tab"
              aria-selected={esta}
              aria-current={esta ? 'page' : undefined}
              onClick={() => onCambiar(key)}
              className={cn(
                'flex-1 flex flex-col items-center gap-0.5 py-2.5 transition-colors relative',
                esta ? 'text-primary-fuerte' : 'text-muted-foreground hover:text-foreground'
              )}
            >
              <span className="relative">
                <Icon className="w-5 h-5" />
                {key === 'clases' && pendientes > 0 && (
                  <span className="absolute -top-1 -right-2 min-w-4 h-4 px-1 rounded-full bg-primary text-primary-foreground text-[10px] font-bold flex items-center justify-center">
                    {pendientes}
                  </span>
                )}
              </span>
              <span className={cn('text-[10px] leading-tight text-center', esta && 'font-semibold')}>
                {label}
              </span>
              {/* La línea de arriba marca la activa incluso para quien no
                  distingue el color. */}
              {esta && <span className="absolute top-0 inset-x-3 h-0.5 rounded-full bg-primary-fuerte" />}
            </button>
          )
        })}
      </div>
    </nav>
  )
}

export function PortalPage() {
  const { profile, refresh, signOut } = useData()
  const { students, classes, reservations, payments, disciplines, occurrences, settings, memberships } =
    useStudio()

  // Con RLS, el cliente solo recibe su propia ficha
  const me = students.find((s) => s.userId === profile?.id) ?? students[0] ?? null

  /**
   * Con qué pestaña abre: `?t=reservar` entra directo.
   *
   * Se lee SOLO al montar y después manda el estado local, que es la misma
   * convención que ya usa el sistema de gestión con `?p=` (ver
   * `app/sistema/page.tsx`). No se empuja historial por cada cambio de
   * pestaña a propósito: haría que el botón "atrás" de Android camine por
   * las pestañas visitadas, que confunde más de lo que ayuda. El costo es
   * que "atrás" desde una pestaña cierra la app instalada — igual que
   * hoy, y que en la mayoría de las apps nativas.
   */
  const [pestana, setPestana] = useState<Pestana>(() => {
    if (typeof window === 'undefined') return 'inicio'
    const t = new URLSearchParams(window.location.search).get('t')
    return PESTANAS.some((p) => p.key === t) ? (t as Pestana) : 'inicio'
  })
  const [weekOffset, setWeekOffset] = useState(0)
  const [day, setDay] = useState(Math.min((new Date().getDay() + 6) % 7, 5))
  const [occupancy, setOccupancy] = useState<Map<string, Occupancy>>(new Map())
  const [busyId, setBusyId] = useState<string | null>(null)
  const [notice, setNotice] = useState<{ type: 'ok' | 'error'; text: string } | null>(null)
  const [showChangePassword, setShowChangePassword] = useState(false)
  const [aCancelar, setACancelar] = useState<Reservation | null>(null)

  const weekStart = addDays(mondayOf(), weekOffset * 7)

  // El ahora del estudio, y se refresca solo. Leerlo una vez por render
  // alcanzaba mientras la comparación era por fecha; ahora que también es
  // por hora, no: el portal queda abierto en el teléfono, y si el reloj
  // se congela en el primer render, la clase de las 8:00 sigue con su
  // botón de reservar a las 8:30 para quien entró a las 7:50.
  const [ahora, setAhora] = useState(ahoraDelEstudio)
  useEffect(() => {
    const t = setInterval(() => setAhora(ahoraDelEstudio()), 30_000)
    return () => clearInterval(t)
  }, [])
  const today = ahora.fecha

  // Cuánto antes del inicio se cierra la reserva. Cero —el default de la
  // 0038— cierra justo al empezar; el estudio puede pedir margen sin que
  // haya que tocar código. Si la migración todavía no corrió, la clave no
  // existe y el fallback deja el mismo cero.
  const minutosDeCorte = settingNum(settings, 'booking_cutoff_minutes', 0)

  useEffect(() => {
    fetchWeekOccupancy(weekStart).then(setOccupancy)
  }, [weekStart, reservations])

  const ms = me?.membership
  const miCredencial = credencial(me?.memberNo, settings)
  const classesLeft = ms ? ms.classesTotal - ms.classesUsed : 0

  // Las fechas que el estudio suspendió, con su motivo, para las clases
  // que le importan a este cliente.
  const suspendidas = useMemo(
    () =>
      new Map(
        occurrences
          .filter((o) => o.status === 'suspendida')
          .map((o) => [`${o.classId}|${o.date}`, o.reason ?? ''])
      ),
    [occurrences]
  )

  const myUpcoming = useMemo(
    () =>
      reservations
        .filter(
          (r) =>
            r.studentId === me?.id &&
            r.date >= today &&
            (r.status === 'confirmada' || r.status === 'lista de espera')
        )
        .sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time)),
    [reservations, me, today]
  )

  // Todas las suyas, de cualquier estado: el historial necesita las
  // pasadas y las canceladas, que `myUpcoming` deja afuera.
  const misReservas = useMemo(
    () => reservations.filter((r) => r.studentId === me?.id),
    [reservations, me]
  )

  const misPagos = useMemo(
    () => payments.filter((p) => p.studentId === me?.id),
    [payments, me]
  )
  // La deuda se calcula sobre TODOS sus pagos y el corte es solo para
  // mostrar. Al revés —cortar en ocho y después filtrar— el cliente con
  // nueve pagos dejaba de ver que debía, y cuanto más antigua la deuda,
  // antes desaparecía: justo la que hay que cobrar.
  const myDebts = misPagos.filter(
    (p) => (p.status === 'pendiente' || p.status === 'vencido') && !esOferta(p)
  )
  // Una oferta cuya renovación ya se resolvió por otro camino —el mostrador
  // le asignó el período, o le cambió el plan— no se le ofrece: pagarla no
  // crea nada, porque `renovar_por_pago` (0041) corta con este mismo
  // predicado (`nueva.start_date > vieja.end_date`) y solo le deja una nota
  // al pago. La oferta vive hasta que el proceso diario la anula, y en esa
  // ventana el botón de pagar online le cobraría un mes que ya tiene, que
  // además viene con su propia cuota. Sin membresías a la vista —o sin la
  // 0041— nunca da true y el bloque se comporta como si esto no estuviera.
  const misMembresias = useMemo(
    () => memberships.filter((m) => m.studentId === me?.id),
    [memberships, me]
  )

  /**
   * Qué período le paga una clase de ese día. Es el mismo criterio que
   * `membresia_para` en la base: el que cubre la FECHA DE LA CLASE, no el
   * que corre hoy.
   *
   * Existe desde el 22/09 por un pedido con fecha: el estudio abre el 29
   * y quiere cargar esta semana a las clientas que arrancan ese día, con
   * su plan corriendo desde el 29 — y que ya puedan reservar sus clases
   * de esa semana. Antes el portal tenía UN permiso global (`canBook`)
   * basado en el estado de hoy, así que un plan que arranca el 29 no la
   * dejaba reservar nada, ni siquiera una clase del 30. La base sí la
   * habría dejado: la pantalla era más estricta que la regla.
   */
  const membresiaParaFecha = (fecha: string) =>
    misMembresias
      .filter(
        (m) =>
          m.status !== 'cancelada' &&
          m.status !== 'suspendida' &&
          m.startDate <= fecha &&
          m.endDate >= fecha
      )
      // Ordenar y no `.find()`: la lista viene por end_date DESCENDENTE, así
      // que el primero que coincidía era el que vence MÁS TARDE — un tercer
      // criterio, distinto del de la ficha y del de la base. Con el pase de
      // prueba agotado y el plan recién comprado cubriendo los mismos días,
      // eso le habilitaba o le negaba el botón según cuál cayera primero.
      // `ordenDeCobro` es el de `membresia_para`: primero la que tiene
      // clases, y entre esas la que primero se pierde.
      .sort(ordenDeCobro)[0]

  /**
   * El día en que le arranca el próximo período, si todavía no empezó.
   * Es lo que la grilla le dice en las clases anteriores a esa fecha.
   */
  const proximoInicio = misMembresias
    .filter((m) => m.status !== 'cancelada' && m.startDate > today)
    .map((m) => m.startDate)
    .sort()[0]

  /** Si puede reservar una clase de ese día: período que la cubra y clases. */
  const puedeReservarEl = (fecha: string) => {
    const m = membresiaParaFecha(fecha)
    return !!m && m.classesTotal - m.classesUsed > 0
  }

  /**
   * Si tiene con qué reservar ALGO, hoy o más adelante. Gobierna el cartel
   * que explica por qué no puede, no el botón de cada clase — ese es
   * `puedeReservarEl`, que mira la fecha.
   */
  const canBook =
    misMembresias.some(
      (m) =>
        m.status !== 'cancelada' &&
        m.status !== 'suspendida' &&
        m.endDate >= today &&
        m.classesTotal - m.classesUsed > 0
    ) || (!!ms && (ms.status === 'activa' || ms.status === 'por vencer') && classesLeft > 0)
  const yaResuelta = (renuevaId?: string | null) => {
    const vieja = misMembresias.find((m) => m.id === renuevaId)
    return !!vieja && misMembresias.some((m) => m.startDate > vieja.endDate)
  }
  // La renovación que el estudio le ofreció (0041) sale del bloque de
  // deudas y tiene el suyo: no es plata que deba, es el mes que viene, que
  // todavía no compró. Y como la cuota se emite antes de que venza la
  // membresía, dejarla ahí le reclamaba un pago pendiente a toda clienta
  // que está al día.
  const misRenovaciones = misPagos.filter((p) => esOferta(p) && !yaResuelta(p.renuevaMembresiaId))
  /** Alguna oferta todavía dentro de su plazo: es la que se puede tomar. */
  const renovacionATiempo = misRenovaciones.some((p) => p.dueDate >= today)
  const myPayments = misPagos.slice(0, 8)

  const dayClasses = useMemo(() => {
    const date = addDays(weekStart, day)
    return classes
      .filter((c) => c.dayOfWeek === day)
      // Un taller solo aparece el día que se dicta (migración 0017)
      .filter((c) => c.kind !== 'especial' || c.date === date)
      .map((c) => {
        const occ = occupancy.get(`${c.id}|${date}`) ?? { confirmed: 0, waitlist: 0 }
        const mine = reservations.find(
          (r) => r.studentId === me?.id && r.classId === c.id && r.date === date && r.status !== 'cancelada'
        )
        // Excepción de ese día: suspensión, reemplazo o cambio de horario
        // (migración 0018).
        const exc = occurrences.find((o) => o.classId === c.id && o.date === date)
        return {
          ...c,
          date,
          occ,
          mine,
          time: exc?.startTime ?? c.time,
          capacity: exc?.capacity ?? c.capacity,
          teacherName: exc?.teacherId ? exc.teacherName : c.teacherName,
          suspended: exc?.status === 'suspendida',
          suspendedReason: exc?.reason ?? '',
        }
      })
      .sort((a, b) => a.time.localeCompare(b.time))
  }, [classes, occupancy, occurrences, reservations, me, weekStart, day])

  const flash = (type: 'ok' | 'error', text: string) => {
    setNotice({ type, text })
    setTimeout(() => setNotice(null), 3500)
  }

  const book = async (classId: string, date: string, waitlist: boolean) => {
    if (!me) return
    setBusyId(classId)
    try {
      await createReservation(me.id, classId, date, waitlist ? 'lista de espera' : 'confirmada')
      await refresh()
      flash('ok', waitlist ? 'Quedaste en lista de espera' : '¡Reserva confirmada!')
    } catch (err) {
      flash('error', err instanceof Error ? err.message : 'No se pudo reservar')
    } finally {
      setBusyId(null)
    }
  }

  const horasDeCancelacion = settingNum(settings, 'cancel_hours', 3)
  // El mismo default que la base (0046): sin la clave, dos por período.
  const topeDeRecuperos = settingNum(settings, 'recovery_max', 2)

  // `reservations` ya son sólo las suyas: RLS no le manda las de nadie más.
  const suerteDe = (r: Reservation) =>
    suerteDeLaClase(r, reservations, misMembresias, horasDeCancelacion, topeDeRecuperos)

  // Antes esto arrancaba con un `window.confirm`. Los navegadores
  // embebidos lo descartan solos —devuelven "no" sin mostrar nada—, así
  // que el botón no hacía nada y no había forma de saber por qué.
  const cancel = (r: Reservation) => setACancelar(r)

  const confirmarCancelacion = async () => {
    const r = aCancelar
    if (!r) return
    setBusyId(r.id)
    try {
      await updateReservationStatus(r.id, 'cancelada')
      await refresh()
      setACancelar(null)
      // El aviso repite lo que el cartel ya dijo, porque entre apretar y
      // que vuelva el paquete del estudio pasan segundos y la lista de
      // arriba tarda en reflejarlo. Y la reserva desaparece de "próximas
      // clases" al cancelarse, así que si el recupero no se nombra acá,
      // no queda escrito en ninguna parte.
      const suerte = suerteDe(r)
      flash(
        'ok',
        suerte.caso === 'vuelve'
          ? 'Reserva cancelada. La clase volvió a tu plan.'
          : suerte.caso === 'se-pierde' && suerte.tope > 0 && suerte.restantes > 0
          ? 'Reserva cancelada. Pedile la recuperación al estudio.'
          : 'Reserva cancelada.'
      )
    } catch (err) {
      setACancelar(null)
      flash('error', err instanceof Error ? err.message : 'No se pudo cancelar')
    } finally {
      setBusyId(null)
    }
  }

  if (!me) {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center p-6 text-center gap-3">
        <XCircle className="w-10 h-10 text-muted-foreground opacity-40" />
        <p className="text-sm font-semibold text-foreground">Tu cuenta no está vinculada a una ficha de cliente</p>
        <p className="text-xs text-muted-foreground max-w-xs">
          Pedile a recepción que te genere el acceso desde tu ficha. Si ya lo hicieron, probá salir y volver a entrar.
        </p>
        <button
          onClick={() => signOut()}
          className="mt-2 px-5 py-2.5 rounded-xl border border-border text-sm font-semibold text-muted-foreground hover:bg-muted"
        >
          Cerrar sesión
        </button>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="sticky top-0 z-40 bg-background/90 backdrop-blur-md border-b border-border">
        <div className="max-w-lg mx-auto px-4 py-3 flex items-center gap-3">
          <Sello
            nombre={settingText(settings, 'studio_name', 'Casa Fe')}
            className="w-9 h-9 rounded-xl text-xs shrink-0"
          />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-bold text-foreground truncate">¡Hola, {me.name.split(' ')[0]}!</p>
            {/* La credencial va en el header y no en una pantalla aparte
                porque su razon de ser es identificarse: tiene que estar
                donde ella ya mira, no a dos toques. Si la 0067 no corrio,
                queda solo el nombre del estudio. */}
            <p className="text-[10px] text-muted-foreground truncate">
              {settingText(settings, 'studio_name', 'Casa Fe')}
              {miCredencial && (
                <>
                  {' \u00b7 '}
                  <span className="font-bold tabular-nums text-foreground/70">{miCredencial}</span>
                </>
              )}
            </p>
          </div>
          {/* La campana, con el mismo componente que usa el mostrador. No
              lleva `onNavigate` a propósito: sus destinos son pantallas del
              sistema que el portal no tiene, y acá el aviso se lee y se
              cierra. Lo que sí trae es el interruptor de notificaciones en el
              celular, que vive adentro de la campana — y es la razón por la
              que se monta esto y no una lista aparte.

              Qué avisos ve: los que la política de la 0007 le deja leer, o
              sea los suyos con `audience = 'alumno'`. El aislamiento no
              depende de este componente ni de un filtro en la consulta: lo
              decide la base. */}
          {/* El interruptor de avisos no va acá: vive en el Perfil, que es
              donde una persona lo busca. Dos lugares para el mismo switch
              sería peor que uno. */}
          <NotificationsBell sinInterruptor />
        </div>
      </header>

      {aCancelar && (
        <ConfirmarCancelacion
          reserva={aCancelar}
          suerte={suerteDe(aCancelar)}
          horasDePlazo={horasDeCancelacion}
          trabajando={busyId === aCancelar.id}
          onCerrar={() => setACancelar(null)}
          onConfirmar={confirmarCancelacion}
        />
      )}

      {showChangePassword && (
        <ChangePasswordModal
          onClose={() => setShowChangePassword(false)}
          onDone={() => {
            setShowChangePassword(false)
            flash('ok', 'Contraseña actualizada')
          }}
        />
      )}

      {/* El `pb-28` deja pasar la barra fija: sin eso, el último bloque de
          cada pestaña queda abajo de ella y no se puede tocar. */}
      <main className="max-w-lg mx-auto px-4 py-5 space-y-6 pb-28">
        {notice && (
          <div
            className={cn(
              'fixed top-16 left-1/2 -translate-x-1/2 z-50 px-4 py-2.5 rounded-xl text-sm font-semibold shadow-lg',
              notice.type === 'ok' ? 'bg-exito-fuerte text-white' : 'bg-destructive text-white'
            )}
          >
            {notice.text}
          </div>
        )}

        {pestana === 'inicio' && <MembershipCard student={me} />}

        {/* El motivo, pegado a la tarjeta. Inicio es lo primero que abre y
            sin esto la clienta ve un rótulo —"Vencida", "Empieza
            después"— y nada que le diga qué hacer. */}
        {pestana === 'inicio' && !canBook && (
          <div className="bg-muted rounded-2xl px-4 py-3 -mt-2">
            <p className="text-xs text-muted-foreground">{motivoSinReservar(ms, classesLeft)}</p>
          </div>
        )}

        {/* La renovación, como una invitación y no como un reclamo. Va
            pegada a la tarjeta del plan porque es su continuación: arriba
            dice cuándo vence, acá cómo sigue. */}
        {pestana === 'inicio' && misRenovaciones.length > 0 && (
          <div className="bg-info-suave border border-info/40 rounded-2xl p-4">
            <p className="text-xs font-bold text-info-fuerte mb-2 flex items-center gap-1.5">
              <RefreshCw className="w-3.5 h-3.5" />
              {/* Con el plazo cumplido ya no se le puede decir "ya podés":
                  la oferta está por anularse y de acá en adelante lo
                  resuelve el mostrador. */}
              {!renovacionATiempo
                ? 'El plazo para renovar venció'
                : misRenovaciones.length === 1
                ? 'Ya podés renovar tu plan'
                : 'Ya podés renovar tus planes'}
            </p>
            {misRenovaciones.map((p) => {
              // Pasado el plazo no se le ofrece pagar sola: el estudio
              // decide con qué horarios sigue, así que la manda a
              // recepción. El sistema la anula sola ese mismo día.
              const aTiempo = p.dueDate >= today
              return (
                <div key={p.id} className="flex items-center justify-between gap-2 py-1.5">
                  <div className="min-w-0">
                    <p className="text-xs font-semibold text-info-fuerte truncate">{p.planName}</p>
                    {/* "No perder la prioridad" y no "conservar tus días y
                        horarios": el turno fijo no existe en el sistema
                        —una reserva es una fila por clase y fecha, no un
                        derecho recurrente— así que el lugar no se le puede
                        prometer. La prioridad sí es del estudio, y es la
                        palabra que usó. */}
                    <p className="text-[10px] text-info-fuerte">
                      {aTiempo
                        ? `Tenés hasta el ${pretty(p.dueDate)} para renovar y no perder la prioridad en tus días y horarios`
                        : `El plazo para renovar venció el ${pretty(p.dueDate)}: consultá en recepción`}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className="text-sm font-bold text-info-fuerte">
                      ${p.amount.toLocaleString('es-AR')}
                    </span>
                    {p.mpLink && aTiempo && (
                      <a
                        href={p.mpLink}
                        target="_blank"
                        rel="noreferrer"
                        className="px-3 py-1.5 rounded-lg bg-[#009EE3] text-white text-[11px] font-bold hover:opacity-90"
                      >
                        Renovar online
                      </a>
                    )}
                  </div>
                </div>
              )
            })}
            {/* Lo que pasa al pagar, dicho sin prometer de más: la fecha de
                arranque la decide el trigger de la 0036/0037 según cuándo
                entró el pago, así que esto solo vale para el caso de pagar
                a tiempo. Vencido el plazo, la línea desaparece y lo que
                queda dicho es que consulte en recepción. */}
            {renovacionATiempo && (
              <>
                <p className="text-[10px] text-info-fuerte mt-1">
                  Si renovás antes de que venza el plan que estás usando, el período nuevo arranca
                  recién cuando ese termina.
                </p>
                {!misRenovaciones.some((p) => p.mpLink) && (
                  <p className="text-[10px] text-info-fuerte mt-1">
                    Podés renovar en recepción o pedir el link de pago por WhatsApp.
                  </p>
                )}
              </>
            )}
          </div>
        )}

        {/* Deudas destacadas */}
        {pestana === 'inicio' && myDebts.length > 0 && (
          <div className="bg-aviso-suave border border-aviso/40 rounded-2xl p-4">
            <p className="text-xs font-bold text-aviso-fuerte mb-2 flex items-center gap-1.5">
              <CreditCard className="w-3.5 h-3.5" />
              Tenés {myDebts.length} pago{myDebts.length !== 1 ? 's' : ''} pendiente{myDebts.length !== 1 ? 's' : ''}
            </p>
            {myDebts.map((p) => {
              // El período al que pertenece la cuota. Cuando todavía no
              // arrancó hay que decirlo: con el encolado de la 0036, pagar
              // antes le crea el mes siguiente, y en el portal aparecían
              // dos cuotas pendientes que se leían como si debiera dos
              // meses de una. Le pasó a una clienta el 17/09 y preguntó.
              const periodo = memberships.find((m) => m.id === p.membershipId)
              const empiezaDespues = !!periodo && periodo.startDate > today
              return (
              <div key={p.id} className="flex items-center justify-between gap-2 py-1.5">
                <div className="min-w-0">
                  <p className="text-xs font-semibold text-aviso-fuerte truncate">{p.planName}</p>
                  <p className="text-[10px] text-aviso-fuerte">
                    {empiezaDespues && periodo
                      ? `Del período que empieza el ${pretty(periodo.startDate)} · vence ${pretty(p.dueDate)}`
                      : `Vence ${pretty(p.dueDate)}`}
                  </p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <span className="text-sm font-bold text-aviso-fuerte">
                    ${p.amount.toLocaleString('es-AR')}
                  </span>
                  {p.mpLink && (
                    <a
                      href={p.mpLink}
                      target="_blank"
                      rel="noreferrer"
                      className="px-3 py-1.5 rounded-lg bg-[#009EE3] text-white text-[11px] font-bold hover:opacity-90"
                    >
                      Pagar online
                    </a>
                  )}
                </div>
              </div>
              )
            })}
            {!myDebts.some((p) => p.mpLink) && (
              <p className="text-[10px] text-aviso-fuerte mt-1">
                Podés abonar en recepción o pedir el link de pago por WhatsApp.
              </p>
            )}
          </div>
        )}

        {/* En Inicio, sólo las dos que siguen y un camino al resto: es un
            resumen, no la lista. La lista completa vive en Mis clases. */}
        {pestana === 'inicio' && (
          <section>
            <h2 className="text-sm font-bold text-foreground mb-3 flex items-center gap-2">
              <CalendarDays className="w-4 h-4 text-primary-fuerte" />
              Tus próximas clases
            </h2>
            <UpcomingList
              reservations={myUpcoming.slice(0, 2)}
              suspendidas={suspendidas}
              onCancel={cancel}
              busyId={busyId}
              alReservar={() => setPestana('reservar')}
            />
            {myUpcoming.length > 2 && (
              <button
                onClick={() => setPestana('clases')}
                className="w-full mt-2 py-2 rounded-xl border border-border text-xs font-semibold text-muted-foreground hover:bg-muted transition-colors"
              >
                Ver las {myUpcoming.length} que tenés reservadas
              </button>
            )}

          </section>
        )}

        {/* Mis clases: la lista entera, con su regla, y el detalle del plan */}
        {pestana === 'clases' && (
        <section>
          <h2 className="text-sm font-bold text-foreground mb-3 flex items-center gap-2">
            <CalendarDays className="w-4 h-4 text-primary-fuerte" />
            Tus próximas clases
          </h2>
          <UpcomingList
            reservations={myUpcoming}
            suspendidas={suspendidas}
            onCancel={cancel}
            busyId={busyId}
            alReservar={() => setPestana('reservar')}
          />
          {/* La regla, a la vista y no recién al apretar Cancelar. Sale del
              mismo parámetro que usa la base, así que si el estudio lo
              cambia, esto cambia. Sólo si hay algo que cancelar. */}
          {myUpcoming.length > 0 && (
            <p className="text-[11px] text-muted-foreground mt-2.5 px-1">
              Podés cancelar hasta {horasDeCancelacion}{' '}
              {horasDeCancelacion === 1 ? 'hora' : 'horas'} antes de que empiece la clase
              y se te devuelve al plan. Después de ese plazo, la clase se consume.
            </p>
          )}
        </section>
        )}

        {/* El detalle del contador, plegado. Va acá y no al final: la duda
            "¿por qué me quedan 2?" nace mirando el plan de arriba, y al
            final de la grilla de reservar nadie llega. */}
        {/* Sin membresía no hay contador que explicar, y la pestaña no
            puede quedar muda: se dice por qué está vacía. */}
        {pestana === 'clases' && !ms && (
          <p className="text-xs text-muted-foreground text-center">
            Cuando tengas un plan activo, acá vas a ver cuántas clases usaste y cuáles fueron.
          </p>
        )}

        {pestana === 'clases' && ms && (
          <ClasesDelPlan
            ms={ms}
            reservas={misReservas}
            suspendidas={suspendidas}
            ausenciaConsume={settingBool(settings, 'absence_consumes_class', true)}
            hoy={today}
          />
        )}

        {/* Reservar */}
        {pestana === 'reservar' && (
        <section>
          <h2 className="text-sm font-bold text-foreground mb-3 flex items-center gap-2">
            <Clock className="w-4 h-4 text-primary-fuerte" />
            Reservar una clase
          </h2>

          {!canBook && (
            <div className="bg-muted rounded-2xl px-4 py-3 mb-3">
              <p className="text-xs text-muted-foreground">
                {motivoSinReservar(ms, classesLeft)}
              </p>
            </div>
          )}

          {/* Navegación de semana */}
          <div className="flex items-center justify-between mb-2.5">
            <button
              onClick={() => setWeekOffset((w) => Math.max(0, w - 1))}
              disabled={weekOffset === 0}
              aria-label="Semana anterior"
              className="w-8 h-8 rounded-lg hover:bg-muted flex items-center justify-center text-muted-foreground disabled:opacity-30"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <p className="text-xs font-semibold text-foreground">
              Semana del {pretty(weekStart)} al {pretty(addDays(weekStart, 5))}
            </p>
            <button
              onClick={() => setWeekOffset((w) => w + 1)}
              aria-label="Semana siguiente"
              className="w-8 h-8 rounded-lg hover:bg-muted flex items-center justify-center text-muted-foreground"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>

          {/* Días */}
          <div className="grid grid-cols-6 gap-1.5 mb-3">
            {DAYS_SHORT.map((d, i) => {
              const date = addDays(weekStart, i)
              const isPast = date < today
              return (
                <button
                  key={d}
                  onClick={() => setDay(i)}
                  disabled={isPast}
                  className={cn(
                    'py-2 rounded-xl text-center transition-all',
                    day === i
                      ? 'bg-primary text-primary-foreground shadow-md'
                      : isPast
                      // Deshabilitado, no invisible: a /40 el número del
                      // día quedaba en 1,79:1 y no se leía la fecha.
                      ? 'bg-muted/50 text-muted-foreground/70'
                      : 'bg-card border border-border text-foreground hover:border-primary/40'
                  )}
                >
                  <p className="text-[10px] font-semibold">{d}</p>
                  <p className="text-xs font-bold">{date.slice(8, 10)}</p>
                </button>
              )
            })}
          </div>

          {/* Clases del día */}
          <div className="space-y-2">
            {dayClasses.length === 0 && (
              <p className="text-xs text-muted-foreground text-center py-4">Sin clases este día.</p>
            )}
            {dayClasses.map((c) => {
              // Por fecha Y HORA. `c.time` ya es el horario efectivo de
              // ese día, con el cambio de la instancia aplicado (0018):
              // si la clase se corrió a la tarde, la reserva cierra a la
              // tarde.
              const isPast = reservaCerrada(c.date, c.time, ahora, minutosDeCorte)
              const isFull = c.occ.confirmed >= c.capacity
              const spotsLeft = Math.max(0, c.capacity - c.occ.confirmed)
              return (
                <div
                  key={c.id}
                  className={cn(
                    'bg-card rounded-2xl border border-border px-4 py-3 flex items-center gap-3',
                    (isPast || c.suspended) && 'opacity-60'
                  )}
                >
                  <div className="w-12 shrink-0 text-center">
                    <p className="text-sm font-bold text-foreground">{c.time}</p>
                    <p className="text-[9px] text-muted-foreground">{c.durationMinutes}min</p>
                  </div>
                  <div
                    className="w-1 self-stretch rounded-full shrink-0"
                    style={{ backgroundColor: disciplineStyle(disciplines, c.discipline).dot }}
                  />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-foreground truncate">{c.title}</p>
                    <p className="text-[10px] text-muted-foreground truncate flex items-center gap-1">
                      {c.teacherName} · <MapPin className="w-2.5 h-2.5 inline" /> {c.room}
                    </p>
                    <p className={cn('text-[10px] font-medium', isFull ? 'text-destructive-fuerte' : 'text-exito-fuerte')}>
                      {isFull
                        ? `Completa${c.occ.waitlist > 0 ? ` · ${c.occ.waitlist} en espera` : ''}`
                        : `${spotsLeft} lugar${spotsLeft !== 1 ? 'es' : ''} libre${spotsLeft !== 1 ? 's' : ''}`}
                    </p>
                  </div>
                  <div className="shrink-0">
                    {c.mine ? (
                      <span className="flex items-center gap-1 text-[10px] font-bold text-exito-fuerte">
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        {c.mine.status === 'lista de espera' ? 'En espera' : 'Reservada'}
                      </span>
                    ) : c.suspended ? (
                      <span className="text-[10px] font-semibold text-muted-foreground text-right leading-tight block max-w-[92px]">
                        Suspendida
                        {c.suspendedReason ? `: ${c.suspendedReason}` : ''}
                      </span>
                    ) : isPast ? (
                      // Antes acá no iba nada, y con la comparación por
                      // fecha daba igual: un día pasado no se puede
                      // abrir. Pero hoy la lista mezcla clases que ya
                      // pasaron con las que faltan, y un renglón sin
                      // botón, sin explicación, se lee como un error.
                      c.date === today ? (
                        <span className="text-[10px] font-semibold text-muted-foreground text-right leading-tight block max-w-[92px]">
                          {reservaCerrada(c.date, c.time, ahora) ? 'Ya empezó' : 'Cerró la reserva'}
                        </span>
                      ) : null
                    ) : !puedeReservarEl(c.date) ? (
                      // Con un plan que arranca más adelante, decir la
                      // fecha es más útil que no mostrar nada: es la
                      // diferencia entre "no puedo" y "todavía no".
                      proximoInicio && c.date < proximoInicio ? (
                        <span className="text-[10px] font-semibold text-muted-foreground text-right leading-tight block max-w-[92px]">
                          Desde el {pretty(proximoInicio)}
                        </span>
                      ) : null
                    ) : !c.bookable ? (
                      <span className="text-[10px] font-semibold text-muted-foreground text-right leading-tight block max-w-[92px]">
                        Reservás en recepción
                      </span>
                    ) : busyId === c.id ? (
                      <Loader2 className="w-4 h-4 animate-spin text-primary-fuerte" />
                    ) : isFull ? (
                      <button
                        onClick={() => book(c.id, c.date, true)}
                        className="px-3 py-1.5 rounded-lg bg-aviso-suave text-aviso-fuerte text-[11px] font-bold hover:bg-aviso/30 transition-colors"
                      >
                        Lista de espera
                      </button>
                    ) : (
                      <button
                        onClick={() => book(c.id, c.date, false)}
                        className="px-3.5 py-1.5 rounded-lg bg-primary text-primary-foreground text-[11px] font-bold hover:opacity-90 transition-opacity"
                      >
                        Reservar
                      </button>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        </section>

        )}

        {/* Historial de pagos */}
        {pestana === 'pagos' && (
        <section>
          <h2 className="text-sm font-bold text-foreground mb-3 flex items-center gap-2">
            <CreditCard className="w-4 h-4 text-primary-fuerte" />
            Tus pagos
          </h2>
          {myPayments.length === 0 ? (
            <p className="text-xs text-muted-foreground text-center py-4">Sin pagos registrados.</p>
          ) : (
            <div className="bg-card rounded-2xl border border-border divide-y divide-border">
              {myPayments.map((p) => {
                const oferta = esOferta(p)
                const anulada = p.status === 'anulado'
                // La oferta que no se tomó termina anulada, y así llega
                // acá. Sin esta rama caía en el "Vence ..." de abajo con
                // el monto en negrita: a la clienta le quedaba un cargo
                // pendiente en pantalla por un mes que no compró y que el
                // sistema ya dio por no vendido. Se pregunta por la
                // columna —`esOferta` descarta las anuladas— y se exige
                // que nunca se haya cobrado, porque una renovación
                // cobrada y anulada después es otra cosa.
                const ofertaCaducada = anulada && !!p.renuevaMembresiaId && !p.date
                return (
                <div key={p.id} className="px-4 py-3 flex items-center gap-3">
                  <div
                    className={cn(
                      'w-2 h-2 rounded-full shrink-0',
                      p.status === 'pagado' && 'bg-exito',
                      oferta && 'bg-info',
                      anulada && 'bg-muted-foreground/40',
                      p.status === 'pendiente' && !oferta && 'bg-aviso',
                      p.status === 'vencido' && 'bg-destructive'
                    )}
                  />
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-semibold text-foreground truncate">{p.planName}</p>
                    <p className="text-[10px] text-muted-foreground">
                      {p.status === 'pagado'
                        ? `Pagado el ${pretty(p.date)}${p.receiptNumber ? ` · Comp. ${String(p.receiptNumber).padStart(6, '0')}` : ''}`
                        : ofertaCaducada
                        ? `Renovación no tomada · venció el ${pretty(p.dueDate)}`
                        : anulada
                        ? 'Anulado'
                        : oferta
                        ? p.dueDate >= today
                          ? `Renovación · hasta el ${pretty(p.dueDate)}`
                          : `Renovación · el plazo venció el ${pretty(p.dueDate)}`
                        : `Vence ${pretty(p.dueDate)}`}
                    </p>
                  </div>
                  <p
                    className={cn(
                      'text-sm font-bold shrink-0',
                      anulada ? 'text-muted-foreground line-through' : 'text-foreground'
                    )}
                  >
                    ${p.amount.toLocaleString('es-AR')}
                  </p>
                </div>
                )
              })}
            </div>
          )}
        </section>

        )}

        {pestana === 'perfil' && (
          <TabPerfil
            me={me}
            credencial={miCredencial}
            onCambiarClave={() => setShowChangePassword(true)}
            onSalir={() => signOut()}
          />
        )}

        <p className="text-center text-[10px] text-muted-foreground pt-2">
          ¿Dudas? Escribinos por WhatsApp o consultá en recepción.
        </p>
      </main>

      <BarraPestanas activa={pestana} onCambiar={setPestana} pendientes={myUpcoming.length} />
    </div>
  )
}
