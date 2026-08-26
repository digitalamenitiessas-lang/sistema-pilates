import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/mp-server'

// Auto-registro del portal del alumno. Endpoint público a propósito, pero
// SOLO crea la cuenta si email + DNI coinciden con una ficha activa y sin
// acceso: los signups públicos de Supabase siguen deshabilitados y nadie
// puede registrarse sin estar cargado antes por el estudio. El trigger de
// la base (0006) garantiza que la cuenta nazca con rol alumno.

const soloDigitos = (s: string) => String(s).replace(/\D/g, '')

export async function POST(request: Request) {
  const { email, dni, password } = await request.json().catch(() => ({}))
  if (!email || !dni || !password) {
    return NextResponse.json({ error: 'Completá email, DNI y contraseña' }, { status: 400 })
  }
  if (String(password).length < 6) {
    return NextResponse.json({ error: 'La contraseña debe tener al menos 6 caracteres' }, { status: 400 })
  }

  const admin = supabaseAdmin()
  if (!admin) {
    return NextResponse.json({ error: 'Registro no disponible por el momento' }, { status: 501 })
  }

  const cleanEmail = String(email).trim().toLowerCase()
  const cleanDni = soloDigitos(dni)
  if (!cleanDni) {
    return NextResponse.json({ error: 'Ingresá tu DNI (solo números)' }, { status: 400 })
  }

  // Ficha activa con ese email; el DNI se compara normalizado (sin puntos)
  const { data: candidates, error: queryError } = await admin
    .from('students')
    .select('id, name, dni, user_id')
    .ilike('email', cleanEmail)
    .eq('active', true)
  if (queryError) {
    return NextResponse.json({ error: 'No se pudo verificar la ficha' }, { status: 500 })
  }

  const student = (candidates ?? []).find((s) => soloDigitos(s.dni) === cleanDni)
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

  const { error: linkError } = await admin
    .from('students')
    .update({ user_id: created.user.id })
    .eq('id', student.id)
    .is('user_id', null)
  if (linkError) {
    // Sin vínculo el portal no sirve: se deshace la cuenta para reintentar
    await admin.auth.admin.deleteUser(created.user.id)
    return NextResponse.json({ error: 'No se pudo vincular tu ficha. Probá de nuevo.' }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}
