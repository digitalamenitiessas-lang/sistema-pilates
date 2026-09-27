'use client'

/**
 * Quiénes tienen este horario fijo, y la gestión desde administración
 * (0048). Es §2 del pedido del estudio del 15/09, casi entero:
 * *"Consultar quién ocupa permanentemente cada horario"*, cambiar,
 * liberar y *"saber cuándo pierde prioridad"*.
 *
 * Vive en el detalle de la clase, en Agenda, porque ahí es donde la
 * pregunta aparece: el mostrador está mirando el martes a las 18 y
 * quiere saber cuántos de esos ocho lugares ya tienen dueño.
 *
 * La ocupación fija es distinta de la ocupación de una fecha. Una clase
 * puede tener 6 de 8 lugares con dueño permanente y estar vacía el
 * martes que viene: el turno fijo es un derecho, no una reserva. Por eso
 * este bloque cuenta aparte y lo dice con esas palabras.
 *
 * Y por lo mismo, dar el horario también anota las fechas (T27, 27/09).
 * Hasta acá "Darle este horario fijo" escribía `fixed_slots` y nada más:
 * el lugar de cada martes lo cuida `enforce_class_capacity`, que cuenta
 * reservas y no turnos, así que el martes se podía llenar con otras y la
 * dueña del horario quedaba afuera. Y encima el portal, al verla con el
 * turno ya dado, dejaba de ofrecerle completar las fechas.
 *
 * Las fechas se anotan en dos lugares distintos, porque son dos preguntas:
 *
 *   · Al DARLE el horario (abajo, con la clienta elegida en el selector),
 *     desde la fecha que está abierta. Es "arranca este martes".
 *   · Al COMPLETAR un horario que ya es suyo (en su renglón), todo lo que
 *     le falta del período. Va en el renglón y no en el selector porque
 *     el selector saca a las que ya están anotadas en esta fecha, y "abro
 *     su martes para completarle el mes" es justo el caso más común.
 */

import { useEffect, useState } from 'react'
import { CalendarClock, CalendarPlus, Loader2, UserMinus, Pause, Play } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useData, useStudio } from '@/lib/data-context'
import {
  asignarTurnoFijo,
  fechasPorCompletar,
  fetchOcupacionDeClases,
  hoyISO,
  liberarTurnoFijo,
  pausarTurnoFijo,
  periodoMirando,
  reactivarTurnoFijo,
  reservarFechasDelTurno,
  turnoPorCompletar,
} from '@/lib/api'
import type { FixedSlot, Student } from '@/lib/types'

const fecha = (iso: string) => new Date(`${iso}T00:00`).toLocaleDateString('es-AR')

const corta = (iso: string) => {
  const [, m, d] = iso.split('-')
  return `${d}/${m}`
}

type Resultado = {
  nombre: string
  nuevo: boolean
  hechas: string[]
  fallaron: Array<{ fecha: string; motivo: string }>
}

/** Lo que pasó, fecha por fecha y con el motivo de la base: un lote que
 *  falla de a una necesita decir cuál y por qué. */
function ResultadoDelLote({ r }: { r: Resultado }) {
  return (
    <div className="rounded-lg bg-muted px-2.5 py-2 space-y-1">
      <p className={cn('text-[11px] font-semibold', r.hechas.length > 0 ? 'text-exito-fuerte' : 'text-foreground')}>
        {r.nuevo ? `${r.nombre} tiene este horario fijo. ` : ''}
        {r.hechas.length === 0
          ? 'No se reservó ninguna fecha.'
          : `${r.hechas.length === 1 ? 'Quedó reservado el' : 'Quedaron reservados los'} ${r.hechas.map(corta).join(' · ')}.`}
      </p>
      {r.fallaron.map((f) => (
        <p key={f.fecha} className="text-[10px] text-aviso-fuerte">
          <span className="font-semibold">{corta(f.fecha)}:</span> {f.motivo}
        </p>
      ))}
    </div>
  )
}

/** Las fechas completas, dichas: no se reservan, pero el mostrador tiene que saber cuáles. */
const textoDeLlenas = (llenas: string[]) =>
  llenas.length === 0
    ? ''
    : llenas.length === 1
    ? ` El ${corta(llenas[0])} está completo y queda afuera.`
    : ` ${llenas.map(corta).join(' · ')} están completos y quedan afuera.`

function Turno({
  t,
  falta,
  puedeReservar,
  fechaAbierta,
  onHecho,
  onAnotada,
}: {
  t: FixedSlot
  /** Lo que le falta a este horario (`turnoPorCompletar`), o nulo sin plan. */
  falta: ReturnType<typeof turnoPorCompletar>
  puedeReservar: boolean
  fechaAbierta: string
  onHecho: () => Promise<void>
  onAnotada?: (studentId: string, nombre: string) => void
}) {
  const { can } = useData()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [resultado, setResultado] = useState<Resultado | null>(null)
  const puedeLiberar = can('turnos.liberar')
  const puedeAsignar = can('turnos.asignar')

  // Con `finally`: pausar y reactivar dejan el renglón en pantalla, y sin
  // esto la ruedita quedaba girando hasta cerrar el panel.
  const correr = async (accion: () => Promise<void>) => {
    setBusy(true)
    setError(null)
    try {
      await accion()
      await onHecho()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo guardar')
    } finally {
      setBusy(false)
    }
  }

  const liberar = () => {
    const motivo = window.prompt(
      `¿Por qué se libera el turno de ${t.studentName}? (lo ve el cliente en su portal)`,
      t.conPrioridad ? '' : 'No renovó la membresía'
    )
    if (motivo === null) return
    if (!motivo.trim()) {
      setError('Hace falta un motivo para liberar el turno')
      return
    }
    correr(() => liberarTurnoFijo(t.id, motivo))
  }

  // Completar: todo lo que le falta del período, con el tope de lo que le
  // queda en el plan. Las fechas y el tope son los que el renglón muestra.
  const completar = () => {
    if (!falta) return
    setResultado(null)
    correr(async () => {
      const r = await reservarFechasDelTurno(t.studentId, t.classId, falta.fechas, falta.libres)
      setResultado({ nombre: t.studentName.split(' ')[0], nuevo: false, ...r })
      if (r.hechas.includes(fechaAbierta)) onAnotada?.(t.studentId, t.studentName)
    })
  }

  const puedeCompletar = puedeReservar && t.estado === 'activo' && !!falta && falta.entran > 0

  return (
    <div className="py-1.5 space-y-1">
      <div className="flex items-center gap-2">
        <div className="flex-1 min-w-0">
          <p className="text-xs font-medium text-foreground truncate">
            {t.studentName}
            {t.estado === 'pausado' && (
              <span className="ml-1.5 text-[10px] font-semibold text-muted-foreground">en pausa</span>
            )}
          </p>
          {/* La fecha sola no alcanza: lo que decide si este lugar se puede
              dar de nuevo es si la prioridad sigue viva hoy.
              Y el pausado va aparte: la liberación automática NO lo toca
              (0049), así que decirle "se puede liberar" al mostrador sería
              justo lo contrario de lo que el estudio le prometió al cliente. */}
          <p
            className={cn(
              'text-[10px]',
              t.estado === 'pausado'
                ? 'text-muted-foreground'
                : t.conPrioridad
                ? 'text-muted-foreground'
                : 'text-destructive-fuerte font-semibold'
            )}
          >
            {t.estado === 'pausado'
              ? `el estudio le guarda el lugar${t.motivo ? ` · ${t.motivo}` : ''}`
              : t.prioridadHasta
              ? t.conPrioridad
                ? `prioridad hasta el ${fecha(t.prioridadHasta)}`
                : `sin prioridad desde el ${fecha(t.prioridadHasta)} — se puede liberar`
              : 'sin membresía — se puede liberar'}
          </p>
          {error && <p className="text-[10px] text-destructive-fuerte mt-0.5">{error}</p>}
        </div>

        {busy ? (
          <Loader2 className="w-3.5 h-3.5 animate-spin text-muted-foreground shrink-0" />
        ) : (
          <div className="flex items-center gap-0.5 shrink-0">
            {puedeAsignar &&
              (t.estado === 'pausado' ? (
                <button
                  onClick={() => correr(() => reactivarTurnoFijo(t.id))}
                  title="Volver a activarlo"
                  className="w-6 h-6 rounded-md flex items-center justify-center text-muted-foreground hover:bg-muted"
                >
                  <Play className="w-3 h-3" />
                </button>
              ) : (
                <button
                  onClick={() => {
                    const m = window.prompt('¿Por qué se pausa? (viaje, lesión…)', '')
                    if (m === null) return
                    correr(() => pausarTurnoFijo(t.id, m))
                  }}
                  title="Pausarlo sin quitárselo"
                  className="w-6 h-6 rounded-md flex items-center justify-center text-muted-foreground hover:bg-muted"
                >
                  <Pause className="w-3 h-3" />
                </button>
              ))}
            {puedeLiberar && (
              <button
                onClick={liberar}
                title="Liberar el lugar"
                className="w-6 h-6 rounded-md flex items-center justify-center text-muted-foreground hover:bg-destructive/10 hover:text-destructive-fuerte"
              >
                <UserMinus className="w-3 h-3" />
              </button>
            )}
          </div>
        )}
      </div>

      {/* Las fechas que le faltan, dichas antes de apretar: cuáles, de qué
          plan y cuántas clases le descuenta. La cuenta es lo que ENTRA
          —el mínimo entre las fechas y lo que le queda del plan—, así el
          renglón no ofrece para siempre una fecha que la base rechaza. */}
      {puedeCompletar && falta && (
        <div className="flex items-start gap-2 rounded-lg bg-muted/60 px-2 py-1.5">
          <p className="flex-1 text-[10px] text-muted-foreground leading-snug">
            Le {falta.entran === 1 ? 'falta 1 fecha' : `faltan ${falta.entran} fechas`} de su plan{' '}
            {falta.periodo.planName}: {falta.fechas.slice(0, falta.entran).map(corta).join(' · ')}. Le
            descuenta {falta.entran} {falta.entran === 1 ? 'clase' : 'clases'}.
            {textoDeLlenas(falta.llenas)}
          </p>
          <button
            disabled={busy}
            onClick={completar}
            title="Reservarle las fechas que le faltan"
            className="shrink-0 px-2 py-1 rounded-md border border-border bg-card text-[10px] font-semibold text-foreground hover:bg-muted flex items-center gap-1 disabled:opacity-60"
          >
            <CalendarPlus className="w-3 h-3" />
            Completar
          </button>
        </div>
      )}

      {resultado && <ResultadoDelLote r={resultado} />}
    </div>
  )
}

export function TurnosDeLaClase({
  classId,
  capacity,
  fecha,
  cliente,
  onAnotada,
}: {
  classId: string
  capacity: number
  /** La fecha de la clase que se está mirando: desde ahí se da el horario. */
  fecha: string
  /** El cliente elegido arriba, para poder darle este horario sin buscarlo de nuevo. */
  cliente?: Student
  /**
   * Avisa que una clienta quedó anotada en ESTA fecha, para que el panel la
   * sume a las anotadas y, si era la elegida, la saque del selector, como
   * hace al reservar: si siguiera elegida, "Reservar" le intentaría anotar
   * una fecha que ya tiene.
   */
  onAnotada?: (studentId: string, nombre: string) => void
}) {
  const { refresh, can } = useData()
  const { turnosFijos, classes, memberships, plans, reservations, occurrences } = useStudio()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // Lo que pasó con la última asignación, con el nombre adentro: el panel
  // suelta a la clienta al terminar y esto tiene que seguir diciendo de
  // quién era.
  const [resultado, setResultado] = useState<Resultado | null>(null)

  // Sin el `|| canWrite` de otras pantallas, y a propósito: las tres
  // claves las crea la 0048, así que `can()` responde que no mientras la
  // migración no haya corrido. Eso hace que la clave sea también el
  // interruptor de la función — el bloque no aparece prometiendo un
  // horario fijo que la base todavía no sabe guardar.
  const puedeVer = can('turnos.ver')
  const puedeAsignar = can('turnos.asignar')
  // Anotar las fechas es crear reservas, y eso pide otra clave. Un rol con
  // `turnos.asignar` y sin `reservas.crear` puede dar el horario, pero la
  // pantalla no le promete fechas que la base le va a rechazar una por una.
  const puedeReservar = can('reservas.crear')

  const turnos = turnosFijos.filter((t) => t.classId === classId)
  const activos = turnos.filter((t) => t.estado === 'activo').length
  const suyo = cliente ? turnos.find((t) => t.studentId === cliente.id) : undefined
  const clase = classes.find((c) => c.id === classId)
  const hoy = hoyISO()

  // La ocupación de esta clase de hoy hasta que vence lo último que tienen
  // las involucradas —la elegida y las dueñas de los turnos—, para no
  // anotar a nadie en una fecha llena. Mientras no llega, o si la vista no
  // contesta, no se filtra nada y la base dice cuál está completa.
  const involucradas = new Set([...(cliente ? [cliente.id] : []), ...turnos.map((t) => t.studentId)])
  const hasta =
    memberships
      .filter((m) => involucradas.has(m.studentId) && m.status !== 'cancelada' && m.status !== 'suspendida')
      .map((m) => m.endDate)
      .sort()
      .pop() ?? ''
  const [ocupacion, setOcupacion] = useState<Map<string, number> | undefined>(undefined)
  useEffect(() => {
    if (!puedeVer || hasta < hoy) return
    let vigente = true
    fetchOcupacionDeClases([classId], hoy, hasta).then((m) => {
      if (vigente) setOcupacion(m)
    })
    return () => {
      vigente = false
    }
  }, [puedeVer, classId, hoy, hasta, reservations])

  const comun = {
    reservas: reservations,
    ocurrencias: occurrences,
    ocupacion,
  }

  // DAR: el período de la fecha abierta y las fechas desde esa. Si el plan
  // no llega a esta fecha, `periodoMirando` cae al de hoy, y la previa lo
  // dice en vez de "no tiene plan".
  const periodo = cliente
    ? periodoMirando(
        memberships.filter((m) => m.studentId === cliente.id),
        plans,
        fecha,
        hoy
      )
    : undefined
  const desde = fecha > hoy ? fecha : hoy
  const { fechas, llenas } =
    cliente && clase && periodo && puedeReservar
      ? fechasPorCompletar({ clase, periodo, desde, studentId: cliente.id, ...comun })
      : { fechas: [] as string[], llenas: [] as string[] }
  const libres = periodo ? Math.max(0, periodo.classesTotal - periodo.classesUsed) : 0
  // Lo mismo que la hoja del portal: el plan corta antes que el calendario
  // cuando no le alcanza — el mes de cinco martes con un plan de cuatro.
  const entran = Math.min(fechas.length, libres)
  const sobran = fechas.length - entran

  // Un taller tiene fecha propia y no se repite. Lo rechaza la base, para
  // la clienta (0077) y desde la 0082 también para el mostrador; acá se
  // esconde el botón para no ofrecer algo que va a fallar.
  const esDeLaGrilla = clase?.kind !== 'especial'
  const puedeDar = puedeAsignar && !!cliente && !suyo && esDeLaGrilla

  // COMPLETAR: lo que le falta a cada dueña, desde la fecha abierta. El
  // período es el de esa fecha o, si ahí no le entra nada, el que tiene
  // encolado (`turnoPorCompletar`).
  const faltaDe = (t: FixedSlot) =>
    clase && puedeReservar && t.estado === 'activo'
      ? turnoPorCompletar({
          clase,
          propias: memberships.filter((m) => m.studentId === t.studentId),
          planes: plans,
          mirando: fecha,
          studentId: t.studentId,
          ...comun,
        })
      : null

  // Sin la 0048 corrida la lista llega vacía y no hay nada que mostrar;
  // tampoco para el rol que no ve turnos.
  if (!puedeVer || (turnos.length === 0 && !puedeAsignar)) return null

  /**
   * Da el horario y la anota en las fechas desde la abierta.
   *
   * El mismo orden que el portal: primero el turno —si el cupo fijo o el
   * tope de su plan lo rechazan, no se reservó nada— y después las fechas,
   * de a una y por el mismo insert que "Reservar", así cada una pasa por
   * `consumir_clase` con sus rechazos. Las fechas y el tope son los que la
   * previa mostró antes de apretar.
   */
  const asignar = async () => {
    if (!cliente) return
    const nombre = cliente.name.split(' ')[0]
    setBusy(true)
    setError(null)
    setResultado(null)
    try {
      await asignarTurnoFijo(cliente.id, classId)
      const r =
        entran > 0
          ? await reservarFechasDelTurno(cliente.id, classId, fechas, libres)
          : { hechas: [], fallaron: [] }
      await refresh()
      setResultado({ nombre, nuevo: true, ...r })
      if (r.hechas.includes(fecha)) onAnotada?.(cliente.id, cliente.name)
    } catch (err) {
      // Si esto viene de `asignarTurnoFijo`, no se reservó nada. Si viene de
      // después, el turno quedó dado y las fechas se completan desde su
      // renglón.
      setError(err instanceof Error ? err.message : 'No se pudo asignar el turno')
      await refresh().catch(() => {})
    } finally {
      setBusy(false)
    }
  }

  /** Lo que va a pasar, dicho antes de apretar: números, no promesas. */
  const previa = !cliente || !esDeLaGrilla
    ? null
    : !periodo
    ? 'No tiene un plan vigente ni por empezar: le queda el horario, pero no se reserva ninguna fecha.'
    : !puedeReservar
    ? 'Le queda el horario, sin fechas anotadas: tu usuario no tiene permiso para crear reservas.'
    : periodo.endDate < desde
    ? `Su plan ${periodo.planName} vence el ${corta(periodo.endDate)}, antes de esta fecha: le queda el horario, y las fechas se anotan cuando renueve.`
    : fechas.length === 0
    ? llenas.length > 0
      ? `Las fechas que quedan de su plan ${periodo.planName} ya están completas (${llenas
          .map(corta)
          .join(' · ')}): le queda el horario, sin fechas anotadas.`
      : `No quedan fechas de esta clase en su plan ${periodo.planName}, que vence el ${corta(periodo.endDate)}: le queda el horario, y las fechas del período siguiente se completan cuando renueve.`
    : libres === 0
    ? `Ya usó las clases de su plan ${periodo.planName}: le queda el horario, sin fechas anotadas.`
    : `Además le reserva desde el ${corta(fechas[0])} ${entran} ${entran === 1 ? 'fecha' : 'fechas'} de su plan ${periodo.planName}: ${fechas
        .slice(0, entran)
        .map(corta)
        .join(' · ')}. Le descuenta ${entran} ${entran === 1 ? 'clase' : 'clases'}.${
        sobran > 0
          ? ` ${sobran === 1 ? 'Una fecha queda afuera' : `${sobran} fechas quedan afuera`}: no le alcanzan las clases del plan.`
          : ''
      }${textoDeLlenas(llenas)}`

  return (
    <div className="rounded-xl border border-border bg-card px-3 py-2.5 space-y-1">
      <div className="flex items-center justify-between gap-2">
        <p className="text-[11px] font-bold text-foreground flex items-center gap-1.5">
          <CalendarClock className="w-3.5 h-3.5 shrink-0 text-primary-fuerte" />
          Turnos fijos
        </p>
        <p className="text-[10px] text-muted-foreground shrink-0">
          {activos} de {capacity} lugares con dueño
        </p>
      </div>

      {turnos.length === 0 ? (
        <p className="text-[11px] text-muted-foreground">
          Nadie tiene este horario reservado de forma permanente.
        </p>
      ) : (
        <div className="divide-y divide-border">
          {turnos.map((t) => (
            <Turno
              key={t.id}
              t={t}
              falta={faltaDe(t)}
              puedeReservar={puedeReservar}
              fechaAbierta={fecha}
              onHecho={refresh}
              onAnotada={onAnotada}
            />
          ))}
        </div>
      )}

      {cliente && puedeDar && (
        <div className="pt-1 space-y-1">
          <button
            disabled={busy}
            onClick={asignar}
            className="w-full py-2 rounded-lg text-[11px] font-semibold border border-border text-foreground hover:bg-muted transition-colors flex items-center justify-center gap-1.5 disabled:opacity-60"
          >
            {busy && <Loader2 className="w-3 h-3 animate-spin" />}
            {entran > 0
              ? `Darle este horario fijo a ${cliente.name.split(' ')[0]} y reservarle las fechas`
              : `Darle este horario fijo a ${cliente.name.split(' ')[0]}`}
          </button>
          {previa && <p className="text-[10px] text-muted-foreground leading-snug">{previa}</p>}
        </div>
      )}

      {resultado && <ResultadoDelLote r={resultado} />}

      {error && <p className="text-[11px] text-destructive-fuerte">{error}</p>}

      {/* Qué guarda el horario y qué no, sin prometer de más. Hasta el 27/09
          decía "guarda el lugar", y el lugar de cada fecha no lo guarda el
          turno: lo ocupa la reserva, que es lo único que cuenta el cupo. */}
      {turnos.length > 0 && (
        <p className="text-[10px] text-muted-foreground pt-0.5">
          El lugar de cada fecha lo ocupa la reserva, no el horario fijo. Al darlo se le reservan las fechas desde la
          fecha abierta; lo que le falte —el período siguiente, cuando renueve— se completa desde su
          renglón o desde su portal.
        </p>
      )}
    </div>
  )
}
