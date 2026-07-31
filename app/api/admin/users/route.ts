import { NextResponse } from 'next/server'
import type { SupabaseClient } from '@supabase/supabase-js'
import { supabaseAdmin, supabaseForRequest } from '@/lib/mp-server'

// Crear y eliminar usuarios requiere la Admin API de Supabase
// (SUPABASE_SERVICE_ROLE_KEY en el entorno del servidor). Solo un
// usuario con rol admin puede invocar estos endpoints.

async function authorize(request: Request): Promise<
  | { ok: true; caller: SupabaseClient; admin: SupabaseClient; callerId: string }
  | { ok: false; response: NextResponse }
> {
  const caller = supabaseForRequest(request)
  if (!caller) {
    return { ok: false, response: NextResponse.json({ error: 'No autenticado' }, { status: 401 }) }
  }

  const { data: userData, error: userError } = await caller.auth.getUser()
  if (userError || !userData.user) {
    return { ok: false, response: NextResponse.json({ error: 'Sesión inválida' }, { status: 401 }) }
  }

  const { data: profile } = await caller
    .from('profiles')
    .select('role')
    .eq('id', userData.user.id)
    .single()
  if (profile?.role !== 'admin') {
    return {
      ok: false,
      response: NextResponse.json({ error: 'Solo el rol admin puede gestionar usuarios' }, { status: 403 }),
    }
  }

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

  return { ok: true, caller, admin, callerId: userData.user.id }
}

const VALID_ROLES = ['admin', 'recepcion', 'profesor', 'alumno']

export async function POST(request: Request) {
  const auth = await authorize(request)
  if (!auth.ok) return auth.response

  const { email, password, fullName, role } = await request.json().catch(() => ({}))
  if (!email || !password || !VALID_ROLES.includes(role)) {
    return NextResponse.json({ error: 'Faltan datos: email, contraseña y rol' }, { status: 400 })
  }
  if (String(password).length < 6) {
    return NextResponse.json({ error: 'La contraseña debe tener al menos 6 caracteres' }, { status: 400 })
  }

  const { error } = await auth.admin.auth.admin.createUser({
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

  return NextResponse.json({ ok: true })
}

export async function DELETE(request: Request) {
  const auth = await authorize(request)
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
