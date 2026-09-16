"""
Casa Fe — qué hace el sistema hoy.

El documento que se le pasa al estudio antes de empezar a usarlo. No es
un manual de tareas —ese es `manual-del-mostrador.py`— sino el inventario
de lo que existe y funciona, para que nadie pierda una semana buscando
algo que está, ni espere algo que todavía no.

Por eso tiene una sección final que en un folleto no iría: **lo que el
sistema NO hace todavía**. Un documento que solo enumera virtudes hace
que la primera cosa que falta se reporte como una falla, y arranca la
semana de prueba con desconfianza.

Se genera con: python3 docs/que-hace-el-sistema.py
"""

from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.lib import colors
from reportlab.platypus import (
    SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, KeepTogether,
)

SALIDA = '/Users/matiaslujanw/Desarrollo/sistema-pilates/docs/Casa-Fe-que-hace-el-sistema.pdf'

# La paleta del estudio, la misma de los otros documentos.
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
bajada = E('b', fontSize=10.5, leading=14.5, textColor=GRIS, spaceAfter=8)
# El ritmo va apretado a propósito: son diez secciones y una lista de
# funciones repartida en cinco páginas se lee como un catálogo, no como
# "esto es lo que tenés". Entra en tres.
h1 = E('h1', fontName='Helvetica-Bold', fontSize=12.5, leading=15, textColor=TERRA,
       spaceBefore=10, spaceAfter=3)
intro = E('intro', fontSize=9.5, leading=13.5, textColor=GRIS, spaceAfter=6)
item = E('item', fontSize=9.3, leading=12.6, leftIndent=11, spaceAfter=2.5)
nota = E('n', fontSize=8.8, leading=12.5, textColor=TENUE)
celda = E('celda', fontSize=8.8, leading=12)
celdaB = E('celdaB', fontName='Helvetica-Bold', fontSize=8.8, leading=12)
destacado = E('d', fontSize=9.5, leading=13.5, textColor=TINTA,
              leftIndent=8, rightIndent=8, spaceBefore=4, spaceAfter=4)


def tabla(filas, anchos):
    datos = [[Paragraph(c, celdaB if i == 0 else celda) for c in f] for i, f in enumerate(filas)]
    t = Table(datos, colWidths=anchos, hAlign='LEFT', repeatRows=1)
    t.setStyle(TableStyle([
        ('VALIGN', (0, 0), (-1, -1), 'TOP'),
        ('TOPPADDING', (0, 0), (-1, -1), 4), ('BOTTOMPADDING', (0, 0), (-1, -1), 4),
        ('LEFTPADDING', (0, 0), (-1, -1), 7), ('RIGHTPADDING', (0, 0), (-1, -1), 7),
        ('LINEBELOW', (0, 0), (-1, -2), 0.4, LINEA),
        ('BACKGROUND', (0, 0), (-1, 0), CREMA),
        ('LINEBELOW', (0, 0), (-1, 0), 0.7, TERRA),
    ]))
    return t


def bloque(nombre, lineas):
    """Una sección: su nombre y lo que se puede hacer ahí.

    Entera o en la página siguiente: una lista de funciones partida al
    medio se lee como si la sección terminara antes de tiempo.
    """
    out = [Paragraph(nombre, h1)]
    for l in lineas:
        out.append(Paragraph(f'•&nbsp;&nbsp;{l}', item))
    return [KeepTogether(out)]


def aviso(texto, color=CREMA, borde=TERRA):
    t = Table([[Paragraph(texto, destacado)]], colWidths=[172 * mm], hAlign='LEFT')
    t.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, -1), color),
        ('LINEBEFORE', (0, 0), (0, -1), 2.2, borde),
        ('TOPPADDING', (0, 0), (-1, -1), 8), ('BOTTOMPADDING', (0, 0), (-1, -1), 8),
        ('LEFTPADDING', (0, 0), (-1, -1), 10), ('RIGHTPADDING', (0, 0), (-1, -1), 10),
    ]))
    return t


doc = SimpleDocTemplate(
    SALIDA, pagesize=A4,
    leftMargin=19 * mm, rightMargin=19 * mm, topMargin=17 * mm, bottomMargin=17 * mm,
    title='Casa Fe · Qué hace el sistema', author='Casa Fe',
)

S = [
    Paragraph('Casa Fe — qué hace el sistema', titulo),
    Paragraph('Todo lo que está construido y funcionando, listo para usar desde el primer día. '
              'Al final está lo que todavía no hace, para que nadie lo busque.', bajada),
]

# ── Agenda ──────────────────────────────────────────────────
S += bloque('Agenda, reservas y asistencias', [
    'Grilla semanal con las 64 clases, por profesora, sala y horario.',
    'Reservar un lugar desde la agenda, con el <b>cupo garantizado por el sistema</b>: '
    'no se puede sobrevender una clase aunque dos personas reserven al mismo tiempo.',
    'La clase se descuenta <b>al reservar</b>. Quien no viene y no avisa, ya la perdió: '
    'no hay que marcar nada.',
    '<b>Cancelar con 3 horas de aviso devuelve la clase.</b> Con menos, la pierde. '
    'El sistema lo clasifica solo y el plazo se cambia desde Configuración.',
    '<b>Recuperar una clase perdida</b> en otro horario, con un tope por período '
    'que define el estudio. La recuperación no descuenta otra clase.',
    '<b>Anotar a alguien con la membresía vencida</b>, dejando el motivo escrito y '
    'el nombre de quien lo autorizó. Esa clase no se descuenta de ningún plan.',
    'Suspender un día puntual —un feriado— o cambiar la profesora de esa fecha, '
    'sin tocar la clase entera. A quien tenía reserva le llega el aviso.',
    'Tomar asistencia desde el celular, marcando presente o ausente.',
    'Lista de espera: quien no entra queda anotado, y <b>cuando se libera un lugar '
    'les avisa a todas</b>.',
])

# ── La ficha rápida ─────────────────────────────────────────
S += bloque('Resolver una clienta sin salir de Agenda', [
    'Al elegir a alguien se ve <b>qué plan tiene, hasta cuándo, cuántas clases le quedan '
    'y si debe plata</b>.',
    'Desde ahí mismo: renovarle, cambiarle el plan, cobrarle y correrle el vencimiento.',
    'Mover un vencimiento deja registrado quién lo hizo y por qué.',
    'Si tiene clases perdidas, aparecen para reponerlas en el acto.',
])

# ── Planes ──────────────────────────────────────────────────
S += bloque('Planes, membresías y cobros', [
    'Los seis planes FE, con sus clases, su vigencia y las disciplinas que habilitan.',
    '<b>Tres precios por plan según cómo pague</b>: transferencia el precio de lista, '
    'efectivo 5% menos, tarjeta 25% más. El sistema lo calcula solo al cobrar.',
    'La vigencia es un <b>mes de calendario desde el día que arranca</b>, no 30 días: '
    'quien empieza el 20 de septiembre llega hasta el 19 de octubre.',
    'El pago anticipado <b>se encola</b>: no se le solapa con el mes que está usando.',
    'Cobro en efectivo, transferencia, tarjeta y Mercado Pago, con comprobante numerado.',
    'Anular un cobro con su motivo, sin romper el arqueo del día que ya cerró.',
])

# ── Ficha ───────────────────────────────────────────────────
S += bloque('La ficha de cada clienta', [
    'Datos, contacto, y <b>a quién llamar en una emergencia</b>.',
    '<b>Salud en campos propios</b>: lesiones, embarazo, cirugías y medicación. '
    'Los ve el equipo, incluida la profesora — que es quien está en la clase.',
    '<b>Bitácora de observaciones</b>, con quién la escribió y cuándo. '
    'Es lo único que una profesora puede escribir en el sistema.',
    'Su historial de reservas, distinguiendo la clase común de la recuperada, '
    'la cancelada en plazo de la cancelada tarde.',
    'Sus pagos, su membresía y cuándo vuelve.',
    'Crearle el acceso a su portal desde la misma ficha.',
])

# ── Portal ──────────────────────────────────────────────────
S += bloque('El portal de la clienta, en su celular', [
    'Se registra sola con su email y DNI, si coinciden con su ficha del estudio.',
    'Ve su plan, las clases que le quedan y su historial.',
    'Reserva y cancela, con los cupos en vivo, y entra en lista de espera.',
    'Paga sus deudas online.',
    'Recibe avisos en el momento: le confirmamos una reserva, le recordamos la clase del día, '
    'se suspendió una clase suya, cambió la profesora, se liberó un lugar.',
    '<b>Cada una ve solo lo suyo</b>, garantizado por la base de datos y no por la pantalla.',
])

# ── Plata ───────────────────────────────────────────────────
S += bloque('La plata del estudio', [
    'Caja diaria con apertura, cierre y arqueo. El cierre pide un solo dato: cuánto contaste.',
    'Cuentas y billeteras con su saldo. <b>Mercado Pago vive en la suya</b>: esa plata no entra '
    'al arqueo del cajón.',
    'Gastos con categoría, proveedor, comprobante y cuenta de pago. Un gasto pendiente '
    'no mueve un peso hasta que se paga.',
    'Transferencias entre cuentas, retiros, aportes y devoluciones.',
    'En el inicio: lo que entró y salió en el mes, el resultado y dónde está la plata.',
])

# ── Personal ────────────────────────────────────────────────
S += bloque('Personal, horas y sueldos', [
    'Ficha laboral de cada profesora y <b>qué horarios tiene</b> en la grilla.',
    'Cuánto cobra cada una: por clase, por hora o mensual. <b>Con historial</b>: subirle la '
    'tarifa hoy no cambia lo que se le liquidó el mes pasado.',
    'Las <b>clases dictadas se cuentan solas</b> desde la agenda, con la profesora que dio cada '
    'una y sin las que el estudio suspendió. No hay que cargarlas.',
    'Horas que no son clases —cubrir recepción, una tarea—, y las ausencias y tardanzas.',
    'La liquidación del período, por profesora o todas juntas.',
    'Cerrar el período congela el número, y <b>si después se carga algo el sistema avisa</b> '
    'en vez de cambiarlo por su cuenta.',
    'Registrar el pago: se carga solo como gasto y baja del saldo de la cuenta.',
])

# ── Tablero ─────────────────────────────────────────────────
S += bloque('El inicio, de un vistazo', [
    'Clases de hoy con su ocupación, lugares libres y lista de espera.',
    'Clientas activas, de prueba, por vencer y <b>por recuperar</b> — las que dejaron de venir.',
    'Cobrado hoy, cobrado en el mes, pendiente de cobro, egresos y resultado.',
    'Alertas: a quién le queda una clase, a quién se le vence la membresía, quién debe.',
])

# ── Turnos fijos ────────────────────────────────────────────
S += bloque('Turnos fijos', [
    'El día y hora permanente de cada clienta, visible en su ficha, con <b>hasta cuándo '
    'conserva la prioridad</b>.',
    'La prioridad sale sola del vencimiento de su membresía más los días de gracia: '
    'al renovarle, se corre sola.',
    'En cada clase se ve <b>quién ocupa cada lugar de forma permanente</b>.',
    'Cambiar, liberar o pausar un turno —una clienta que se va de viaje conserva el lugar—.',
    'El sistema avisa a quién se le venció el derecho a su horario, y puede liberarlo solo.',
])

# ── Reportes ────────────────────────────────────────────────
S += bloque('Reportes, todos descargables', [
    '<b>Plata</b>: cobros, deudas por antigüedad, egresos, resultado por mes y cobrado por medio.',
    '<b>Clientas</b>: altas del período y membresías que vencen.',
    '<b>Clases</b>: asistencias y <b>ocupación por clase, franja horaria, día, mes y profesora</b> '
    '— para decidir qué horarios potenciar, reducir o promocionar.',
    'Todos por rango de fechas, y se bajan a Excel y a PDF.',
])

# ── Permisos ────────────────────────────────────────────────
S += bloque('Quién ve qué', [
    'Cada persona entra con su cuenta y ve lo que le corresponde.',
    'La profesora ve su agenda, las clientas, sus datos de salud y escribe en la bitácora. '
    '<b>No ve un peso.</b>',
    'Lo protege la base de datos, no la pantalla: no se puede saltear.',
    'Todo es configurable permiso por permiso, por rol y por persona.',
])

# ── Configuración ───────────────────────────────────────────
S += bloque('Lo que el estudio cambia sin llamarnos', [
    'Las 3 horas del plazo de cancelación, los recuperos por período, los días de gracia '
    'del turno fijo.',
    'Los precios, los planes, las disciplinas y las salas.',
    'Cuándo y con cuánta anticipación salen los avisos.',
    'Las franjas horarias de los reportes.',
    'Los datos del estudio, que la web toma en vivo: cambiás un precio y la web se actualiza sola.',
])

# ── Lo que no hace ──────────────────────────────────────────
S += [Paragraph('Lo que todavía no hace', h1)]
S += [Paragraph('Para que nadie lo busque ni lo reporte como una falla.', intro)]

S += [tabla([
    ['Qué', 'Cuándo'],
    ['<b>Los links de pago de Mercado Pago</b>',
     'Apenas se conecte la cuenta del estudio. Se hace desde Configuración, sin técnico. '
     'Mientras tanto se cobra en efectivo, transferencia y tarjeta normalmente.'],
    ['<b>Los emails automáticos a las clientas</b>',
     'Están escritos y andando, pero hasta verificar el dominio del estudio <b>solo llegan a '
     'la casilla nuestra</b>. Los avisos del portal sí les llegan.'],
    ['<b>Que los avisos suenen en el celular de la clienta</b>',
     'Los ve al entrar a su portal. Que además le vibre el teléfono es el paso siguiente.'],
    ['<b>Que las reservas del turno fijo aparezcan solas cada semana</b>',
     'El turno fijo ya guarda el lugar y se ve en la ficha. Reservar cada fecha se sigue '
     'haciendo como siempre.'],
    ['<b>Congelar una membresía</b>',
     'Esperando la definición del estudio sobre cómo funciona.'],
    ['<b>Inventario y venta de productos</b>',
     'Quedó para una segunda etapa, como se conversó.'],
    ['<b>La web autoadministrable y el email marketing</b>',
     'Segunda etapa. Hoy los planes, los horarios y los datos del estudio ya salen del sistema '
     'a la web en vivo.'],
], [58 * mm, 114 * mm])]

S += [Spacer(1, 8)]
S += [aviso(
    '<b>Esta semana es para probarlo.</b> Si algo no se comporta como dice acá, avisen con tres '
    'datos: en qué pantalla estaban, qué hicieron y qué esperaban que pasara. Con eso se corrige '
    'rápido; sin eso hay que adivinar.'
)]

S += [Spacer(1, 9)]
S += [Paragraph('Casa Fe · Qué hace el sistema · 15 de septiembre de 2026. '
                'Las tareas del día a día, paso por paso, están en el Manual del mostrador.', nota)]

doc.build(S)
print('PDF escrito en', SALIDA)
