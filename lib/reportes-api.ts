// Consultas de los reportes.
//
// Todas por rango de fechas y contra la base, nunca filtrando en memoria
// el paquete del estudio: un reporte tiene que poder mirar años de
// historia sin traérsela entera al navegador.
//
// Cada consulta hereda las políticas de siempre, así que un rol sin ver
// información financiera recibe cero filas de los reportes de plata. La
// pantalla distingue eso de "no hubo movimientos".
import { supabase } from './supabase'

export interface Rango {
  desde: string
  hasta: string
}

/**
 * El cliente de Supabase tipa las relaciones como array o como objeto
 * según cómo infiera la unicidad. Esto devuelve el nombre en los dos
 * casos, sin repetir el mismo casteo en cada consulta.
 */
function nombreDe(rel: unknown): string {
  if (!rel) return ''
  const uno = Array.isArray(rel) ? rel[0] : rel
  return (uno as { name?: string } | undefined)?.name ?? ''
}


// ---------------------------------------------------------------
// Financieros
// ---------------------------------------------------------------
export interface FilaCobro {
  fecha: string
  alumna: string
  concepto: string
  medio: string
  cuenta: string
  comprobante: string
  monto: number
}

export async function reporteCobros(r: Rango): Promise<FilaCobro[]> {
  const { data, error } = await supabase
    .from('payments')
    .select('paid_date, concept, amount, method, receipt_number, students(name), accounts(name)')
    .eq('status', 'pagado')
    .gte('paid_date', r.desde)
    .lte('paid_date', r.hasta)
    .order('paid_date', { ascending: false })
  if (error) throw error
  return (data ?? []).map((p) => ({
    fecha: p.paid_date,
    alumna: nombreDe(p.students) || '—',
    concepto: p.concept || 'Cobro',
    medio: p.method ?? '',
    cuenta: nombreDe(p.accounts) || '',
    comprobante: p.receipt_number ? String(p.receipt_number).padStart(6, '0') : '',
    monto: Number(p.amount),
  }))
}

export interface FilaDeuda {
  alumna: string
  concepto: string
  vencimiento: string
  diasVencida: number
  monto: number
}

/** Lo que falta cobrar, con la antigüedad de cada deuda. */
export async function reporteDeudas(hasta: string): Promise<FilaDeuda[]> {
  const { data, error } = await supabase
    .from('payments')
    .select('due_date, concept, amount, students(name)')
    .eq('status', 'pendiente')
    .lte('due_date', hasta)
    .order('due_date')
  if (error) throw error
  const hoy = new Date(hasta + 'T12:00:00').getTime()
  return (data ?? []).map((p) => ({
    alumna: nombreDe(p.students) || '—',
    concepto: p.concept || 'Cuota',
    vencimiento: p.due_date,
    diasVencida: Math.max(
      0,
      Math.round((hoy - new Date(p.due_date + 'T12:00:00').getTime()) / 86400000)
    ),
    monto: Number(p.amount),
  }))
}

export interface FilaEgreso {
  fecha: string
  categoria: string
  detalle: string
  proveedor: string
  comprobante: string
  cuenta: string
  monto: number
}

export async function reporteEgresos(r: Rango): Promise<FilaEgreso[]> {
  const { data, error } = await supabase
    .from('expenses')
    .select('paid_date, fecha, detail, amount, supplier, doc_type, doc_number, expense_categories(name), accounts(name)')
    .eq('status', 'pagado')
    .gte('paid_date', r.desde)
    .lte('paid_date', r.hasta)
    .order('paid_date', { ascending: false })
  if (error) throw error
  return (data ?? []).map((g) => ({
    fecha: g.paid_date ?? g.fecha,
    categoria: nombreDe(g.expense_categories) || 'Sin categoría',
    detalle: g.detail ?? '',
    proveedor: g.supplier ?? '',
    comprobante: [g.doc_type, g.doc_number].filter((x) => x && x !== 'sin comprobante').join(' '),
    cuenta: nombreDe(g.accounts) || '',
    monto: Number(g.amount),
  }))
}

export interface FilaResultado {
  mes: string
  ingresos: number
  egresos: number
  neto: number
}

export async function reporteResultado(r: Rango): Promise<FilaResultado[]> {
  const { data, error } = await supabase
    .from('resultado_mensual')
    .select('*')
    .gte('mes', r.desde.slice(0, 7))
    .lte('mes', r.hasta.slice(0, 7))
    .order('mes', { ascending: false })
  if (error) throw error
  return (data ?? []).map((m) => ({
    mes: m.mes,
    ingresos: Number(m.ingresos),
    egresos: Number(m.egresos_pagados),
    neto: Number(m.neto),
  }))
}

export interface FilaMedio {
  medio: string
  cantidad: number
  monto: number
}

export async function reportePorMedio(r: Rango): Promise<FilaMedio[]> {
  const { data, error } = await supabase
    .from('cobros_por_medio')
    .select('*')
    .gte('dia', r.desde)
    .lte('dia', r.hasta)
  if (error) throw error
  const acum = new Map<string, FilaMedio>()
  for (const f of data ?? []) {
    const k = f.medio_nombre as string
    const prev = acum.get(k) ?? { medio: k, cantidad: 0, monto: 0 }
    prev.cantidad += Number(f.cantidad)
    prev.monto += Number(f.monto)
    acum.set(k, prev)
  }
  return [...acum.values()].sort((a, b) => b.monto - a.monto)
}

// ---------------------------------------------------------------
// Comerciales
// ---------------------------------------------------------------
export interface FilaAlta {
  fecha: string
  alumna: string
  email: string
  telefono: string
}

export async function reporteAltas(r: Rango): Promise<FilaAlta[]> {
  const { data, error } = await supabase
    .from('students')
    .select('name, email, phone, join_date')
    .gte('join_date', r.desde)
    .lte('join_date', r.hasta)
    .order('join_date', { ascending: false })
  if (error) throw error
  return (data ?? []).map((s) => ({
    fecha: s.join_date,
    alumna: s.name,
    email: s.email ?? '',
    telefono: s.phone ?? '',
  }))
}

export interface FilaMembresia {
  alumna: string
  plan: string
  desde: string
  hasta: string
  usadas: number
  total: number
  estado: string
}

/** Membresías que vencen en el período: para renovar y para recuperar. */
export async function reporteMembresias(r: Rango): Promise<FilaMembresia[]> {
  const { data, error } = await supabase
    .from('memberships')
    .select('start_date, end_date, classes_used, classes_total, status, students(name), plans(name)')
    .gte('end_date', r.desde)
    .lte('end_date', r.hasta)
    .order('end_date', { ascending: false })
  if (error) throw error
  const hoy = new Date().toLocaleDateString('en-CA', {
    timeZone: 'America/Argentina/Buenos_Aires',
  })
  return (data ?? []).map((m) => ({
    alumna: nombreDe(m.students) || '—',
    plan: nombreDe(m.plans) || '—',
    desde: m.start_date,
    hasta: m.end_date,
    usadas: m.classes_used,
    total: m.classes_total,
    estado:
      m.status === 'suspendida'
        ? 'suspendida'
        : m.end_date < hoy
          ? 'vencida'
          : 'vigente',
  }))
}

// ---------------------------------------------------------------
// Operativos
// ---------------------------------------------------------------
export interface FilaAsistencia {
  fecha: string
  clase: string
  profesora: string
  alumna: string
  estado: string
}

export async function reporteAsistencias(r: Rango): Promise<FilaAsistencia[]> {
  const { data, error } = await supabase
    .from('reservations')
    .select('date, status, students(name), class_sessions(title, teachers(name))')
    .gte('date', r.desde)
    .lte('date', r.hasta)
    .order('date', { ascending: false })
  if (error) throw error
  return (data ?? []).map((x) => {
    const rel = x.class_sessions
    const clase = (Array.isArray(rel) ? rel[0] : rel) as
      | { title?: string; teachers?: unknown }
      | undefined
    return {
      fecha: x.date,
      clase: clase?.title ?? '—',
      profesora: nombreDe(clase?.teachers) || '—',
      alumna: nombreDe(x.students) || '—',
      estado: x.status,
    }
  })
}

export interface FilaOcupacion {
  clase: string
  profesora: string
  cupo: number
  reservas: number
  asistencias: number
  ausencias: number
  ocupacion: number
}

/** Cuánto se llena cada clase y cuánta gente efectivamente va. */
export async function reporteOcupacion(r: Rango): Promise<FilaOcupacion[]> {
  const [reservas, clases] = await Promise.all([
    supabase
      .from('reservations')
      .select('class_id, status')
      .gte('date', r.desde)
      .lte('date', r.hasta),
    supabase
      .from('class_sessions')
      .select('id, title, capacity, teachers(name)')
      .eq('active', true),
  ])
  if (reservas.error) throw reservas.error
  if (clases.error) throw clases.error

  const porClase = new Map<string, { reservas: number; asistencias: number; ausencias: number }>()
  for (const x of reservas.data ?? []) {
    const p = porClase.get(x.class_id) ?? { reservas: 0, asistencias: 0, ausencias: 0 }
    if (x.status !== 'cancelada') p.reservas += 1
    if (x.status === 'asistió') p.asistencias += 1
    if (x.status === 'ausente') p.ausencias += 1
    porClase.set(x.class_id, p)
  }

  return (clases.data ?? [])
    .map((c) => {
      const p = porClase.get(c.id) ?? { reservas: 0, asistencias: 0, ausencias: 0 }
      return {
        clase: c.title,
        profesora: nombreDe(c.teachers) || '—',
        cupo: c.capacity,
        reservas: p.reservas,
        asistencias: p.asistencias,
        ausencias: p.ausencias,
        // Sobre el cupo de la clase, no sobre el total de reservas: es lo
        // que dice si conviene abrir otro horario o cerrar este.
        ocupacion: c.capacity ? Math.round((p.reservas / c.capacity) * 100) : 0,
      }
    })
    .sort((a, b) => b.reservas - a.reservas)
}
