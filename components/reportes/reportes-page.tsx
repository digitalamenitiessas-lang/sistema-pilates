'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { Download, Loader2, FileSpreadsheet, Printer, Info } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useData } from '@/lib/data-context'
import { addDays, localISO } from '@/lib/api'
import { descargarCsv, nombreArchivo, type Columna } from '@/lib/export'
import {
  reporteAltas,
  reporteAsistencias,
  reporteCobros,
  reporteDeudas,
  reporteEgresos,
  reporteMembresias,
  reporteOcupacion,
  reportePorMedio,
  reporteResultado,
} from '@/lib/reportes-api'

const plata = (n: number) => `$${Math.round(n).toLocaleString('es-AR')}`
const fecha = (iso: string) =>
  iso ? new Date(iso + 'T12:00:00').toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: '2-digit' }) : ''

/**
 * Un reporte declara sus columnas una sola vez: la tabla y la descarga
 * salen de la misma definición, así no puede pasar que el CSV tenga otras
 * columnas que la pantalla.
 */
interface Reporte<T = Record<string, unknown>> {
  key: string
  nombre: string
  grupo: 'Plata' | 'Alumnas' | 'Clases'
  descripcion: string
  /** Qué permiso hace falta para que devuelva algo */
  necesita?: string
  cargar: (r: { desde: string; hasta: string }) => Promise<T[]>
  columnas: Array<Columna<T> & { alinearDerecha?: boolean; render?: (f: T) => string }>
  /** Columna que se suma al pie */
  totalizar?: (filas: T[]) => string
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const REPORTES: Array<Reporte<any>> = [
  {
    key: 'cobros',
    nombre: 'Cobros',
    grupo: 'Plata',
    descripcion: 'Todo lo que entró, con su medio, cuenta y comprobante',
    necesita: 'finanzas.ver',
    cargar: reporteCobros,
    columnas: [
      { titulo: 'Fecha', valor: (f) => f.fecha, render: (f) => fecha(f.fecha) },
      { titulo: 'Alumna', valor: (f) => f.alumna },
      { titulo: 'Concepto', valor: (f) => f.concepto },
      { titulo: 'Medio', valor: (f) => f.medio },
      { titulo: 'Cuenta', valor: (f) => f.cuenta },
      { titulo: 'Comprobante', valor: (f) => f.comprobante },
      { titulo: 'Monto', valor: (f) => f.monto, numero: true, alinearDerecha: true, render: (f) => plata(f.monto) },
    ],
    totalizar: (filas) => plata(filas.reduce((a, f) => a + f.monto, 0)),
  },
  {
    key: 'deudas',
    nombre: 'Deudas',
    grupo: 'Plata',
    descripcion: 'Lo que falta cobrar, con la antigüedad de cada deuda',
    necesita: 'finanzas.ver',
    cargar: (r) => reporteDeudas(r.hasta),
    columnas: [
      { titulo: 'Alumna', valor: (f) => f.alumna },
      { titulo: 'Concepto', valor: (f) => f.concepto },
      { titulo: 'Vencía', valor: (f) => f.vencimiento, render: (f) => fecha(f.vencimiento) },
      {
        titulo: 'Días',
        valor: (f) => f.diasVencida,
        numero: true,
        alinearDerecha: true,
        render: (f) => (f.diasVencida > 0 ? `${f.diasVencida}` : 'al día'),
      },
      { titulo: 'Monto', valor: (f) => f.monto, numero: true, alinearDerecha: true, render: (f) => plata(f.monto) },
    ],
    totalizar: (filas) => plata(filas.reduce((a, f) => a + f.monto, 0)),
  },
  {
    key: 'egresos',
    nombre: 'Egresos',
    grupo: 'Plata',
    descripcion: 'Los gastos pagados, por categoría y proveedor',
    necesita: 'gastos.ver',
    cargar: reporteEgresos,
    columnas: [
      { titulo: 'Fecha', valor: (f) => f.fecha, render: (f) => fecha(f.fecha) },
      { titulo: 'Categoría', valor: (f) => f.categoria },
      { titulo: 'Detalle', valor: (f) => f.detalle },
      { titulo: 'Proveedor', valor: (f) => f.proveedor },
      { titulo: 'Comprobante', valor: (f) => f.comprobante },
      { titulo: 'Cuenta', valor: (f) => f.cuenta },
      { titulo: 'Monto', valor: (f) => f.monto, numero: true, alinearDerecha: true, render: (f) => plata(f.monto) },
    ],
    totalizar: (filas) => plata(filas.reduce((a, f) => a + f.monto, 0)),
  },
  {
    key: 'resultado',
    nombre: 'Resultado por mes',
    grupo: 'Plata',
    descripcion: 'Ingresos, egresos y lo que queda, mes a mes',
    necesita: 'finanzas.ver',
    cargar: reporteResultado,
    columnas: [
      { titulo: 'Mes', valor: (f) => f.mes },
      { titulo: 'Ingresos', valor: (f) => f.ingresos, numero: true, alinearDerecha: true, render: (f) => plata(f.ingresos) },
      { titulo: 'Egresos', valor: (f) => f.egresos, numero: true, alinearDerecha: true, render: (f) => plata(f.egresos) },
      { titulo: 'Resultado', valor: (f) => f.neto, numero: true, alinearDerecha: true, render: (f) => plata(f.neto) },
    ],
    totalizar: (filas) => plata(filas.reduce((a, f) => a + f.neto, 0)),
  },
  {
    key: 'medios',
    nombre: 'Cobrado por medio',
    grupo: 'Plata',
    descripcion: 'Cuánto entró por cada medio de pago, en plata',
    necesita: 'finanzas.ver',
    cargar: reportePorMedio,
    columnas: [
      { titulo: 'Medio', valor: (f) => f.medio },
      { titulo: 'Cobros', valor: (f) => f.cantidad, numero: true, alinearDerecha: true, render: (f) => String(f.cantidad) },
      { titulo: 'Monto', valor: (f) => f.monto, numero: true, alinearDerecha: true, render: (f) => plata(f.monto) },
    ],
    totalizar: (filas) => plata(filas.reduce((a, f) => a + f.monto, 0)),
  },
  {
    key: 'altas',
    nombre: 'Alumnas nuevas',
    grupo: 'Alumnas',
    descripcion: 'Quiénes se sumaron en el período, con su contacto',
    cargar: reporteAltas,
    columnas: [
      { titulo: 'Fecha', valor: (f) => f.fecha, render: (f) => fecha(f.fecha) },
      { titulo: 'Alumna', valor: (f) => f.alumna },
      { titulo: 'Email', valor: (f) => f.email },
      { titulo: 'Teléfono', valor: (f) => f.telefono },
    ],
    totalizar: (filas) => `${filas.length} ${filas.length === 1 ? 'alta' : 'altas'}`,
  },
  {
    key: 'membresias',
    nombre: 'Membresías que vencen',
    grupo: 'Alumnas',
    descripcion: 'Las que terminan en el período: para renovar y para recuperar',
    cargar: reporteMembresias,
    columnas: [
      { titulo: 'Alumna', valor: (f) => f.alumna },
      { titulo: 'Plan', valor: (f) => f.plan },
      { titulo: 'Vence', valor: (f) => f.hasta, render: (f) => fecha(f.hasta) },
      {
        titulo: 'Clases',
        valor: (f) => `${f.usadas}/${f.total}`,
        alinearDerecha: true,
        render: (f) => `${f.usadas}/${f.total}`,
      },
      { titulo: 'Estado', valor: (f) => f.estado },
    ],
    totalizar: (filas) => `${filas.length}`,
  },
  {
    key: 'asistencias',
    nombre: 'Asistencias',
    grupo: 'Clases',
    descripcion: 'Quién vino, quién faltó y quién canceló',
    cargar: reporteAsistencias,
    columnas: [
      { titulo: 'Fecha', valor: (f) => f.fecha, render: (f) => fecha(f.fecha) },
      { titulo: 'Clase', valor: (f) => f.clase },
      { titulo: 'Profesora', valor: (f) => f.profesora },
      { titulo: 'Alumna', valor: (f) => f.alumna },
      { titulo: 'Estado', valor: (f) => f.estado },
    ],
    totalizar: (filas) => {
      const vino = filas.filter((f) => f.estado === 'asistió').length
      const falto = filas.filter((f) => f.estado === 'ausente').length
      return `${vino} asistieron · ${falto} faltaron`
    },
  },
  {
    key: 'ocupacion',
    nombre: 'Ocupación por clase',
    grupo: 'Clases',
    descripcion: 'Cuánto se llena cada clase y cuánta gente va de verdad',
    cargar: reporteOcupacion,
    columnas: [
      { titulo: 'Clase', valor: (f) => f.clase },
      { titulo: 'Profesora', valor: (f) => f.profesora },
      { titulo: 'Cupo', valor: (f) => f.cupo, numero: true, alinearDerecha: true, render: (f) => String(f.cupo) },
      { titulo: 'Reservas', valor: (f) => f.reservas, numero: true, alinearDerecha: true, render: (f) => String(f.reservas) },
      { titulo: 'Asistieron', valor: (f) => f.asistencias, numero: true, alinearDerecha: true, render: (f) => String(f.asistencias) },
      { titulo: 'Faltaron', valor: (f) => f.ausencias, numero: true, alinearDerecha: true, render: (f) => String(f.ausencias) },
      { titulo: 'Ocupación', valor: (f) => f.ocupacion, numero: true, alinearDerecha: true, render: (f) => `${f.ocupacion}%` },
    ],
    totalizar: (filas) => `${filas.reduce((a, f) => a + f.reservas, 0)} reservas`,
  },
]

export function ReportesPage() {
  const { can, canWrite } = useData()
  const [activo, setActivo] = useState('cobros')
  const [desde, setDesde] = useState(addDays(localISO(), -30))
  const [hasta, setHasta] = useState(localISO())
  const [filas, setFilas] = useState<Record<string, unknown>[]>([])
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const reporte = useMemo(() => REPORTES.find((r) => r.key === activo)!, [activo])
  // Si le falta el permiso, el reporte devuelve cero filas. Decirlo es la
  // diferencia entre "no hubo movimientos" y "no te corresponde verlo".
  const sinPermiso = !!reporte.necesita && !can(reporte.necesita) && !canWrite

  const cargar = useCallback(async () => {
    setCargando(true)
    setError(null)
    try {
      setFilas(await reporte.cargar({ desde, hasta }))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo generar el reporte')
      setFilas([])
    } finally {
      setCargando(false)
    }
  }, [reporte, desde, hasta])

  useEffect(() => {
    cargar()
  }, [cargar])

  const descargar = () => {
    descargarCsv(nombreArchivo(reporte.nombre, desde, hasta), filas, reporte.columnas)
  }

  const grupos = ['Plata', 'Alumnas', 'Clases'] as const

  return (
    <div className="p-4 md:p-6 space-y-5">
      {/* Elegir el reporte */}
      <div className="flex flex-wrap gap-x-6 gap-y-3">
        {grupos.map((g) => (
          <div key={g}>
            <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide mb-1.5">
              {g}
            </p>
            <div className="flex flex-wrap gap-1.5">
              {REPORTES.filter((r) => r.grupo === g).map((r) => (
                <button
                  key={r.key}
                  onClick={() => setActivo(r.key)}
                  className={cn(
                    'px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors',
                    activo === r.key
                      ? 'border-primary bg-primary/5 text-primary'
                      : 'border-border text-muted-foreground hover:border-primary/40 hover:text-foreground'
                  )}
                >
                  {r.nombre}
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>

      {/* Período y descarga */}
      <div className="bg-card rounded-2xl border border-border px-4 py-3 flex items-center gap-3 flex-wrap">
        <div>
          <p className="text-sm font-semibold text-foreground">{reporte.nombre}</p>
          <p className="text-[11px] text-muted-foreground">{reporte.descripcion}</p>
        </div>

        <div className="flex-1" />

        <input
          type="date"
          value={desde}
          onChange={(e) => setDesde(e.target.value)}
          className="px-3 py-1.5 rounded-lg border border-border bg-background text-xs text-foreground outline-none"
        />
        <span className="text-xs text-muted-foreground">a</span>
        <input
          type="date"
          value={hasta}
          onChange={(e) => setHasta(e.target.value)}
          className="px-3 py-1.5 rounded-lg border border-border bg-background text-xs text-foreground outline-none"
        />

        <button
          onClick={descargar}
          disabled={filas.length === 0}
          className="px-3 py-1.5 rounded-lg bg-primary text-primary-foreground text-xs font-semibold flex items-center gap-1.5 disabled:opacity-40"
        >
          <FileSpreadsheet className="w-3.5 h-3.5" />
          Excel
        </button>
        <button
          onClick={() => window.print()}
          disabled={filas.length === 0}
          className="px-3 py-1.5 rounded-lg border border-border text-muted-foreground text-xs font-semibold flex items-center gap-1.5 disabled:opacity-40 hover:text-foreground"
          title="Imprimir o guardar como PDF"
        >
          <Printer className="w-3.5 h-3.5" />
          PDF
        </button>
      </div>

      {sinPermiso && (
        <div className="rounded-xl bg-amber-50 border border-amber-200 px-4 py-3 flex gap-2.5">
          <Info className="w-4 h-4 text-amber-700 shrink-0 mt-0.5" />
          <p className="text-xs text-amber-800">
            Tu rol no puede ver esta información, así que el reporte va a salir vacío.
          </p>
        </div>
      )}

      {error && <p className="text-sm text-destructive bg-destructive/10 rounded-xl px-4 py-3">{error}</p>}

      {/* La tabla */}
      <div className="bg-card rounded-2xl border border-border overflow-hidden">
        {cargando ? (
          <div className="py-16 flex justify-center">
            <Loader2 className="w-5 h-5 animate-spin text-primary" />
          </div>
        ) : filas.length === 0 ? (
          <div className="py-16 text-center">
            <Download className="w-8 h-8 text-muted-foreground/30 mx-auto mb-2" />
            <p className="text-sm text-muted-foreground">
              {sinPermiso ? 'Sin acceso a estos datos' : 'No hay datos en este período'}
            </p>
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-border bg-muted/40">
                    {reporte.columnas.map((c) => (
                      <th
                        key={c.titulo}
                        className={cn(
                          'px-4 py-2.5 font-semibold text-muted-foreground uppercase tracking-wide whitespace-nowrap',
                          c.alinearDerecha ? 'text-right' : 'text-left'
                        )}
                      >
                        {c.titulo}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filas.slice(0, 300).map((f, i) => (
                    <tr key={i} className="border-b border-border last:border-0 hover:bg-muted/20">
                      {reporte.columnas.map((c) => (
                        <td
                          key={c.titulo}
                          className={cn(
                            'px-4 py-2 text-foreground',
                            c.alinearDerecha ? 'text-right tabular-nums' : ''
                          )}
                        >
                          {c.render ? c.render(f) : String(c.valor(f) ?? '')}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="px-4 py-3 border-t border-border flex items-center justify-between gap-3 flex-wrap">
              <p className="text-xs text-muted-foreground">
                {filas.length} {filas.length === 1 ? 'fila' : 'filas'}
                {filas.length > 300 && ' · se muestran las primeras 300, la descarga las trae todas'}
              </p>
              {reporte.totalizar && (
                <p className="text-sm font-bold text-foreground tabular-nums">
                  {reporte.totalizar(filas)}
                </p>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  )
}
