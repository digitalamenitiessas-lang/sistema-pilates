// Consultas y acciones de caja, cuentas y gastos (migración 0020).
//
// Archivo aparte de lib/api.ts a propósito: nada de esto entra en
// fetchStudioData. El libro, los gastos y los movimientos crecen todos los
// días y se consultan por rango desde su propia pantalla, no filtrando en
// memoria un paquete que se trae entero.
import { supabase } from './supabase'
import type {
  Account,
  AccountBalance,
  AccountMovement,
  CashSession,
  Expense,
  ExpenseCategory,
  LedgerEntry,
  MovementKind,
} from './types'

// ---------------------------------------------------------------
// Cuentas y saldos
// ---------------------------------------------------------------
export async function fetchAccounts(incluirInactivas = false): Promise<Account[]> {
  let q = supabase.from('accounts').select('*').order('sort_order')
  if (!incluirInactivas) q = q.eq('active', true)
  const { data, error } = await q
  if (error) throw error
  return (data ?? []).map((a) => ({
    id: a.id,
    name: a.name,
    kind: a.kind,
    arquea: a.arquea,
    isSystem: a.is_system,
    active: a.active,
    sortOrder: a.sort_order,
    bankName: a.bank_name ?? '',
    cbu: a.cbu ?? '',
    alias: a.alias ?? '',
    holder: a.holder ?? '',
    notes: a.notes ?? '',
  }))
}

export async function fetchBalances(): Promise<AccountBalance[]> {
  const { data, error } = await supabase
    .from('account_balances')
    .select('*')
    .order('sort_order')
  if (error) throw error
  return (data ?? []).map((b) => ({
    accountId: b.account_id,
    name: b.name,
    kind: b.kind,
    arquea: b.arquea,
    isSystem: b.is_system,
    saldo: Number(b.saldo),
    ultimoMovimiento: b.ultimo_movimiento,
    movimientos: Number(b.movimientos),
    veCobros: b.ve_cobros,
    veGastos: b.ve_gastos,
  }))
}

export interface AccountInput {
  name: string
  kind: Account['kind']
  arquea: boolean
  bankName?: string
  cbu?: string
  alias?: string
  holder?: string
  notes?: string
}

export async function createAccount(input: AccountInput): Promise<void> {
  const { error } = await supabase.from('accounts').insert({
    name: input.name.trim(),
    kind: input.kind,
    arquea: input.arquea,
    bank_name: input.bankName ?? '',
    cbu: input.cbu ?? '',
    alias: input.alias ?? '',
    holder: input.holder ?? '',
    notes: input.notes ?? '',
    sort_order: 50,
  })
  if (error) throw error
}

export async function updateAccount(id: string, input: AccountInput): Promise<void> {
  const { error } = await supabase
    .from('accounts')
    .update({
      name: input.name.trim(),
      kind: input.kind,
      arquea: input.arquea,
      bank_name: input.bankName ?? '',
      cbu: input.cbu ?? '',
      alias: input.alias ?? '',
      holder: input.holder ?? '',
      notes: input.notes ?? '',
    })
    .eq('id', id)
  if (error) throw error
}

export async function deactivateAccount(id: string): Promise<void> {
  const { error } = await supabase.from('accounts').update({ active: false }).eq('id', id)
  if (error) throw error
}

/** A qué cuenta va cada medio de pago. */
export async function setMethodAccount(code: string, accountId: string | null): Promise<void> {
  const { error } = await supabase
    .from('payment_methods')
    .update({ default_account_id: accountId })
    .eq('code', code)
  if (error) throw error
}

export async function fetchMethodAccounts(): Promise<Record<string, string | null>> {
  const { data, error } = await supabase
    .from('payment_methods')
    .select('code, default_account_id')
  if (error) throw error
  return Object.fromEntries((data ?? []).map((m) => [m.code, m.default_account_id]))
}

// ---------------------------------------------------------------
// El libro
// ---------------------------------------------------------------
export interface LedgerFilters {
  desde: string
  hasta: string
  accountId?: string | null
  origen?: LedgerEntry['origen'] | null
}

/** Siempre por rango: el libro crece todos los días. */
export async function fetchLedger(f: LedgerFilters): Promise<LedgerEntry[]> {
  let q = supabase
    .from('account_ledger')
    .select('*')
    .gte('dia', f.desde)
    .lte('dia', f.hasta)
    .order('at', { ascending: false })
  if (f.accountId) q = q.eq('account_id', f.accountId)
  if (f.origen) q = q.eq('origen', f.origen)
  const { data, error } = await q
  if (error) throw error
  return (data ?? []).map((l) => ({
    origen: l.origen,
    refId: l.ref_id,
    accountId: l.account_id,
    at: l.at,
    dia: l.dia,
    sentido: l.sentido,
    monto: Number(l.monto),
    concepto: l.concepto ?? '',
    medio: l.medio,
    contraparte: l.contraparte,
    comprobante: l.comprobante,
  }))
}

/** Ingresos, egresos y neto de una cuenta en un día. */
export async function fetchDia(
  accountId: string,
  dia: string
): Promise<{ ingresos: number; egresos: number; neto: number; movimientos: number } | null> {
  const { data, error } = await supabase
    .from('caja_dia')
    .select('*')
    .eq('account_id', accountId)
    .eq('dia', dia)
    .maybeSingle()
  if (error) throw error
  if (!data) return { ingresos: 0, egresos: 0, neto: 0, movimientos: 0 }
  return {
    ingresos: Number(data.ingresos),
    egresos: Number(data.egresos),
    neto: Number(data.neto),
    movimientos: Number(data.movimientos),
  }
}

// ---------------------------------------------------------------
// Abrir, cerrar y reabrir
// ---------------------------------------------------------------
function mapSession(s: Record<string, unknown>): CashSession {
  return {
    id: s.id as string,
    accountId: s.account_id as string,
    fecha: s.fecha as string,
    desde: s.desde as string,
    hasta: (s.hasta as string) ?? null,
    openedAt: s.opened_at as string,
    openedBy: (s.opened_by as string) ?? null,
    closedAt: (s.closed_at as string) ?? null,
    closedBy: (s.closed_by as string) ?? null,
    saldoInicial: Number(s.saldo_inicial ?? 0),
    ingresos: Number(s.ingresos ?? 0),
    egresos: Number(s.egresos ?? 0),
    saldoEsperado: Number(s.saldo_esperado ?? 0),
    saldoReal: s.saldo_real === null || s.saldo_real === undefined ? null : Number(s.saldo_real),
    diferencia: s.diferencia === null || s.diferencia === undefined ? null : Number(s.diferencia),
    totalesPorMedio: (s.totales_por_medio as Record<string, number>) ?? {},
    notas: (s.notas as string) ?? '',
  }
}

/** El turno abierto de una caja, si hay alguno. */
export async function fetchOpenSession(accountId: string): Promise<CashSession | null> {
  const { data, error } = await supabase
    .from('cash_sessions')
    .select('*')
    .eq('account_id', accountId)
    .is('closed_at', null)
    .order('opened_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (error) throw error
  return data ? mapSession(data) : null
}

export async function fetchSessions(accountId?: string | null, limite = 30): Promise<CashSession[]> {
  let q = supabase
    .from('cash_sessions')
    .select('*')
    .not('closed_at', 'is', null)
    .order('closed_at', { ascending: false })
    .limit(limite)
  if (accountId) q = q.eq('account_id', accountId)
  const { data, error } = await q
  if (error) throw error
  return (data ?? []).map(mapSession)
}

export async function abrirCaja(accountId: string): Promise<CashSession> {
  const { data, error } = await supabase.rpc('abrir_caja', { p_account: accountId })
  if (error) throw error
  return mapSession(data)
}

/** El único dato que pide el cierre: cuánto se contó. */
export async function cerrarCaja(
  accountId: string,
  saldoReal: number,
  notas = ''
): Promise<CashSession> {
  const { data, error } = await supabase.rpc('cerrar_caja', {
    p_account: accountId,
    p_saldo_real: saldoReal,
    p_notas: notas,
  })
  if (error) throw error
  return mapSession(data)
}

export async function reabrirCaja(sessionId: string): Promise<void> {
  const { error } = await supabase.rpc('reabrir_caja', { p_session: sessionId })
  if (error) throw error
}

// ---------------------------------------------------------------
// Movimientos manuales
// ---------------------------------------------------------------
export interface MovementInput {
  kind: MovementKind
  fromAccountId: string | null
  toAccountId: string | null
  amount: number
  concept: string
  dia: string
  notes?: string
}

export async function createMovement(input: MovementInput): Promise<void> {
  const { error } = await supabase.from('account_movements').insert({
    kind: input.kind,
    from_account_id: input.fromAccountId,
    to_account_id: input.toAccountId,
    amount: input.amount,
    concept: input.concept.trim(),
    dia: input.dia,
    at: new Date(`${input.dia}T12:00:00`).toISOString(),
    notes: input.notes ?? '',
  })
  if (error) throw error
}

/** No se borra: se anula y queda el registro. */
export async function voidMovement(id: string): Promise<void> {
  const { error } = await supabase
    .from('account_movements')
    .update({ status: 'anulado' })
    .eq('id', id)
  if (error) throw error
}

// ---------------------------------------------------------------
// Gastos
// ---------------------------------------------------------------
export async function fetchExpenseCategories(): Promise<ExpenseCategory[]> {
  const { data, error } = await supabase
    .from('expense_categories')
    .select('*')
    .order('sort_order')
    .order('name')
  if (error) throw error
  return (data ?? []).map((c) => ({
    id: c.id,
    name: c.name,
    parentId: c.parent_id,
    nature: c.nature,
    active: c.active,
    sortOrder: c.sort_order,
  }))
}

export interface ExpenseFilters {
  desde: string
  hasta: string
  categoryId?: string | null
  supplier?: string | null
  method?: string | null
  accountId?: string | null
  tag?: string | null
  status?: Expense['status'] | null
}

export async function fetchExpenses(f: ExpenseFilters): Promise<Expense[]> {
  let q = supabase
    .from('expenses')
    .select('*, expense_categories(name)')
    .gte('fecha', f.desde)
    .lte('fecha', f.hasta)
    .order('fecha', { ascending: false })
  if (f.categoryId) q = q.eq('category_id', f.categoryId)
  if (f.supplier) q = q.ilike('supplier', `%${f.supplier}%`)
  if (f.method) q = q.eq('method', f.method)
  if (f.accountId) q = q.eq('account_id', f.accountId)
  if (f.status) q = q.eq('status', f.status)
  if (f.tag) q = q.contains('tags', [f.tag])
  const { data, error } = await q
  if (error) throw error
  return (data ?? []).map((g) => ({
    id: g.id,
    fecha: g.fecha,
    categoryId: g.category_id,
    categoryName: (g.expense_categories as { name: string } | null)?.name ?? '',
    detail: g.detail ?? '',
    amount: Number(g.amount),
    supplier: g.supplier ?? '',
    docType: g.doc_type ?? 'sin comprobante',
    docNumber: g.doc_number ?? '',
    method: g.method,
    accountId: g.account_id,
    paidAt: g.paid_at,
    paidDate: g.paid_date,
    status: g.status,
    tags: g.tags ?? [],
    notes: g.notes ?? '',
    voidReason: g.void_reason ?? '',
  }))
}

export interface ExpenseInput {
  fecha: string
  categoryId: string | null
  detail: string
  amount: number
  supplier: string
  docType: Expense['docType']
  docNumber: string
  method: string | null
  accountId: string | null
  status: Expense['status']
  paidDate: string | null
  tags: string[]
  notes: string
}

function expenseRow(input: ExpenseInput) {
  return {
    fecha: input.fecha,
    category_id: input.categoryId,
    detail: input.detail.trim(),
    amount: input.amount,
    supplier: input.supplier.trim(),
    doc_type: input.docType || 'sin comprobante',
    doc_number: input.docNumber.trim(),
    method: input.method,
    account_id: input.accountId,
    status: input.status,
    // El instante del pago manda: el día se deriva de ahí, igual que en
    // los cobros (migración 0016).
    paid_at:
      input.status === 'pagado'
        ? new Date(`${input.paidDate ?? input.fecha}T12:00:00`).toISOString()
        : null,
    tags: input.tags,
    notes: input.notes.trim(),
  }
}

export async function createExpense(input: ExpenseInput): Promise<void> {
  const { error } = await supabase.from('expenses').insert(expenseRow(input))
  if (error) throw error
}

export async function updateExpense(id: string, input: ExpenseInput): Promise<void> {
  const { error } = await supabase.from('expenses').update(expenseRow(input)).eq('id', id)
  if (error) throw error
}

/** Pagar un gasto que estaba pendiente. */
export async function payExpense(
  id: string,
  accountId: string,
  method: string,
  dia: string
): Promise<void> {
  const { error } = await supabase
    .from('expenses')
    .update({
      status: 'pagado',
      account_id: accountId,
      method,
      paid_at: new Date(`${dia}T12:00:00`).toISOString(),
    })
    .eq('id', id)
  if (error) throw error
}

/** No se borra: se anula con su motivo. */
export async function voidExpense(id: string, motivo: string): Promise<void> {
  const { error } = await supabase
    .from('expenses')
    .update({ status: 'anulado', void_reason: motivo.trim() })
    .eq('id', id)
  if (error) throw error
}

export async function createExpenseCategory(
  name: string,
  parentId: string | null,
  nature: 'fijo' | 'variable'
): Promise<void> {
  const { error } = await supabase
    .from('expense_categories')
    .insert({ name: name.trim(), parent_id: parentId, nature })
  if (error) throw error
}

export async function updateExpenseCategory(id: string, name: string): Promise<void> {
  const { error } = await supabase
    .from('expense_categories')
    .update({ name: name.trim() })
    .eq('id', id)
  if (error) throw error
}

export async function deactivateExpenseCategory(id: string): Promise<void> {
  const { error } = await supabase.from('expense_categories').update({ active: false }).eq('id', id)
  if (error) throw error
}

// ---------------------------------------------------------------
// Control
// ---------------------------------------------------------------
export interface CajaProblema {
  problema: string
  cuenta: string
  referencia: string
  monto: number
}

/** Las cuatro cosas que no deberían pasar nunca. Vacío = todo cierra. */
export async function fetchCajaControl(): Promise<CajaProblema[]> {
  const { data, error } = await supabase.rpc('caja_control')
  if (error) throw error
  return (data ?? []).map((p: Record<string, unknown>) => ({
    problema: p.problema as string,
    cuenta: (p.cuenta as string) ?? '',
    referencia: (p.referencia as string) ?? '',
    monto: Number(p.monto ?? 0),
  }))
}

// ---------------------------------------------------------------
// El bloque de plata del tablero
// ---------------------------------------------------------------
export interface ResumenPlata {
  egresosHoy: number
  egresosMes: number
  ingresosMes: number
  /** Ingresos menos egresos, según cómo lo defina el estudio */
  neto: number
  saldos: AccountBalance[]
  /** false si al rol le falta ver cobros o gastos: el neto quedaría corto */
  completo: boolean
}

/**
 * Un solo viaje para todo el bloque. Si al rol le falta una de las dos
 * mitades, `completo` viene en false y la pantalla lo dice en vez de
 * mostrar un neto que no incluye lo que no puede ver.
 */
export async function fetchResumenPlata(base: 'cobrado' | 'devengado'): Promise<ResumenPlata> {
  const hoy = new Date().toLocaleDateString('en-CA', {
    timeZone: 'America/Argentina/Buenos_Aires',
  })
  const mes = hoy.slice(0, 7)

  const [resMes, gastosHoy, saldos] = await Promise.all([
    supabase.from('resultado_mensual').select('*').eq('mes', mes).maybeSingle(),
    supabase.from('expenses').select('amount').eq('status', 'pagado').eq('paid_date', hoy),
    fetchBalances(),
  ])

  const fila = resMes.data
  const egresosMes = Number(
    (base === 'devengado' ? fila?.egresos_devengados : fila?.egresos_pagados) ?? 0
  )
  const ingresosMes = Number(fila?.ingresos ?? 0)

  return {
    egresosHoy: (gastosHoy.data ?? []).reduce((a, g) => a + Number(g.amount), 0),
    egresosMes,
    ingresosMes,
    neto: ingresosMes - egresosMes,
    saldos,
    completo: (fila?.ve_ingresos ?? true) && (fila?.ve_egresos ?? true),
  }
}
