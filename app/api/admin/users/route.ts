import { NextResponse } from 'next/server'
import type { SupabaseClient } from '@supabase/supabase-js'
import { supabaseAdmin } from '@/lib/mp-server'
import { esDenegado, exigir } from '@/lib/permisos-server'

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

export async function POST(request: Request) {
  const auth = await authorize(request, 'usuarios.crear_alumno')
  if (!auth.ok) return auth.response

  const { email, password, fullName, role, studentId } = await request.json().catch(() => ({}))
  if (!email || !password || !VALID_ROLES.includes(role)) {
    return NextResponse.json({ error: 'Faltan datos: email, contraseña y rol' }, { status: 400 })
  }
  if (String(password).length < 6) {
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
    password,
    email_confirm: true,
    user_metadata: { full_name: fullName ?? '', role },
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

  return NextResponse.json({ ok: true })
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

  const { error } = await auth.admin.auth.admin.deleteUser(userId)
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 })
  }

  return NextResponse.json({ ok: true })
}
