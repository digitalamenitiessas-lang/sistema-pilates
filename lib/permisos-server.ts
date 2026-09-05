// Permisos del lado del servidor.
//
// Las políticas de la base son la autoridad, pero no alcanzan solas: los
// endpoints de app/api/** usan el service role para varias cosas, y el
// service role NO pasa por esas políticas. Sin este chequeo, un permiso
// destildado en la pantalla desaparecería del navegador pero el endpoint
// lo seguiría aceptando.
//
// Consulta las mismas claves que la pantalla, con la misma función de la
// base (mis_permisos), así no hay dos fuentes de verdad que se puedan
// desincronizar.
import type { SupabaseClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { supabaseForRequest } from './mp-server'

export interface Caller {
  supabase: SupabaseClient
  userId: string
  role: string
  permisos: Set<string>
  can: (clave: string) => boolean
}

/**
 * Resuelve quién llama y qué puede hacer, en una sola pasada por request.
 * Antes cada endpoint volvía a consultar el perfil por su cuenta.
 */
export async function resolveCaller(request: Request): Promise<Caller | null> {
  const supabase = supabaseForRequest(request)
  if (!supabase) return null

  const { data: userData, error } = await supabase.auth.getUser()
  if (error || !userData.user) return null

  const [{ data: profile }, { data: permisos }] = await Promise.all([
    supabase.from('profiles').select('role').eq('id', userData.user.id).single(),
    supabase.rpc('mis_permisos'),
  ])

  const claves = new Set<string>((permisos as string[] | null) ?? [])
  return {
    supabase,
    userId: userData.user.id,
    role: profile?.role ?? '',
    permisos: claves,
    can: (clave: string) => claves.has(clave),
  }
}

export type Denegado = { error: NextResponse }

function esDenegado(x: Caller | Denegado): x is Denegado {
  return (x as Denegado).error !== undefined
}

/**
 * Puerta de entrada de un endpoint: resuelve al que llama y exige una
 * clave. Devuelve el Caller, o el error listo para responder.
 *
 * Si la migración 0012 todavía no corrió, `mis_permisos` no existe y no
 * llega ninguna clave. Para no dejar el sistema inoperable en ese caso,
 * cae al rol que exigía antes cada endpoint, que se pasa en `rolesLegacy`.
 */
export async function exigir(
  request: Request,
  clave: string,
  rolesLegacy: string[] = ['admin', 'recepcion']
): Promise<Caller | Denegado> {
  const caller = await resolveCaller(request)
  if (!caller) {
    return { error: NextResponse.json({ error: 'No autenticado' }, { status: 401 }) }
  }

  const permitido = caller.permisos.size
    ? caller.can(clave)
    : rolesLegacy.includes(caller.role)

  if (!permitido) {
    return {
      error: NextResponse.json(
        { error: 'Tu rol no tiene permiso para esta acción' },
        { status: 403 }
      ),
    }
  }
  return caller
}

export { esDenegado }
