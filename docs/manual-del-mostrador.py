from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.lib import colors
from reportlab.platypus import (
    SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, KeepTogether,
)

SALIDA = '/Users/matiaslujanw/Desarrollo/sistema-pilates/docs/Casa-Fe-manual-del-mostrador.pdf'

TERRA = colors.HexColor('#A9552F')
TINTA = colors.HexColor('#3D2C23')
GRIS = colors.HexColor('#6B5646')
TENUE = colors.HexColor('#8A7A6D')
LINEA = colors.HexColor('#E3D6C8')
CREMA = colors.HexColor('#FBF6F0')
SALVIA = colors.HexColor('#5E7A57')

ss = getSampleStyleSheet()

def E(n, **kw):
    base = dict(fontName='Helvetica', fontSize=9.5, leading=13.5, textColor=TINTA)
    base.update(kw)
    return ParagraphStyle(n, parent=ss['Normal'], **base)

titulo = E('t', fontName='Helvetica-Bold', fontSize=20, leading=24, spaceAfter=2)
bajada = E('b', fontSize=10.5, leading=15, textColor=GRIS, spaceAfter=13)
h1 = E('h1', fontName='Helvetica-Bold', fontSize=12.5, leading=16, textColor=TERRA,
       spaceBefore=15, spaceAfter=4)
tarea = E('tarea', fontName='Helvetica-Bold', fontSize=10.5, leading=14, spaceBefore=10, spaceAfter=2)
cuerpo = E('c', spaceAfter=5)
paso = E('paso', fontSize=9.5, leading=13.5, leftIndent=13, spaceAfter=1.5)
ojo = E('ojo', fontSize=9, leading=12.5, textColor=GRIS, leftIndent=13,
        spaceBefore=3, spaceAfter=2)
nota = E('n', fontSize=8.8, leading=12.5, textColor=TENUE)
celda = E('celda', fontSize=9, leading=12.5)
celdaB = E('celdaB', fontName='Helvetica-Bold', fontSize=9, leading=12.5)


def tabla(filas, anchos):
    datos = [[Paragraph(c, celdaB if i == 0 else celda) for c in f] for i, f in enumerate(filas)]
    t = Table(datos, colWidths=anchos, hAlign='LEFT', repeatRows=1)
    t.setStyle(TableStyle([
        ('VALIGN', (0, 0), (-1, -1), 'TOP'),
        ('TOPPADDING', (0, 0), (-1, -1), 5), ('BOTTOMPADDING', (0, 0), (-1, -1), 5),
        ('LEFTPADDING', (0, 0), (-1, -1), 7), ('RIGHTPADDING', (0, 0), (-1, -1), 7),
        ('LINEBELOW', (0, 0), (-1, -2), 0.4, LINEA),
        ('BACKGROUND', (0, 0), (-1, 0), CREMA),
        ('LINEBELOW', (0, 0), (-1, 0), 0.7, TERRA),
    ]))
    return t


def T(nombre, pasos, aviso=None):
    """Una tarea: su nombre, sus pasos numerados, y lo que no es obvio."""
    out = [Paragraph(nombre, tarea)]
    for i, p in enumerate(pasos, 1):
        out.append(Paragraph(f'<b>{i}.</b>&nbsp;&nbsp;{p}', paso))
    if aviso:
        out.append(Paragraph(f'<b>Ojo:</b> {aviso}', ojo))
    # Entera o en la página siguiente, nunca partida: este manual se consulta
    # apurado en el mostrador, y una tarea que arranca en el paso 2 de la
    # página anterior es exactamente lo que no se puede leer así.
    return [KeepTogether(out)]


doc = SimpleDocTemplate(
    SALIDA, pagesize=A4,
    leftMargin=19 * mm, rightMargin=19 * mm, topMargin=17 * mm, bottomMargin=17 * mm,
    title='Casa Fe · Manual del mostrador', author='Casa Fe',
)

S = [
    Paragraph('Casa Fe — Manual del mostrador', titulo),
    Paragraph('Las cosas que se hacen todos los días, en orden de cuánto se usan. '
              'Cada una en pocos pasos, y con lo que no es obvio dicho donde aparece.', bajada),
]

# ── El celular ──────────────────────────────────────────────
S += [Paragraph('Lo primero: el sistema en el celular', h1)]
S += [Paragraph('No hace falta bajar nada de ninguna tienda. Se abre el sistema en el navegador '
                'del celular y se instala desde ahí: queda como una app, con su ícono, y abre sin '
                'la barra del navegador.', cuerpo)]
S += T('Instalarlo', [
    'Entrá al sistema desde el celular y logueate.',
    'Va a aparecer solo un cartel ofreciendo instalarlo. Aceptá.',
    'En iPhone no hay cartel automático: el mismo aviso te muestra los pasos — '
    'el botón de compartir de Safari y después <b>Agregar a inicio</b>.',
])
S += T('Activar los avisos en ese celular', [
    'Tocá la <b>campana</b>, arriba a la derecha.',
    'Abajo del panel, tocá <b>Activar avisos en este dispositivo</b>.',
    'El celular va a pedir permiso una vez. Aceptalo.',
], aviso='se activa <b>por dispositivo</b>, no por persona: si usás el sistema en el celular y en '
         'la computadora del mostrador, hay que activarlo en cada uno. Y las clientas lo activan '
         'igual, desde la campana de su portal.')

# ── Las tareas ──────────────────────────────────────────────
S += [Paragraph('Las tareas de todos los días', h1)]

S += T('Dar de alta un cliente', [
    '<b>Clientes</b> → <b>Nuevo cliente</b>.',
    'Lo único obligatorio es el nombre. El resto se completa después.',
    'Si ya sabés qué plan lleva, elegilo en <b>Asignar plan</b> y te ahorrás el paso siguiente.',
    '<b>Crear cliente</b>.',
])

S += T('Asignarle o renovarle el plan', [
    'Abrí su ficha → pestaña <b>Membresía</b>.',
    '<b>Asignar membresía</b> si no tiene ninguna, o <b>Renovar membresía</b> si ya la tuvo.',
    'Elegí el plan y tocá <b>Asignar</b>.',
], aviso='antes de confirmar, leé la línea de abajo del cuadro: te dice <b>desde qué día</b> va a '
         'arrancar. Si todavía le queda mes vigente, el nuevo período <b>se encola</b> y empieza '
         'cuando el actual termina — pagar antes no le corta el mes. Y si arriba de la ficha ves '
         '“El próximo período ya está asignado”, ya le cobraste: no le cobres de nuevo.')

S += T('Cobrar una cuota', [
    '<b>Pagos</b> → buscá el nombre → <b>Cobrar pago</b>.',
    'Elegí el <b>método de pago</b>. El monto se ajusta solo y la pantalla te explica el ajuste.',
    'Confirmá. Queda con comprobante numerado y entra a la caja del día.',
], aviso='el monto cambia según cómo pague: efectivo tiene descuento y tarjeta recargo. Lo que '
         'queda guardado es <b>lo que entró de verdad</b>, no el precio de lista.')

S += T('Cobrar algo que no es una cuota', [
    '<b>Pagos</b> → <b>Registrar pago</b>.',
    'Elegí el cliente, escribí el concepto y el monto, y el método.',
    'Confirmá.',
])

S += T('Mandarle el link de pago', [
    'En <b>Pagos</b>, en la fila de esa cuota, tocá <b>Link de pago</b>.',
    'Se copia el mensaje ya escrito, con el link adentro, para pegarlo en WhatsApp.',
], aviso='cuando la clienta paga por ese link, el sistema lo acredita <b>solo</b>: no hay que '
         'marcarlo a mano.')

S += T('Anotar a alguien en una clase', [
    '<b>Agenda</b> → tocá la clase.',
    'En el panel, <b>Anotar a otro cliente…</b> y elegí el nombre.',
    '<b>Reservar lugar</b>.',
], aviso='la clase se le descuenta <b>al reservar</b>, no cuando viene. Si la clase está llena, '
         'queda en lista de espera.')

S += T('Anotar a alguien que llegó sin reserva', [
    'Es lo mismo de arriba, y se puede hacer <b>incluso después de que la clase terminó</b>.',
], aviso='desde el portal la clienta <b>no</b> puede anotarse en una clase que ya empezó — el '
         'sistema se lo impide. Desde el mostrador sí, porque es el caso de quien llegó sin '
         'reserva.')

S += T('Tomar asistencia', [
    '<b>Inicio</b> → <b>Clases de Hoy</b> → <b>Tomar asistencia</b> en la clase que toca. '
    'También se llega desde <b>Reservas</b> o desde la <b>Agenda</b>.',
    'Marcá <b>Presente</b> o <b>Ausente</b> a cada una.',
], aviso='se puede corregir después, incluso al día siguiente. En <b>Reservas</b>, el encabezado '
         'de Hoy te dice cuántas <b>quedan sin marcar</b>.')

S += T('Cancelar una reserva', [
    '<b>Reservas</b> → buscá la fila → el ícono de <b>Cancelar reserva</b>.',
], aviso='si se cancela con <b>más de 3 horas</b> de anticipación, la clase le vuelve. Con menos, '
         'no. Ese plazo lo cambiás en Configuración.')

S += T('Cerrar la caja del día', [
    '<b>Caja</b> → cerrar el día.',
    'Escribí <b>cuánto contaste</b> en efectivo. El resto ya está calculado.',
], aviso='el sistema te muestra cuánto <b>debería haber</b> y la diferencia si no coincide. '
         'Si cerraste por error, se puede <b>Reabrir</b>.')

S += T('Crear el acceso al portal de un cliente', [
    'Abrí su ficha → <b>Crear acceso</b>.',
    'Poné su email y una contraseña. Ella la cambia después desde el portal.',
], aviso='hace falta su email. Desde el portal ve <b>solo lo suyo</b>: su plan, sus clases y la '
         'grilla — nada de nadie más.')

S += T('Cambiar un precio, un horario o un plazo', [
    'Precios y planes: <b>Planes</b> → editar el plan.',
    'Horarios y clases: <b>Agenda</b> → la clase, o <b>Nueva clase</b>.',
    'Plazos y reglas: <b>Configuración</b> → <b>Reglas del negocio</b>.',
], aviso='casi todo número o texto del sistema se cambia desde Configuración, sin pedirnos nada. '
         'Si un parámetro dice <b>“Todavía no rige”</b>, está cargado pero el sistema aún no lo '
         'aplica: eso lo avisa a propósito.')

# ── Los avisos ──────────────────────────────────────────────
S += [Paragraph('Los avisos que el sistema manda solo', h1)]
S += [Paragraph('Una vez por día, temprano, el sistema revisa el estudio y avisa lo que hace falta. '
                'No hay que pedirle nada: pasa solo.', cuerpo)]
S += [tabla([
    ['Qué avisa', 'A quién', 'Por dónde'],
    ['Que a alguien le vence la membresía, con su cuota y el plazo',
     'Al mostrador y <b>a la clienta</b>', 'Campana, celular y mail'],
    ['Los tres recordatorios antes del vencimiento',
     'A la clienta', 'Campana, celular y mail'],
    ['Que una membresía venció sin renovarse', 'Al mostrador y a la clienta',
     'Campana, celular y mail'],
    ['Que una cuota quedó vencida', 'Al mostrador y a la clienta', 'Campana y mail'],
    ['Que entró un pago por Mercado Pago', 'Al mostrador', 'Campana y celular'],
    ['Que se dio de alta un cliente, o que se acreditó un cobro', 'Al mostrador', 'Campana'],
], [78 * mm, 44 * mm, 50 * mm])]

S += [Spacer(1, 8)]
S += [Paragraph('Sobre los mails', tarea)]
S += [Paragraph('Los mails salen a nombre del estudio, con el nombre y los datos que estén '
                'cargados en Configuración — no hay que escribirlos ni copiarlos: el sistema los '
                'arma y los manda. Cuando la cuenta de Mercado Pago está conectada, el mail de '
                'renovación ya lleva el botón para pagar.', cuerpo)]
S += [Paragraph('<b>Y hay algo que hay que saber ahora:</b> para que los mails lleguen a las '
                'clientas hace falta terminar de habilitar el dominio del estudio en el servicio '
                'que los envía. Hasta que eso esté hecho, <b>los mails no salen</b> — y el sistema '
                'no avisa que no salieron. Los avisos de la campana y del celular sí funcionan, '
                'así que mientras tanto esos son el canal. Es un trámite de una vez, no algo que '
                'se rompa.', cuerpo)]

# ── Cuando el sistema dice no ───────────────────────────────
S += [Paragraph('Cuando el sistema dice que no', h1)]
S += [Paragraph('Algunas cosas las rechaza a propósito, y siempre dice por qué. No es un error: '
                'es para que los números no mientan. Esto es lo que puede aparecer y qué hacer.', cuerpo)]
S += [tabla([
    ['Lo que dice', 'Qué pasó y qué hacer'],
    ['No tiene una membresía vigente para el…',
     'Se le venció o nunca tuvo. Asignale el plan desde su ficha y volvé a anotarla.'],
    ['Ya usó las N clases de su plan',
     'Se le agotaron las clases del mes. Renovale la membresía o pasala a un plan más grande.'],
    ['Esa clase ya empezó',
     'Desde el portal no se puede reservar una clase que arrancó. <b>Desde el mostrador sí</b>: '
     'anotala vos.'],
    ['Esa clase se dicta los lunes, y el… es martes',
     'La fecha no coincide con el día de esa clase. Revisá la fecha, o si moviste la clase de día.'],
    ['La clase ya está completa',
     'No hay lugar. Queda en lista de espera y desde <b>Reservas</b> la podés confirmar si se '
     'libera un lugar.'],
    ['El plan… no incluye…',
     'Su plan no habilita esa modalidad. Cambiale el plan por el que corresponde.'],
], [62 * mm, 110 * mm])]

S += [Spacer(1, 14)]
S += [Paragraph('Casa Fe · Manual del mostrador · 10 de septiembre de 2026. '
                'Si algo no se comporta como dice acá, avisá con tres datos: en qué pantalla '
                'estabas, qué hiciste y qué esperabas que pasara.', nota)]

doc.build(S)
print('PDF escrito en', SALIDA)
