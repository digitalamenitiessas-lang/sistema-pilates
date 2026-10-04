'use client'

/**
 * Productos en consignación (0090): venderlos, llevar el stock y rendirle
 * al proveedor.
 *
 * Va en su propio archivo y NO en `fetchStudioData`, por lo mismo que
 * Personal: las ventas crecen todos los días y se miran por período, y el
 * resto del sistema no tiene por qué cargarlas.
 *
 * Todo lo que escribe va por funciones de la base (security definer) que
 * piden su permiso y deciden: el precio sale de la lista, el reparto del
 * % del proveedor, la cuenta del medio. Del navegador nunca viaja el
 * precio que se cobra ni el total; viaja, como control, el precio que vio
 * quien vende, para que la base corte si la lista cambió en el medio.
 *
 * Si la 0090 todavía no corrió, las lecturas tiran `FALTA` en vez de
 * devolver una lista vacía: "no hay productos" y "falta la migración" no
 * pueden verse igual.
 */

import { supabase } from './supabase'
import { errorDeLaBase } from './api'
import type {
  EstadoVenta,
  MovimientoStock,
  Producto,
  Proveedor,
  Rendicion,
  RendicionAnulada,
  RendicionRegistrada,
  VentaAnulada,
  VentaProducto,
  VentaRegistrada,
} from './types'

/** La 0090 todavía no corrió: la tabla o la función no existen. */
export function sinInventario(error: { code?: string } | null): boolean {
  return error?.code === '42P01' || error?.code === 'PGRST205' || error?.code === 'PGRST202'
}

export const FALTA = 'Para usar Productos falta correr la migración 0090.'

/** Lo que tira una lectura: FALTA si es la migración, el error de la base si no. */
function errorDeLectura(error: { code?: string; message?: string }, sino: string): Error {
  if (sinInventario(error)) return new Error(FALTA)
  return errorDeLaBase(error, sino)
}

/**
 * La llave de una venta. Un doble toque o un reintento por mala señal
 * manda la misma, y la base devuelve la venta ya hecha en vez de cobrar
 * dos veces. Nunca viaja nula: si el navegador no tiene `randomUUID`
 * (los viejos, y algunos embebidos), se arma igual con `getRandomValues`.
 */
export function nuevaLlave(): string {
  const c = globalThis.crypto
  if (c?.randomUUID) return c.randomUUID()
  const b = new Uint8Array(16)
  c.getRandomValues(b)
  b[6] = (b[6] & 0x0f) | 0x40 // versión 4
  b[8] = (b[8] & 0x3f) | 0x80 // variante RFC 4122
  const h = Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('')
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`
}

/** PostgREST corta en mil filas sin avisar: se pide de a mil, contando. */
async function paginado<T>(
  armar: (desde: number, hasta: number) => PromiseLike<{
    data: T[] | null
    error: { code?: string; message?: string } | null
    count: number | null
  }>,
  sino: string
): Promise<T[]> {
  const filas: T[] = []
  let total = Infinity
  while (filas.length < total) {
    const { data, error, count } = await armar(filas.length, filas.length + 999)
    if (error) throw errorDeLectura(error, sino)
    if (!data || data.length === 0) break
    filas.push(...data)
    total = count ?? filas.length
  }
  return filas
}

// ── Lecturas ────────────────────────────────────────────────────────

export async function fetchProductos(): Promise<Producto[]> {
  const { data, error } = await supabase
    .from('productos')
    .select('*, producto_precios(method, precio)')
    .order('sort_order')
    .order('nombre')
  if (error) throw errorDeLectura(error, 'No se pudieron leer los productos')
  return (data ?? []).map((p) => ({
    id: p.id,
    nombre: p.nombre,
    descripcion: p.descripcion ?? '',
    proveedorId: p.proveedor_id ?? null,
    stock: Number(p.stock ?? 0),
    stockAviso: Number(p.stock_aviso ?? 0),
    aromas: (p.aromas as string[] | null) ?? [],
    active: !!p.active,
    sortOrder: Number(p.sort_order ?? 100),
    precios: Object.fromEntries(
      ((p.producto_precios as Array<{ method: string; precio: number | string }> | null) ?? []).map(
        (x) => [x.method, Number(x.precio)]
      )
    ),
  }))
}

export async function fetchProveedores(): Promise<Proveedor[]> {
  const { data, error } = await supabase.from('proveedores').select('*').order('nombre')
  if (error) throw errorDeLectura(error, 'No se pudieron leer los proveedores')
  return (data ?? []).map((p) => ({
    id: p.id,
    nombre: p.nombre,
    contacto: p.contacto ?? '',
    notas: p.notas ?? '',
    pctEstudio: Number(p.pct_estudio),
    active: !!p.active,
  }))
}

function mapVenta(v: Record<string, unknown>): VentaProducto {
  return {
    id: String(v.id),
    numero: Number(v.numero),
    paidAt: String(v.paid_at),
    paidDate: String(v.paid_date),
    productoId: String(v.producto_id),
    productoNombre: String(v.producto_nombre ?? ''),
    proveedorId: String(v.proveedor_id),
    proveedorNombre: String(v.proveedor_nombre ?? ''),
    aroma: String(v.aroma ?? ''),
    cantidad: Number(v.cantidad),
    precioUnitario: Number(v.precio_unitario),
    monto: Number(v.amount),
    pctEstudio: Number(v.pct_estudio),
    parteEstudio: Number(v.parte_estudio),
    parteProveedor: Number(v.parte_proveedor),
    method: String(v.method),
    medio: String(v.medio ?? v.method),
    accountId: String(v.account_id),
    studentId: (v.student_id as string | null) ?? null,
    compradorNombre: String(v.comprador_nombre ?? ''),
    notas: String(v.notas ?? ''),
    vendidoPorNombre: String(v.vendido_por_nombre ?? ''),
    status: v.status === 'anulado' ? 'anulado' : 'pagado',
    voidReason: String(v.void_reason ?? ''),
    anuladoAt: (v.anulado_at as string | null) ?? null,
    rendicionId: (v.rendicion_id as string | null) ?? null,
    estado: v.estado as EstadoVenta,
  }
}

/** Las ventas del período, por día del estudio, las más nuevas primero. */
export async function fetchVentas(r: { desde: string; hasta: string }): Promise<VentaProducto[]> {
  const filas = await paginado<Record<string, unknown>>(
    (a, b) =>
      supabase
        .from('ventas_productos_estado')
        .select('*', { count: 'exact' })
        .gte('paid_date', r.desde)
        .lte('paid_date', r.hasta)
        .order('paid_at', { ascending: false })
        .order('numero', { ascending: false })
        .range(a, b),
    'No se pudieron leer las ventas'
  )
  return filas.map(mapVenta)
}

/** Lo que falta rendir, de todos los proveedores y de cualquier fecha. */
export async function fetchVentasARendir(): Promise<VentaProducto[]> {
  const filas = await paginado<Record<string, unknown>>(
    (a, b) =>
      supabase
        .from('ventas_productos_estado')
        .select('*', { count: 'exact' })
        .eq('status', 'pagado')
        .eq('estado', 'a_rendir')
        .order('paid_at')
        .order('numero')
        .range(a, b),
    'No se pudieron leer las ventas a rendir'
  )
  return filas.map(mapVenta)
}

/** Las compras de una ficha, para su historial. */
export async function fetchVentasDeCliente(studentId: string): Promise<VentaProducto[]> {
  const { data, error } = await supabase
    .from('ventas_productos_estado')
    .select('*')
    .eq('student_id', studentId)
    .order('paid_at', { ascending: false })
    .limit(200)
  if (error) throw errorDeLectura(error, 'No se pudieron leer las compras')
  return (data ?? []).map(mapVenta)
}

/** Sin tildes ni mayúsculas: "Cítrico" y "citrico" son el mismo aroma. */
function claveDeAroma(a: string): string {
  return a.normalize('NFD').replace(/[̀-ͯ]/g, '').trim().toLowerCase()
}

/**
 * Las sugerencias del campo aroma: primero la lista que cargó el admin en
 * el producto (es la que hay el primer día, sin ventas), después los
 * aromas ya vendidos de ese producto, por cuántas veces se vendieron.
 *
 * Se sugieren TAL CUAL están escritos: tocar un chip copia "Lavanda" y no
 * "lavanda", así la rendición al proveedor no sale partida en tres. La
 * lista del producto va entera; los vendidos completan hasta 8.
 */
export async function fetchAromas(producto: Producto): Promise<string[]> {
  const vistos = new Set(producto.aromas.map(claveDeAroma))
  const lista = [...producto.aromas]
  const { data, error } = await supabase
    .from('ventas_productos')
    .select('aroma')
    .eq('producto_id', producto.id)
    .eq('status', 'pagado')
    .order('paid_at', { ascending: false })
    .limit(500)
  // Las sugerencias son una ayuda: si no se pueden leer, el campo sigue.
  if (error || !data) return lista
  const veces = new Map<string, { texto: string; n: number }>()
  for (const { aroma } of data as Array<{ aroma: string }>) {
    const k = claveDeAroma(aroma)
    if (!k || vistos.has(k)) continue
    const previo = veces.get(k)
    if (previo) previo.n += 1
    else veces.set(k, { texto: aroma, n: 1 })
  }
  const vendidos = [...veces.values()].sort((a, b) => b.n - a.n).map((x) => x.texto)
  return [...lista, ...vendidos.slice(0, Math.max(0, 8 - lista.length))]
}

export async function fetchMovimientos(productoId?: string | null, limite = 60): Promise<MovimientoStock[]> {
  let q = supabase
    .from('stock_movimientos')
    .select('*')
    .order('at', { ascending: false })
    .limit(limite)
  if (productoId) q = q.eq('producto_id', productoId)
  const { data, error } = await q
  if (error) throw errorDeLectura(error, 'No se pudieron leer los movimientos de stock')
  return (data ?? []).map((m) => ({
    id: m.id,
    productoId: m.producto_id,
    at: m.at,
    tipo: m.tipo,
    cantidad: Number(m.cantidad),
    stockResultante: Number(m.stock_resultante),
    motivo: m.motivo ?? '',
    ventaId: m.venta_id ?? null,
    proveedorId: m.proveedor_id ?? null,
  }))
}

export async function fetchRendiciones(limite = 50): Promise<Rendicion[]> {
  const { data, error } = await supabase
    .from('rendiciones_estado')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(limite)
  if (error) throw errorDeLectura(error, 'No se pudieron leer los pagos a proveedores')
  return (data ?? []).map((r) => ({
    id: r.id,
    proveedorId: r.proveedor_id,
    proveedorNombre: r.proveedor_nombre ?? '',
    expenseId: r.expense_id,
    ventas: Number(r.ventas),
    cobrado: Number(r.cobrado),
    total: Number(r.total),
    desde: r.desde,
    hasta: r.hasta,
    method: r.method ?? null,
    accountId: r.account_id ?? null,
    notas: r.notas ?? '',
    createdAt: r.created_at,
    vigente: !!r.vigente,
    gastoMonto: r.gasto_monto === null || r.gasto_monto === undefined ? null : Number(r.gasto_monto),
  }))
}

// ── Acciones ────────────────────────────────────────────────────────

/** La primera fila de una función que devuelve `table (...)`. */
function primera(data: unknown): Record<string, unknown> {
  const f = Array.isArray(data) ? data[0] : data
  return (f ?? {}) as Record<string, unknown>
}

/**
 * Un error sin código no viene de la base: es que la respuesta no llegó
 * (se cortó la señal, se cayó la conexión). Lo que se pidió puede haberse
 * hecho igual, y mostrar el texto crudo ("TypeError: Failed to fetch")
 * invita a cerrar y repetir. Se dice qué pasó y qué hacer.
 */
const SIN_RESPUESTA =
  'No llegó la respuesta (¿se cortó la señal?) y no se sabe si quedó hecho. Antes de repetirlo, fijate en la lista si ya aparece.'

export const VENTA_SIN_RESPUESTA =
  'No llegó la respuesta (¿se cortó la señal?) y no se sabe si la venta quedó registrada. Volvé a tocar «Cobrar» cuando haya señal: si ya se había registrado, el sistema lo dice y no la cobra dos veces.'

function errorDeAccion(
  error: { code?: string; message?: string },
  sino: string,
  sinRespuesta: string = SIN_RESPUESTA
): Error {
  if (sinInventario(error)) return new Error(FALTA)
  if (!error.code) return new Error(sinRespuesta)
  return errorDeLaBase(error, sino)
}

export async function venderProducto(input: {
  productoId: string
  cantidad: number
  aroma: string
  method: string
  studentId?: string | null
  comprador?: string
  notas?: string
  /** La llave del intento: la misma en un reintento, otra en la venta siguiente */
  idem: string
  /**
   * El precio unitario que vio quien vende. No es la fuente del precio
   * (lo pone la base): es un control. Si el admin cambió la lista desde
   * otro lado mientras esta pantalla estaba abierta, la base corta en vez
   * de registrar un monto distinto del que se le cobró a quien compra.
   */
  precioEsperado: number
}): Promise<VentaRegistrada> {
  const { data, error } = await supabase.rpc('vender_producto', {
    p_producto: input.productoId,
    p_cantidad: input.cantidad,
    p_aroma: input.aroma,
    p_method: input.method,
    p_student: input.studentId ?? null,
    p_comprador: input.comprador ?? '',
    p_notas: input.notas ?? '',
    p_idem: input.idem,
    p_precio_esperado: input.precioEsperado,
  })
  if (error) throw errorDeAccion(error, 'No se pudo registrar la venta', VENTA_SIN_RESPUESTA)
  const f = primera(data)
  return {
    ventaId: String(f.venta_id),
    numero: Number(f.numero),
    cobrado: Number(f.cobrado),
    precioUnitario: Number(f.precio_unitario),
    cantidad: Number(f.cantidad),
    parteEstudio: Number(f.parte_estudio),
    parteProveedor: Number(f.parte_proveedor),
    medio: String(f.medio ?? ''),
    cuenta: String(f.cuenta ?? ''),
    stockRestante: Number(f.stock_restante),
    paidAt: String(f.paid_at),
    repetida: !!f.repetida,
  }
}

export async function anularVenta(ventaId: string, motivo: string): Promise<VentaAnulada> {
  const { data, error } = await supabase.rpc('anular_venta', { p_venta: ventaId, p_motivo: motivo })
  if (error) throw errorDeAccion(error, 'No se pudo anular la venta')
  const f = primera(data)
  return {
    ventaId: String(f.venta_id),
    numero: Number(f.numero),
    anulado: Number(f.anulado),
    devuelto: Number(f.devuelto),
    stockRestante: Number(f.stock_restante),
    turnoCerrado: !!f.turno_cerrado,
    cuenta: String(f.cuenta ?? ''),
  }
}

/**
 * Le paga al proveedor su parte de esas ventas: un gasto en "Rendiciones a
 * proveedores" y las ventas quedan rendidas, las dos cosas o ninguna. El
 * total lo calcula la base; si la lista cambió desde que se abrió la
 * pantalla, la base corta.
 */
export async function rendirProveedor(input: {
  proveedorId: string
  ventaIds: string[]
  method: string
  accountId: string | null
  notas?: string
}): Promise<RendicionRegistrada> {
  const { data, error } = await supabase.rpc('rendir_proveedor', {
    p_proveedor: input.proveedorId,
    p_ventas: input.ventaIds,
    p_method: input.method,
    p_account: input.accountId,
    p_fecha: null,
    p_notas: input.notas ?? '',
  })
  if (error) throw errorDeAccion(error, 'No se pudo registrar el pago al proveedor')
  const f = primera(data)
  return {
    rendicionId: String(f.rendicion_id),
    expenseId: String(f.expense_id),
    total: Number(f.total),
    ventas: Number(f.ventas),
    cobrado: Number(f.cobrado),
  }
}

/** Anula el gasto de una rendición: esas ventas vuelven solas a pendientes. */
export async function anularRendicion(rendicionId: string, motivo: string): Promise<RendicionAnulada> {
  const { data, error } = await supabase.rpc('anular_rendicion', {
    p_rendicion: rendicionId,
    p_motivo: motivo,
  })
  if (error) throw errorDeAccion(error, 'No se pudo anular el pago al proveedor')
  const f = primera(data)
  return {
    rendicionId: String(f.rendicion_id),
    expenseId: String(f.expense_id),
    ventas: Number(f.ventas),
    total: Number(f.total),
    turnoCerrado: !!f.turno_cerrado,
    cuenta: String(f.cuenta ?? ''),
  }
}

/**
 * ingreso: lo que trajo el proveedor. devolucion: lo que se lleva (en
 * positivo; la base lo resta). ajuste: con signo y con motivo.
 * Devuelve el stock que quedó.
 */
export async function moverStock(
  productoId: string,
  tipo: 'ingreso' | 'devolucion' | 'ajuste',
  cantidad: number,
  motivo: string
): Promise<number> {
  const { data, error } = await supabase.rpc('mover_stock', {
    p_producto: productoId,
    p_tipo: tipo,
    p_cantidad: cantidad,
    p_motivo: motivo,
  })
  if (error) throw errorDeAccion(error, 'No se pudo mover el stock')
  return Number(data)
}

/**
 * `precios`: por código de medio, un número lo crea o lo cambia y `null`
 * lo borra (ese medio deja de ofrecerse). Un código que no viene no se
 * toca. `aromas` sin pasar = no se tocan.
 */
export async function guardarProducto(input: {
  id: string | null
  nombre: string
  descripcion: string
  proveedorId: string | null
  activo: boolean
  stockAviso: number
  precios: Record<string, number | null>
  aromas?: string[]
}): Promise<string> {
  const { data, error } = await supabase.rpc('guardar_producto', {
    p_id: input.id,
    p_nombre: input.nombre,
    p_descripcion: input.descripcion,
    p_proveedor: input.proveedorId,
    p_activo: input.activo,
    p_stock_aviso: input.stockAviso,
    p_precios: input.precios,
    p_aromas: input.aromas ?? null,
  })
  if (error) throw errorDeAccion(error, 'No se pudo guardar el producto')
  return String(data)
}

export async function guardarProveedor(input: {
  id: string | null
  nombre: string
  contacto: string
  notas: string
  pctEstudio: number
  activo: boolean
}): Promise<string> {
  const { data, error } = await supabase.rpc('guardar_proveedor', {
    p_id: input.id,
    p_nombre: input.nombre,
    p_contacto: input.contacto,
    p_notas: input.notas,
    p_pct_estudio: input.pctEstudio,
    p_activo: input.activo,
  })
  if (error) throw errorDeAccion(error, 'No se pudo guardar el proveedor')
  return String(data)
}
