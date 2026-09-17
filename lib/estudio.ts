/**
 * Cómo se llama el estudio.
 *
 * Estaba escrito "PilatesStudio" en catorce lugares del código: el ícono
 * que el cliente ve al instalar la app, el título del navegador, lo que
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
export const NOMBRE_POR_DEFECTO = 'Casa Fe'

/**
 * Un parámetro público, leído sin sesión. La vista `public_studio_settings`
 * (0011) expone sólo las claves marcadas como públicas y corre con los
 * permisos del dueño, así que la llave anónima alcanza y no expone el
 * resto de la configuración.
 */
async function leerPublico(key: string): Promise<string> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!url || !anon) return ''
  try {
    const db = createClient(url, anon, { auth: { persistSession: false } })
    const { data } = await db
      .from('public_studio_settings')
      .select('value')
      .eq('key', key)
      .maybeSingle()
    return data?.value?.trim() ?? ''
  } catch {
    return ''
  }
}

/**
 * Para el servidor: manifest, metadata y emails. Usa la vista pública, que
 * no necesita sesión — es la misma que lee la web pública sin login.
 */
export async function nombreDelEstudio(): Promise<string> {
  return (await leerPublico('studio_name')) || NOMBRE_POR_DEFECTO
}

/**
 * La dirección con la que las clientas entran, para los links de los mails.
 *
 * NO sale del pedido. El 17/09 los cuatro mails de acceso que se habían
 * mandado —uno a una clienta real— llevaban el botón "Entrar al portal"
 * apuntando a `http://localhost:3000`, porque el link se armaba con
 * `new URL(request.url).origin`: la dirección por la que entró el pedido,
 * que no tiene por qué ser la dirección pública del estudio. Un alta hecha
 * desde el servidor de desarrollo mandaba a la clienta a la máquina de
 * quien programa.
 *
 * El orden es: lo que el estudio configuró, después la dirección de
 * producción que publica Vercel —así funciona sin configurar nada—, y
 * recién al final el origen del pedido, que en desarrollo es justamente lo
 * que uno quiere.
 */
export async function urlDelPortal(origenDelPedido = ''): Promise<string> {
  const delEstudio = await leerPublico('portal_url')
  const deVercel =
    process.env.NEXT_PUBLIC_SITE_URL ||
    process.env.VERCEL_PROJECT_PRODUCTION_URL ||
    process.env.VERCEL_URL ||
    ''
  return normalizarUrl(delEstudio || deVercel || origenDelPedido)
}

/**
 * Vercel publica su dominio SIN el protocolo (`mi-app.vercel.app`) y quien
 * escribe la dirección a mano puede dejarle una barra al final. Las dos
 * cosas rompen el link de un mail de maneras distintas y silenciosas.
 */
function normalizarUrl(valor: string): string {
  const limpio = valor.trim().replace(/\/+$/, '')
  if (!limpio) return ''
  return /^https?:\/\//i.test(limpio) ? limpio : `https://${limpio}`
}

/**
 * Mercado Pago lo muestra en el resumen de la tarjeta: solo mayúsculas y
 * números, hasta 13 caracteres, y sin espacios ni acentos. Si no entra,
 * el cliente ve un cargo de un comercio que no reconoce.
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
