import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/mp-server'

// Auto-registro del portal del alumno. Endpoint público a propósito, pero
// SOLO crea la cuenta si email + DNI coinciden con una ficha activa y sin
// acceso: los signups públicos de Supabase siguen deshabilitados y nadie
// puede registrarse sin estar cargado antes por el estudio. El trigger de
// la base (0006) garantiza que la cuenta nazca con rol alumno.
//
// LO QUE ESTA PUERTA ES, DICHO SIN ADORNO (16/09)
//
// Email + DNI son las credenciales. No hay confirmación por correo: la
// cuenta nace con `email_confirm: true` y con la contraseña que el que
// entra elija. O sea que quien conozca esos dos datos de una clienta
// —y el DNI no es un secreto— se queda con su portal: pagos, deuda,
// lesiones, embarazo, medicación.
//
// Lo que arreglaría eso de raíz es confirmar el mail, y para eso hace
// falta Resend con el dominio verificado. Mientras tanto la puerta tiene
// un interruptor y **nace apagada**: el acceso lo crea el mostrador
// desde la ficha, que es lo que ya hace.

/**
 * El interruptor vive en studio_settings (0057) y lo edita el estudio
 * desde Configuración. La clave `portal.autoregistro` de la 0012 no
 * servía: es tipo 'servicio' con `legacy_roles = '{}'`, así que `can()`
 * le contesta false a todos y nunca pudo apagar nada.
 *
 * Falla cerrado, a propósito: si la fila no está —la migración no corrió—
 * o la consulta no vuelve, el auto-registro NO funciona. Para una puerta,
 * el default seguro es la que no se abre; el mostrador sigue teniendo su
 * camino desde la ficha, así que nadie queda sin acceso por esto.
 */
async function autoregistroEncendido(
  admin: NonNullable<ReturnType<typeof supabaseAdmin>>
): Promise<boolean> {
  try {
    const { data, error } = await admin
      .from('studio_settings')
      .select('value')
      .eq('key', 'portal_autoregistro')
      .maybeSingle()
    if (error) return false
    return data?.value?.trim() === 'true'
  } catch {
    return false
  }
}

/**
 * Freno de intentos por IP. Es en memoria y por instancia, así que en
 * serverless no es una garantía: con suficientes instancias el atacante
 * tiene más intentos que los que dice el número. No está para hacer
 * imposible la fuerza bruta sobre el DNI, está para que salga caro
 * probar los 8 dígitos desde un script, que sin esto es gratis.
 *
 * El freno de verdad es el interruptor de arriba.
 */
const VENTANA_MS = 15 * 60 * 1000
const INTENTOS_MAX = 5
const intentos = new Map<string, { n: number; desde: number }>()

function demasiadosIntentos(ip: string): boolean {
  const ahora = Date.now()
  const previo = intentos.get(ip)
  if (!previo || ahora - previo.desde > VENTANA_MS) {
    intentos.set(ip, { n: 1, desde: ahora })
    // Limpieza oportunista: sin esto el Map crece para siempre.
    if (intentos.size > 500) {
      for (const [k, v] of intentos) if (ahora - v.desde > VENTANA_MS) intentos.delete(k)
    }
    return false
  }
  previo.n += 1
  return previo.n > INTENTOS_MAX
}

const soloDigitos = (s: string) => String(s).replace(/\D/g, '')

export async function POST(request: Request) {
  const admin = supabaseAdmin()
  if (!admin) {
    return NextResponse.json({ error: 'Registro no disponible por el momento' }, { status: 501 })
  }

  if (!(await autoregistroEncendido(admin))) {
    return NextResponse.json(
      { error: 'El estudio crea los accesos. Pedí el tuyo en recepción y te lo generan al toque.' },
      { status: 403 }
    )
  }

  const ip =
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    request.headers.get('x-real-ip') ||
    'sin-ip'
  if (demasiadosIntentos(ip)) {
    return NextResponse.json(
      { error: 'Demasiados intentos. Esperá un rato o consultá en recepción.' },
      { status: 429 }
    )
  }

  const { email, dni, password } = await request.json().catch(() => ({}))
  if (!email || !dni || !password) {
    return NextResponse.json({ error: 'Completá email, DNI y contraseña' }, { status: 400 })
  }
  if (String(password).length < 6) {
    return NextResponse.json({ error: 'La contraseña debe tener al menos 6 caracteres' }, { status: 400 })
  }

  const cleanEmail = String(email).trim().toLowerCase()
  const cleanDni = soloDigitos(dni)
  if (!cleanDni) {
    return NextResponse.json({ error: 'Ingresá tu DNI (solo números)' }, { status: 400 })
  }

  // Las fichas activas con email, y la comparación de los DOS datos acá.
  //
  // Antes esto filtraba con `.ilike('email', cleanEmail)`, y en LIKE el
  // guión bajo vale por "cualquier carácter" —además del %—. Los dos son
  // válidos en un email, así que el candado del email no era una
  // igualdad: `m_ria@gmail.com` matcheaba la ficha de `maria@gmail.com`,
  // y con el DNI correcto la cuenta se creaba igual. PostgREST no expone
  // el ESCAPE de LIKE, así que el filtro sale de SQL y la igualdad se
  // hace en JS, donde no hay comodines.
  //
  // Trae todas las fichas con email en vez de una: son doce hoy y unos
  // cientos en el peor caso, nunca sale del servidor, y es el precio de
  // que la comparación sea una igualdad de verdad.
  const { data: fichas, error: queryError } = await admin
    .from('students')
    .select('id, name, email, dni, user_id')
    .eq('active', true)
    .not('email', 'is', null)
  if (queryError) {
    return NextResponse.json({ error: 'No se pudo verificar la ficha' }, { status: 500 })
  }

  const student = (fichas ?? []).find(
    (s) =>
      String(s.email ?? '').trim().toLowerCase() === cleanEmail &&
      soloDigitos(s.dni ?? '') === cleanDni
  )
  if (!student) {
    return NextResponse.json(
      { error: 'No encontramos una ficha del estudio con ese email y DNI. Consultá en recepción.' },
      { status: 404 }
    )
  }
  if (student.user_id) {
    return NextResponse.json(
      { error: 'Tu ficha ya tiene un acceso creado. Probá ingresar, o usá "Olvidé mi contraseña".' },
      { status: 409 }
    )
  }

  const { data: created, error: createError } = await admin.auth.admin.createUser({
    email: cleanEmail,
    password,
    email_confirm: true,
    user_metadata: { full_name: student.name },
  })
  if (createError || !created.user) {
    const msg = /already.*registered|already.*exists/i.test(createError?.message ?? '')
      ? 'Ya existe una cuenta con ese email. Probá ingresar, o usá "Olvidé mi contraseña".'
      : 'No se pudo crear la cuenta. Consultá en recepción.'
    return NextResponse.json({ error: msg }, { status: 400 })
  }

  // El `.is('user_id', null)` es la carrera: si dos pedidos entran juntos,
  // el segundo no tiene que pisar el vínculo del primero. Por eso hay que
  // mirar CUÁNTAS filas volvieron y no sólo si hubo error — un update que
  // no encuentra fila devuelve `error: null` y cero filas, y antes eso
  // pasaba por bueno: respondía `ok` con la ficha sin vincular y la cuenta
  // de Auth huérfana, porque la compensación sólo corría con error.
  const { data: vinculadas, error: linkError } = await admin
    .from('students')
    .update({ user_id: created.user.id })
    .eq('id', student.id)
    .is('user_id', null)
    .select('id')

  if (linkError || (vinculadas ?? []).length !== 1) {
    // Sin vínculo el portal no sirve: se deshace la cuenta para reintentar
    await admin.auth.admin.deleteUser(created.user.id)
    return NextResponse.json(
      {
        error: linkError
          ? 'No se pudo vincular tu ficha. Probá de nuevo.'
          : 'Tu ficha ya tiene un acceso creado. Probá ingresar, o usá "Olvidé mi contraseña".',
      },
      { status: linkError ? 500 : 409 }
    )
  }

  return NextResponse.json({ ok: true })
}
