import { NextResponse } from 'next/server'
import type { SupabaseClient } from '@supabase/supabase-js'
import { supabaseAdmin } from '@/lib/mp-server'
import { esDenegado, exigir } from '@/lib/permisos-server'
import { emailLayout, sendEmail } from '@/lib/email-server'

// Crear y eliminar usuarios requiere la Admin API de Supabase
// (SUPABASE_SERVICE_ROLE_KEY en el entorno del servidor). Solo un
// usuario con rol admin puede invocar estos endpoints.

async function authorize(
  request: Request,
  clave: string
): Promise<
  | { ok: true; caller: SupabaseClient; admin: SupabaseClient; callerId: string; callerRole: string; can: (c: string) => boolean }
  | { ok: false; response: NextResponse }
> {
  // La clave la exige el motor de permisos; los roles de atrás son el
  // respaldo por si la migración 0012 todavía no corrió.
  const caller = await exigir(request, clave, clave === 'usuarios.eliminar' ? ['admin'] : ['admin', 'recepcion'])
  if (esDenegado(caller)) return { ok: false, response: caller.error }

  const admin = supabaseAdmin()
  if (!admin) {
    return {
      ok: false,
      response: NextResponse.json(
        {
          error:
            'Falta configurar SUPABASE_SERVICE_ROLE_KEY en el servidor. En local: agregala a .env.local; en Vercel: Settings → Environment Variables. La clave está en Supabase → Settings → API Keys.',
        },
        { status: 501 }
      ),
    }
  }

  return {
    ok: true,
    caller: caller.supabase,
    admin,
    callerId: caller.userId,
    callerRole: caller.role,
    can: caller.can,
  }
}

const VALID_ROLES = ['admin', 'recepcion', 'profesor', 'alumno']

const soloDigitos = (s: string) => String(s ?? '').replace(/\D/g, '')

export async function POST(request: Request) {
  const auth = await authorize(request, 'usuarios.crear_alumno')
  if (!auth.ok) return auth.response

  const { email, password, fullName, role, studentId, teacherId } = await request
    .json()
    .catch(() => ({}))
  if (!email || !VALID_ROLES.includes(role)) {
    return NextResponse.json({ error: 'Faltan datos: email y rol' }, { status: 400 })
  }

  /**
   * El acceso de una clienta nace con su DOCUMENTO como contraseña, y con
   * la marca de cambiarla al entrar.
   *
   * La decisión es del estudio (17/09): así el mostrador no tiene que
   * inventar ni dictar una clave, y el mail que recibe la clienta le dice
   * algo que ya sabe de memoria.
   *
   * Y va con el cambio obligatorio porque el DNI **no es un secreto**: es
   * el mismo par mail + documento por el que se apagó el auto-registro en
   * la 0057. Con la marca, el documento sirve una sola vez y deja de ser
   * la llave; sin ella, sería una llave pública y permanente.
   *
   * El documento se lee de la FICHA y no del cuerpo del pedido: es el dato
   * que el estudio cargó, y así el navegador no puede elegir la clave de
   * una cuenta que no es suya.
   */
  let clave = password
  let debeCambiarClave = false
  let fichaEmailPendiente = false

  if (role === 'alumno' && studentId) {
    const { data: ficha } = await auth.admin
      .from('students')
      .select('name, dni, email')
      .eq('id', studentId)
      .maybeSingle()
    const dni = soloDigitos(ficha?.dni ?? '')
    if (dni.length < 6) {
      return NextResponse.json(
        {
          error: ficha?.dni
            ? 'El documento de la ficha es muy corto para usarlo como contraseña. Revisalo.'
            : 'Cargale el DNI a la ficha antes de crear el acceso: la contraseña inicial es su documento.',
        },
        { status: 400 }
      )
    }
    clave = dni
    debeCambiarClave = true
    // Si el mail del acceso no es el de la ficha, la ficha queda vieja y
    // los avisos del proceso diario salen a la dirección equivocada. Se
    // sincroniza más abajo, una vez que la cuenta existe.
    fichaEmailPendiente = String(ficha?.email ?? '').trim().toLowerCase() !== String(email).trim().toLowerCase()
  }

  if (!clave || String(clave).length < 6) {
    return NextResponse.json({ error: 'La contraseña debe tener al menos 6 caracteres' }, { status: 400 })
  }
  // Crear un acceso de alumna y crear un usuario de staff son dos permisos
  // distintos: el segundo es la puerta a fabricarse un admin, y por eso la
  // clave está marcada como no configurable desde la pantalla.
  if (role !== 'alumno' && !auth.can('usuarios.crear_staff')) {
    return NextResponse.json({ error: 'Solo el admin puede crear usuarios de staff' }, { status: 403 })
  }

  const { data: created, error } = await auth.admin.auth.admin.createUser({
    email,
    password: clave,
    email_confirm: true,
    // `debe_cambiar_clave` va en la metadata del usuario y no en una
    // columna: así se apaga en la MISMA llamada en que la persona elige su
    // contraseña nueva (`updateUser({ password, data })`), y no puede
    // quedar una cuenta con la clave cambiada y la marca puesta, ni al
    // revés. Quien quiera saltearlo sólo se expone a sí mismo.
    user_metadata: {
      full_name: fullName ?? '',
      role,
      ...(debeCambiarClave ? { debe_cambiar_clave: true } : {}),
    },
  })
  if (error) {
    const msg = /already.*registered|already.*exists/i.test(error.message)
      ? 'Ya existe un usuario con ese email'
      : error.message
    return NextResponse.json({ error: msg }, { status: 400 })
  }

  // El trigger de la base crea el perfil siempre como 'alumno' (migración
  // 0006, la metadata no es confiable); el rol pedido se asigna acá con el
  // service role, ya autorizado arriba.
  if (created.user && role !== 'alumno') {
    const { error: roleError } = await auth.admin
      .from('profiles')
      .update({ role })
      .eq('id', created.user.id)
    if (roleError) {
      return NextResponse.json(
        { error: `Usuario creado pero no se pudo asignar el rol: ${roleError.message}` },
        { status: 500 }
      )
    }
  }

  // Vincula la cuenta con la ficha del alumno para el portal
  if (studentId && created.user) {
    const { error: linkError } = await auth.admin
      .from('students')
      .update({ user_id: created.user.id })
      .eq('id', studentId)
    if (linkError) {
      return NextResponse.json(
        { error: `Usuario creado pero no se pudo vincular la ficha: ${linkError.message}` },
        { status: 500 }
      )
    }
  }

  // Y con la ficha de la profesora, que hasta hoy había que vincular a
  // mano en otra sección. Sin `teachers.user_id`, `my_teacher_ids()` no
  // encuentra nada y el sistema no sabe qué clases son suyas: la cuenta
  // existe y no sirve para lo que se creó.
  if (teacherId && created.user) {
    const { error: linkError } = await auth.admin
      .from('teachers')
      .update({ user_id: created.user.id })
      .eq('id', teacherId)
    if (linkError) {
      return NextResponse.json(
        { error: `Usuario creado pero no se pudo vincular la profesora: ${linkError.message}` },
        { status: 500 }
      )
    }
  }

  // ── El mail del acceso, y la ficha al día ────────────────────────────
  //
  // Las dos cosas pasan después de que la cuenta existe y quedó vinculada:
  // si algo de esto falla, la cuenta ya sirve y lo que falta se puede
  // repetir. Al revés —mandar el mail antes de vincular— sería avisarle de
  // un acceso que todavía no funciona.
  let mailEnviado = false
  if (role === 'alumno' && studentId && created.user) {
    // El mail del acceso pasa a ser el de la ficha. Sin esto, el mostrador
    // podía crear el acceso con una dirección y dejar la ficha con otra, y
    // los avisos del proceso diario —que salen al mail de la FICHA— se iban
    // a una casilla que nadie lee. Verificado el 17/09: el endpoint sólo
    // escribía `user_id`.
    if (fichaEmailPendiente) {
      await auth.admin
        .from('students')
        .update({ email: String(email).trim().toLowerCase() })
        .eq('id', studentId)
    }

    const nombre = String(fullName ?? '').trim().split(' ')[0] || 'Hola'
    const origen = new URL(request.url).origin
    mailEnviado = await sendEmail(
      String(email).trim(),
      'Tu acceso al portal',
      await emailLayout(
        `¡Hola ${nombre}!`,
        `<p>Ya podés entrar a tu portal: reservar tus clases, ver cuántas te quedan y tus pagos.</p>
         <p style="margin:18px 0 6px;"><strong>Cómo entrar</strong></p>
         <p style="margin:0;">Usuario: <strong>${String(email).trim()}</strong><br>
         Contraseña: <strong>tu número de documento</strong>, sin puntos</p>
         <p style="margin:18px 0;"><a href="${origen}/sistema" style="display:inline-block;padding:12px 22px;border-radius:12px;background:#847164;color:#fff;text-decoration:none;font-weight:700;">Entrar al portal</a></p>
         <p style="font-size:13px;color:#6B5646;">La primera vez te vamos a pedir que elijas una contraseña nueva: tu documento no es un secreto, así que sirve para entrar una sola vez.</p>`
      )
    )
  }

  // `mailEnviado` en false no es un error: puede no haber dominio
  // verificado todavía. La pantalla lo dice para que el mostrador sepa si
  // tiene que pasar el acceso a mano.
  return NextResponse.json({ ok: true, mailEnviado })
}

export async function DELETE(request: Request) {
  const auth = await authorize(request, 'usuarios.eliminar')
  if (!auth.ok) return auth.response

  const { userId } = await request.json().catch(() => ({}))
  if (!userId) {
    return NextResponse.json({ error: 'Falta userId' }, { status: 400 })
  }
  if (userId === auth.callerId) {
    return NextResponse.json({ error: 'No podés eliminar tu propio usuario' }, { status: 400 })
  }

  // Baja lógica, no borrado (migración 0015): el documento pide conservar
  // las clases, asistencias y movimientos de quien ya no está. Son dos
  // cosas juntas — marcar el perfil inactivo y bloquear el ingreso — y por
  // eso pasan por acá y no por un update suelto desde el navegador.
  const { error: perfilError } = await auth.admin
    .from('profiles')
    .update({ active: false })
    .eq('id', userId)
  if (perfilError) {
    return NextResponse.json({ error: perfilError.message }, { status: 400 })
  }

  // Baneo largo en Auth: la cuenta existe, pero no puede iniciar sesión.
  const { error } = await auth.admin.auth.admin.updateUserById(userId, {
    ban_duration: '876000h',
  })
  if (error) {
    // Si el baneo falla, se revierte el perfil para no dejar a alguien
    // "inactivo" en la pantalla pero pudiendo entrar igual.
    await auth.admin.from('profiles').update({ active: true }).eq('id', userId)
    return NextResponse.json({ error: error.message }, { status: 400 })
  }

  return NextResponse.json({ ok: true })
}

/** Reactivar un acceso dado de baja. */
export async function PATCH(request: Request) {
  const auth = await authorize(request, 'usuarios.eliminar')
  if (!auth.ok) return auth.response

  const { userId } = await request.json().catch(() => ({}))
  if (!userId) {
    return NextResponse.json({ error: 'Falta userId' }, { status: 400 })
  }

  const { error } = await auth.admin.auth.admin.updateUserById(userId, {
    ban_duration: 'none',
  })
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 })
  }

  const { error: perfilError } = await auth.admin
    .from('profiles')
    .update({ active: true })
    .eq('id', userId)
  if (perfilError) {
    return NextResponse.json({ error: perfilError.message }, { status: 400 })
  }

  return NextResponse.json({ ok: true })
}
