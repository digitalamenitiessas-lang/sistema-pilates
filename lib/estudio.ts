/**
 * Cómo se llama el estudio.
 *
 * Estaba escrito "PilatesStudio" en catorce lugares del código: el ícono
 * que la clienta ve al instalar la app, el título del navegador, lo que
 * aparece al compartir el link, el remitente de los emails y el nombre
 * que le figura en el resumen de la tarjeta. Todo eso es lo primero que
 * ve alguien que no conoce el estudio, y decía el nombre equivocado.
 *
 * El nombre vive en studio_settings desde la 0011 y el estudio lo edita
 * desde Configuración. Acá se lo lee, con un valor de respaldo para los
 * dos momentos en que no se puede: antes de que la consulta vuelva, y si
 * la base no contesta.
 */
import { createClient } from '@supabase/supabase-js'

/** Si no se puede leer, es preferible el nombre real a uno inventado. */
export const NOMBRE_POR_DEFECTO = 'Casa Fé'

/**
 * Para el servidor: manifest, metadata y emails. Usa la vista pública, que
 * no necesita sesión — es la misma que lee la web pública sin login.
 */
export async function nombreDelEstudio(): Promise<string> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!url || !key) return NOMBRE_POR_DEFECTO
  try {
    const db = createClient(url, key, { auth: { persistSession: false } })
    const { data } = await db
      .from('public_studio_settings')
      .select('value')
      .eq('key', 'studio_name')
      .maybeSingle()
    return data?.value?.trim() || NOMBRE_POR_DEFECTO
  } catch {
    return NOMBRE_POR_DEFECTO
  }
}

/**
 * Mercado Pago lo muestra en el resumen de la tarjeta: solo mayúsculas y
 * números, hasta 13 caracteres, y sin espacios ni acentos. Si no entra,
 * la clienta ve un cargo de un comercio que no reconoce.
 */
export function descriptorDeTarjeta(nombre: string): string {
  return (
    nombre
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .toUpperCase()
      .replace(/[^A-Z0-9]/g, '')
      .slice(0, 13) || 'CASAFE'
  )
}
