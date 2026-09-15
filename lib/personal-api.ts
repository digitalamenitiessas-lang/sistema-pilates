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
import type { CondicionPago, HorasTrabajadas, FilaLiquidacion } from './types'

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
    ausencias: Number(f.ausencias ?? 0),
    tardanzas: Number(f.tardanzas ?? 0),
    total: Number(f.total ?? 0),
  }))
}
