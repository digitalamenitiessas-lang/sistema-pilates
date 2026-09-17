'use client'

/**
 * Personal, horas y remuneraciones (0053).
 *
 * Va en su propio archivo y NO en `fetchStudioData` por dos razones. Una
 * es la obvia: los sueldos no tienen que viajar al navegador de todo el
 * que entra, y la clave `personal.remuneracion` es la más sensible del
 * sistema. La otra es la de siempre — esto crece con el tiempo y se mira
 * por período, así que es un reporte, no parte del paquete del estudio.
 */

import { supabase } from './supabase'
import type {
  AjusteLiquidacion,
  CondicionPago,
  HorasTrabajadas,
  FilaLiquidacion,
  LiquidacionCerrada,
} from './types'

/** La 0053 todavía no corrió. */
function sinPersonal(error: { code?: string } | null): boolean {
  return error?.code === '42P01' || error?.code === 'PGRST205' || error?.code === 'PGRST202'
}

const FALTA = 'Para usar Personal falta correr la migración 0053.'

// ── Condiciones salariales ──────────────────────────────────────────

export async function fetchCondiciones(teacherId?: string): Promise<CondicionPago[]> {
  let q = supabase.from('teacher_pay').select('*').order('desde', { ascending: false })
  if (teacherId) q = q.eq('teacher_id', teacherId)
  const { data, error } = await q

  // Sin la clave, la política devuelve cero filas y no un error: es lo
  // mismo que pasa con el resto del sistema, y la pantalla lo distingue
  // preguntando por el permiso, no por el resultado vacío.
  if (sinPersonal(error)) return []
  if (error) throw error

  return (data ?? []).map((c) => ({
    id: c.id,
    teacherId: c.teacher_id,
    modalidad: c.modalidad,
    monto: Number(c.monto),
    desde: c.desde,
    notas: c.notas ?? '',
  }))
}

/**
 * Una condición no se edita: se carga la que rige desde hoy. Corregir
 * una vieja cambiaría liquidaciones ya pagadas, y por eso la base
 * tampoco tiene política de update.
 */
export async function fijarCondicion(input: {
  teacherId: string
  modalidad: CondicionPago['modalidad']
  monto: number
  desde: string
  notas?: string
}): Promise<void> {
  const { error } = await supabase.from('teacher_pay').insert({
    teacher_id: input.teacherId,
    modalidad: input.modalidad,
    monto: input.monto,
    desde: input.desde,
    notas: input.notas ?? '',
  })
  if (sinPersonal(error)) throw new Error(FALTA)
  if (error?.code === '23505') {
    throw new Error('Ya hay una condición de esa modalidad que arranca ese día.')
  }
  if (error) throw new Error(error.message || 'No se pudo guardar la condición')
}

// ── Horas que no son clases ─────────────────────────────────────────

export async function fetchHoras(desde: string, hasta: string): Promise<HorasTrabajadas[]> {
  const { data, error } = await supabase
    .from('staff_work_logs')
    .select('*')
    .gte('fecha', desde)
    .lte('fecha', hasta)
    .order('fecha', { ascending: false })
  if (sinPersonal(error)) return []
  if (error) throw error

  return (data ?? []).map((h) => ({
    id: h.id,
    teacherId: h.teacher_id,
    fecha: h.fecha,
    tipo: h.tipo,
    horas: Number(h.horas),
    detalle: h.detalle ?? '',
  }))
}

// ---------------------------------------------------------------
// Ajustes manuales (0065, requerimiento 12.6)
// ---------------------------------------------------------------

export async function fetchAjustes(desde: string, hasta: string): Promise<AjusteLiquidacion[]> {
  const { data, error } = await supabase
    .from('teacher_adjustments')
    .select('*')
    .gte('fecha', desde)
    .lte('fecha', hasta)
    .order('fecha', { ascending: false })
  // Sin la 0065 la tabla no existe, y la pantalla tiene que abrir igual.
  if (sinPersonal(error)) return []
  if (error) throw error

  return (data ?? []).map((a) => ({
    id: a.id,
    teacherId: a.teacher_id,
    fecha: a.fecha,
    monto: Number(a.monto),
    motivo: a.motivo ?? '',
  }))
}

export async function cargarAjuste(input: {
  teacherId: string
  fecha: string
  monto: number
  motivo: string
}): Promise<void> {
  const { error } = await supabase.from('teacher_adjustments').insert({
    teacher_id: input.teacherId,
    fecha: input.fecha,
    monto: input.monto,
    motivo: input.motivo.trim(),
  })
  // Los rechazos con texto propio son los que importan: el período ya
  // liquidado lo explica la base, y es lo que hay que mostrar.
  if (error) throw new Error(error.message || 'No se pudo cargar el ajuste')
}

export async function borrarAjuste(id: string): Promise<void> {
  // Se cuentan las filas: un delete que la política rechaza devuelve
  // `error: null` y no borra nada.
  const { data, error } = await supabase
    .from('teacher_adjustments')
    .delete()
    .eq('id', id)
    .select('id')
  if (error) throw new Error(error.message || 'No se pudo borrar el ajuste')
  if ((data ?? []).length === 0) {
    throw new Error('No se borró el ajuste: puede que el período ya esté liquidado.')
  }
}

export async function cargarHoras(input: {
  teacherId: string
  fecha: string
  tipo: HorasTrabajadas['tipo']
  horas: number
  detalle?: string
}): Promise<void> {
  const { error } = await supabase.from('staff_work_logs').insert({
    teacher_id: input.teacherId,
    fecha: input.fecha,
    tipo: input.tipo,
    // Una ausencia no tiene horas, aunque quien carga escriba un número.
    horas: input.tipo === 'ausencia' ? 0 : input.horas,
    detalle: input.detalle ?? '',
  })
  if (sinPersonal(error)) throw new Error(FALTA)
  if (error) throw new Error(error.message || 'No se pudieron cargar las horas')
}

export async function borrarHoras(id: string): Promise<void> {
  // Se cuentan las filas: un delete que la política rechaza devuelve
  // `error: null` y no borra nada.
  const { data, error } = await supabase
    .from('staff_work_logs')
    .delete()
    .eq('id', id)
    .select('id')
  if (error) throw new Error(error.message || 'No se pudo borrar')
  if (!data || data.length === 0) throw new Error('No tenés permiso para borrar horas.')
}

// ── La liquidación ──────────────────────────────────────────────────

/**
 * Se deriva entera en la base: las clases dictadas salen de la agenda
 * —con la profesora del día y sin las suspendidas— y cada una se paga
 * con la tarifa que regía ESE día, no con la de hoy.
 */
export async function fetchLiquidacion(
  desde: string,
  hasta: string
): Promise<FilaLiquidacion[]> {
  const { data, error } = await supabase.rpc('liquidacion', {
    p_desde: desde,
    p_hasta: hasta,
  })
  if (sinPersonal(error)) throw new Error(FALTA)
  if (error) throw error

  return (data ?? []).map((f: Record<string, unknown>) => ({
    teacherId: String(f.teacher_id),
    profesora: String(f.profesora ?? '—'),
    clases: Number(f.clases ?? 0),
    montoClases: Number(f.monto_clases ?? 0),
    horas: Number(f.horas ?? 0),
    montoHoras: Number(f.monto_horas ?? 0),
    mensual: Number(f.mensual ?? 0),
    // 0 mientras la 0065 no haya corrido: la columna no viene.
    ajustes: Number(f.ajustes ?? 0),
    ausencias: Number(f.ausencias ?? 0),
    tardanzas: Number(f.tardanzas ?? 0),
    total: Number(f.total ?? 0),
  }))
}

// ── Cerrar y saldar (0054) ──────────────────────────────────────────
//
// El cálculo se deriva; el cierre se guarda. No se contradicen: mientras
// el período está abierto el total tiene que moverse solo, y el día que
// se cierra se congela, porque la plata que ya salió no puede cambiar
// para atrás.

export async function fetchLiquidacionesCerradas(
  desde: string,
  hasta: string
): Promise<LiquidacionCerrada[]> {
  const { data, error } = await supabase.rpc('liquidaciones_cerradas', {
    p_desde: desde,
    p_hasta: hasta,
  })
  // Sin la 0054 no hay cierres, y la pantalla tiene que abrir igual.
  if (sinPersonal(error)) return []
  if (error) throw error

  return (data ?? []).map((f: Record<string, unknown>) => ({
    id: String(f.id),
    teacherId: String(f.teacher_id),
    profesora: String(f.profesora ?? '—'),
    desde: String(f.desde),
    hasta: String(f.hasta),
    clases: Number(f.clases ?? 0),
    horas: Number(f.horas ?? 0),
    ajustes: Number(f.ajustes ?? 0),
    total: Number(f.total ?? 0),
    totalHoy: Number(f.total_hoy ?? 0),
    estado: f.estado as LiquidacionCerrada['estado'],
    expenseId: (f.expense_id as string | null) ?? null,
    notas: String(f.notas ?? ''),
    voidReason: (f.void_reason as string | null) ?? null,
    createdAt: String(f.created_at),
  }))
}

export async function cerrarLiquidacion(
  teacherId: string,
  desde: string,
  hasta: string,
  notas = ''
): Promise<void> {
  // El total NO viaja desde acá: lo calcula la base con la misma función
  // que muestra la pantalla. Mandarlo sería dejar cerrar por el número
  // que uno quiera.
  const { error } = await supabase.rpc('cerrar_liquidacion', {
    p_teacher: teacherId,
    p_desde: desde,
    p_hasta: hasta,
    p_notas: notas,
  })
  if (sinPersonal(error)) throw new Error('Para cerrar liquidaciones falta correr la migración 0054.')
  if (error?.code === '23505') {
    throw new Error('Ese período ya está cerrado para esa persona.')
  }
  if (error) throw new Error(error.message || 'No se pudo cerrar la liquidación')
}

/** Crea el gasto y marca la liquidación: las dos cosas o ninguna. */
export async function pagarLiquidacion(
  id: string,
  method: string,
  accountId: string,
  fecha?: string
): Promise<void> {
  const { error } = await supabase.rpc('pagar_liquidacion', {
    p_id: id,
    p_method: method,
    p_account: accountId,
    p_fecha: fecha ?? null,
  })
  if (sinPersonal(error)) throw new Error('Para pagar liquidaciones falta correr la migración 0054.')
  if (error) throw new Error(error.message || 'No se pudo pagar la liquidación')
}

export async function anularLiquidacion(id: string, motivo: string): Promise<void> {
  const { error } = await supabase.rpc('anular_liquidacion', { p_id: id, p_motivo: motivo })
  if (error) throw new Error(error.message || 'No se pudo anular')
}

/**
 * Dónde terminó el último cierre de cada una (0055).
 *
 * Para que la pantalla proponga el período siguiente en vez de que haya
 * que acordarse. Las que nunca se liquidaron no aparecen: no hay desde
 * dónde proponer, y adivinar una fecha sería peor que no decir nada.
 */
export async function fetchUltimosCierres(): Promise<Map<string, string>> {
  const { data, error } = await supabase.rpc('ultimos_cierres')
  if (sinPersonal(error)) return new Map()
  if (error) throw error
  return new Map(
    (data ?? []).map((f: Record<string, unknown>) => [String(f.teacher_id), String(f.hasta)])
  )
}

/**
 * El cierre de mes: todas las del período de una.
 *
 * Las que chocan se saltean en vez de cortar el proceso, y se devuelven
 * para que la pantalla las muestre: que a una le falte corregir algo no
 * puede impedir cerrarle a las otras.
 */
export async function cerrarTodas(
  desde: string,
  hasta: string
): Promise<{ cerradas: number; salteadas: string[] }> {
  const { data, error } = await supabase.rpc('cerrar_liquidaciones', {
    p_desde: desde,
    p_hasta: hasta,
  })
  if (sinPersonal(error)) throw new Error('Para cerrar liquidaciones falta correr la migración 0055.')
  if (error) throw new Error(error.message || 'No se pudieron cerrar')

  const f = (Array.isArray(data) ? data[0] : data) as Record<string, unknown> | undefined
  return {
    cerradas: Number(f?.cerradas ?? 0),
    salteadas: (f?.salteadas as string[] | null) ?? [],
  }
}
