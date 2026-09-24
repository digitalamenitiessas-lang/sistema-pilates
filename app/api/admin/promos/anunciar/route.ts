import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/mp-server'
import { esDenegado, exigir } from '@/lib/permisos-server'
import { enviarMail, emailLayout } from '@/lib/email-server'
import { urlDelPortal } from '@/lib/estudio'

/**
 * Anunciar una promoción a las clientas activas.
 *
 * Es un endpoint y no un trigger de la base por una razón: mandar mails
 * al padrón entero no se deshace. Una promo recién cargada se corrige
 * dos o tres veces —el porcentaje, las fechas, el plan— y si el anuncio
 * saliera solo al crearla, saldría con el número equivocado. Acá el
 * estudio aprieta el botón cuando la promo ya está como va.
 *
 * Por eso también se exige que la promo RIJA: anunciar un descuento que
 * la base todavía no aplica es prometer algo que el mostrador va a tener
 * que desdecir.
 */

/** Cómo se lee la promo en un mail: sin jerga y sin el id. */
function comoSeUsa(p: {
  tipo: string
  valor: number
  codigo: string | null
  ventana: string
  desde: string | null
  hasta: string | null
  dia_desde: number | null
  dia_hasta: number | null
  usos_por_cliente: number | null
}): { beneficio: string; cuando: string; como: string } {
  const beneficio =
    p.tipo === 'porcentaje'
      ? `${Number(p.valor)}% de descuento`
      : `$${Number(p.valor).toLocaleString('es-AR')} de descuento`

  const fecha = (f: string) =>
    new Date(`${f}T12:00:00`).toLocaleDateString('es-AR', { day: 'numeric', month: 'long' })

  let cuando = 'Sin fecha de corte.'
  if (p.ventana === 'fechas' && p.desde && p.hasta) {
    cuando = `Del ${fecha(p.desde)} al ${fecha(p.hasta)}.`
  } else if (p.ventana === 'dias_mes' && p.dia_desde && p.dia_hasta) {
    cuando =
      p.dia_desde === p.dia_hasta
        ? `Solo el día ${p.dia_desde} de cada mes.`
        : `Del día ${p.dia_desde} al ${p.dia_hasta} de cada mes.`
  }

  // El tope por clienta se cuenta acá y no en el "cuándo" porque es lo
  // que más pregunta la que ya la usó una vez.
  const tope =
    p.usos_por_cliente && p.usos_por_cliente > 0
      ? ` Se puede usar ${p.usos_por_cliente === 1 ? 'una sola vez' : `hasta ${p.usos_por_cliente} veces`} por persona.`
      : ''

  const como = p.codigo
    ? `Al pagar, decí el código <strong>${p.codigo}</strong> y te lo aplicamos.${tope}`
    : `No hay que hacer nada: se aplica solo cuando pagás.${tope}`

  return { beneficio, cuando, como }
}

export async function POST(request: Request) {
  const caller = await exigir(request, 'promos.administrar', ['admin'])
  if (esDenegado(caller)) return caller.error

  const admin = supabaseAdmin()
  if (!admin) {
    return NextResponse.json(
      {
        error:
          'Falta configurar SUPABASE_SERVICE_ROLE_KEY en el servidor. En Vercel: Settings → Environment Variables, con Production marcado, y redeploy.',
      },
      { status: 501 }
    )
  }

  let body: { promocionId?: string; prueba?: boolean }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Cuerpo inválido' }, { status: 400 })
  }
  if (!body.promocionId) {
    return NextResponse.json({ error: 'Falta la promoción' }, { status: 400 })
  }

  // Se lee con el cliente de quien llama, no con el service role: si RLS
  // no le deja ver la promoción, tampoco tiene por qué anunciarla.
  const { data: promo, error: errPromo } = await caller.supabase
    .from('promociones')
    .select('*')
    .eq('id', body.promocionId)
    .maybeSingle()

  if (errPromo) return NextResponse.json({ error: errPromo.message }, { status: 500 })
  if (!promo) return NextResponse.json({ error: 'No se encontró la promoción' }, { status: 404 })

  if (!promo.active || !promo.rige) {
    return NextResponse.json(
      {
        error:
          'Esa promoción todavía no rige, así que no descuenta nada. Encendela primero y después anunciala.',
      },
      { status: 409 }
    )
  }

  const { beneficio, cuando, como } = comoSeUsa(promo)

  // "Activas" es el padrón: quien no se dio de baja. A propósito NO se
  // filtra por membresía vigente — a quien se le venció es justamente a
  // quien un descuento le puede hacer volver.
  const { data: alumnas, error: errAlumnas } = await admin
    .from('students')
    .select('id, name, email, user_id')
    .eq('active', true)

  if (errAlumnas) return NextResponse.json({ error: errAlumnas.message }, { status: 500 })

  const padron = alumnas ?? []
  const conMail = padron.filter((a) => a.email)

  // Una prueba manda el mail a quien aprieta el botón y a nadie más. Es
  // la única forma de ver cómo se lee antes de mandarlo a todo el padrón.
  if (body.prueba) {
    const { data: yo } = await admin.auth.admin.getUserById(caller.userId)
    const mio = yo?.user?.email
    if (!mio) {
      return NextResponse.json({ error: 'Tu usuario no tiene email cargado.' }, { status: 400 })
    }
    const r = await enviarMail(
      mio,
      `[PRUEBA] ${promo.nombre}`,
      await emailLayout(
        promo.nombre,
        `<p style="background:#f3f0ec;padding:8px 12px;border-radius:8px;font-size:12px;">Esto es una prueba. Así lo van a ver las ${conMail.length} clientas con mail cargado.</p>
         <p><strong>${beneficio}</strong> en tu cuota.</p>
         <p>${cuando}</p>
         <p>${como}</p>`
      )
    )
    return NextResponse.json(
      r.ok
        ? { prueba: true, enviados: 1, destinatarios: conMail.length }
        : { error: r.motivo },
      { status: r.ok ? 200 : 502 }
    )
  }

  // La campana va primero y para TODAS, no solo para las que tienen mail
  // cargado: es el único canal que no depende de un dato que la ficha
  // puede no tener. Si la 0080 no corrió, la base rechaza el tipo — y eso
  // no puede impedir que salgan los mails, que son el canal principal.
  let enCampana = 0
  let avisoCampana: string | null = null
  const { error: errNotif, data: filas } = await admin
    .from('notifications')
    .upsert(
      padron.map((a) => ({
        type: 'promocion',
        title: promo.nombre,
        body: `${beneficio} en tu cuota. ${cuando.replace(/<[^>]+>/g, '')} ${como.replace(/<[^>]+>/g, '')}`,
        student_id: a.id,
        audience: 'alumno',
        // Una promo se anuncia una vez por clienta: apretar el botón dos
        // veces no le llena la campana de lo mismo.
        dedupe_key: `promo-${promo.id}-${a.id}`,
      })),
      { onConflict: 'dedupe_key', ignoreDuplicates: true }
    )
    .select('dedupe_key')

  if (errNotif) {
    avisoCampana =
      errNotif.code === '23514'
        ? 'Los avisos en el portal quedaron afuera: falta correr la migración 0080. Los mails sí salieron.'
        : `Los avisos en el portal no se pudieron crear (${errNotif.message}). Los mails sí salieron.`
  } else {
    enCampana = (filas ?? []).length
  }

  // Sin fallback al origen del pedido a propósito: en producción ese
  // origen es el de la función, y ya hubo un mail con un link a
  // localhost por hacer exactamente eso. Que salga de la configuración
  // del estudio o de Vercel.
  const portal = await urlDelPortal()
  let enviados = 0
  let primerMotivo: string | null = null

  for (const a of conMail) {
    const r = await enviarMail(
      a.email as string,
      promo.nombre,
      await emailLayout(
        `¡Hola ${(a.name ?? '').split(' ')[0]}!`,
        `<p>Tenemos algo para vos: <strong>${beneficio}</strong> en tu cuota.</p>
         <p>${cuando}</p>
         <p>${como}</p>
         <p><a href="${portal}" style="display:inline-block;background:#847164;color:#fff;text-decoration:none;padding:10px 18px;border-radius:10px;font-weight:600;">Entrar al portal</a></p>`
      )
    )
    if (r.ok) enviados++
    else if (!primerMotivo) primerMotivo = r.motivo
  }

  return NextResponse.json({
    destinatarios: padron.length,
    conMail: conMail.length,
    enviados,
    enCampana,
    aviso: avisoCampana,
    // El primer rechazo alcanza: si falla uno suelen fallar todos por el
    // mismo motivo, y la pantalla no tiene dónde poner cien.
    motivo: enviados < conMail.length ? primerMotivo : null,
  })
}
