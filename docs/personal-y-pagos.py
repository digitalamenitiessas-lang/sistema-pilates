"""
Casa Fe — el personal y sus pagos.

El documento que se le pasa al estudio para poner a punto esa parte. No
es el inventario de funciones —ese es `que-hace-el-sistema.py`— ni las
tareas del día a día —`manual-del-mostrador.py`—: es el único módulo que
NO funciona hasta que alguien carga algo, y por eso necesita su propia
explicación.

Dos cosas que en un folleto no irían y acá son el centro:

  · Que las condiciones de pago son obligatorias. Sin una cargada, la
    liquidación cuenta las clases y da $0. Quien no lo sepa va a creer
    que el módulo está roto.

  · Una lista de lo que NO hay que hacer. Tres de los cuatro errores que
    lista no dan ningún error en pantalla: el sueldo sale dos veces, o una
    profesora desaparece de las liquidaciones, y nadie se enteró. Un
    documento que solo explica el camino feliz deja esos cuatro sin decir.

Se genera con: python3 docs/personal-y-pagos.py
"""

from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.lib import colors
from reportlab.platypus import (
    SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, KeepTogether,
)

SALIDA = '/Users/matiaslujanw/Desarrollo/sistema-pilates/docs/Casa-Fe-personal-y-pagos.pdf'

# La paleta del estudio, la misma de los otros documentos.
TERRA = colors.HexColor('#A9552F')
TINTA = colors.HexColor('#3D2C23')
GRIS = colors.HexColor('#6B5646')
TENUE = colors.HexColor('#8A7A6D')
LINEA = colors.HexColor('#E3D6C8')
CREMA = colors.HexColor('#FBF6F0')
SALVIA = colors.HexColor('#5E7A57')
ALERTA = colors.HexColor('#FDF1E7')

ss = getSampleStyleSheet()


def E(n, **kw):
    base = dict(fontName='Helvetica', fontSize=9.5, leading=13.5, textColor=TINTA)
    base.update(kw)
    return ParagraphStyle(n, parent=ss['Normal'], **base)


titulo = E('t', fontName='Helvetica-Bold', fontSize=20, leading=24, spaceAfter=2)
bajada = E('b', fontSize=10.5, leading=14.5, textColor=GRIS, spaceAfter=8)
h1 = E('h1', fontName='Helvetica-Bold', fontSize=12.5, leading=15, textColor=TERRA,
       spaceBefore=11, spaceAfter=3)
intro = E('intro', fontSize=9.5, leading=13.5, textColor=GRIS, spaceAfter=6)
item = E('item', fontSize=9.3, leading=12.6, leftIndent=11, spaceAfter=2.5)
paso = E('paso', fontSize=9.5, leading=13.2, leftIndent=13, spaceAfter=4)
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


def bloque(nombre, lineas, texto=None):
    out = [Paragraph(nombre, h1)]
    if texto:
        out.append(Paragraph(texto, intro))
    for l in lineas:
        out.append(Paragraph(f'•&nbsp;&nbsp;{l}', item))
    return [KeepTogether(out)]


def seccion(nombre, filas, anchos, texto=None):
    """Título, bajada y tabla, en un solo bloque.

    Sin esto el título se queda al pie de una página y su tabla arranca en
    la siguiente, que se lee como si la sección estuviera vacía. Pasó con
    "Quién ve qué" en la primera versión.
    """
    out = [Paragraph(nombre, h1)]
    if texto:
        out.append(Paragraph(texto, intro))
    out.append(tabla(filas, anchos))
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
    title='Casa Fe · El personal y sus pagos', author='Casa Fe',
)

S = [
    Paragraph('Casa Fe — el personal y sus pagos', titulo),
    Paragraph('Cómo se le paga al equipo: qué hay que cargar antes de que funcione, cómo se '
              'liquida un período y qué conviene no hacer. Al final, lo que todavía no hace.',
              bajada),
]

# ── Lo primero que hay que tener claro ──────────────────────
S += [aviso(
    '<b>El sueldo de una profesora no se carga en Pagos.</b> Pagos es la plata que ENTRA: las '
    'cuotas de las clientas. Lo que se le paga al equipo sale de <b>Personal</b>, y desde ahí '
    'el sistema lo manda solo al libro de caja como un gasto. Son dos pantallas distintas y no '
    'se cruzan.'
)]

# ── Las condiciones de pago ─────────────────────────────────
S += [Spacer(1, 4)]
S += bloque(
    '1. Las condiciones de pago — sin esto el módulo no calcula nada',
    [
        'Se cargan en <b>Personal → Condiciones de pago</b>, una por persona.',
        '<b>Por clase dictada</b>: un monto por cada clase que dio. Las clases las cuenta la '
        'agenda sola, no hay que cargarlas.',
        '<b>Por hora trabajada</b>: un monto por hora, sobre las horas que se cargan a mano.',
        '<b>Mensual fijo</b>: un sueldo por mes.',
        'Si una persona tiene más de una modalidad cargada, <b>se suman</b>. Por ejemplo un '
        'fijo más un extra por clase.',
        'El <b>mensual se reparte por los días del período</b> que se liquida: si se cierran '
        'dos quincenas por separado, cada una paga la mitad. Entre las dos pagan un sueldo, '
        'no dos.',
        'Cada clase se paga con <b>la tarifa que regía el día de esa clase</b>. Subir la tarifa '
        'hoy no cambia lo que se liquidó el mes pasado.',
    ],
    texto='Es lo único que hay que cargar antes de empezar, y es obligatorio: '
          '<b>sin una condición cargada, la liquidación cuenta las clases y da $0.</b> '
          'El sistema no inventa una tarifa, y esa pantalla lo avisa.',
)

S += [Spacer(1, 5)]
S += [aviso(
    '<b>Una condición no se edita ni se borra.</b> Se carga la que rige desde una fecha, y la '
    'anterior queda cerrada sola — es lo que hace que subir una tarifa hoy no cambie el pasado. '
    'Por eso, antes de guardar, el sistema muestra en una frase a quién, cuánto y desde cuándo, '
    'y hay que confirmar. <b>Conviene leer el nombre:</b> la lista está en orden alfabético y la '
    'primera no siempre es la que se busca. Si queda mal, la única salida es cargar otra desde '
    'una fecha posterior, y las dos quedan en el historial.',
    color=ALERTA,
)]

# ── Las horas ───────────────────────────────────────────────
S += bloque(
    '2. Las horas trabajadas — solo lo que no es clase',
    [
        'Se cargan en <b>Personal → Horas trabajadas</b>: fecha, persona, cuántas horas y un '
        'detalle.',
        '<b>Las clases dictadas no se cargan acá.</b> Salen de la agenda: lo que hay que tener '
        'al día es la agenda, no una planilla de horas.',
        'Sirve para lo demás: cubrir recepción, una capacitación, una limpieza, una reunión.',
        'También se registra una <b>ausencia</b> (no vino, cero horas) o una <b>tardanza</b> '
        '(vino tarde, se cargan las horas que hizo). Las dos aparecen contadas al lado del '
        'nombre en la liquidación.',
    ],
)

# ── Los reemplazos ──────────────────────────────────────────
S += bloque(
    '3. Los reemplazos — se le paga a quien dio la clase',
    [
        'Se cargan en la <b>agenda</b>, cambiando la profesora de esa fecha puntual. No hay que '
        'tocar nada en Personal.',
        'El sistema le cuenta esa clase <b>a quien la dio</b>, no a la titular del horario. '
        'A quien tenía reserva le llega el aviso del cambio, y a las dos profesoras también.',
        '<b>Si una clase no se dictó, hay que suspenderla ese día en la agenda.</b> Una clase '
        'suspendida no se le paga a nadie y no se le descuenta a ninguna clienta.',
    ],
)

# ── Los ajustes ─────────────────────────────────────────────
S += bloque(
    '4. Los ajustes manuales — lo que el cálculo no puede saber',
    [
        'Se cargan en <b>Personal → Ajustes manuales</b>: un premio, un descuento, un adelanto, '
        'la corrección de un mes anterior.',
        'Se elige si <b>le suma</b> o <b>le resta</b>, con el monto en positivo. No hay que '
        'escribir un signo menos.',
        '<b>El motivo es obligatorio</b> y el sistema no guarda el ajuste sin él. Es lo que va a '
        'explicar ese número dentro de seis meses.',
        'Entra en el período que contiene su fecha, igual que las horas.',
        'Una vez que el período se cerró, el ajuste <b>ya no se puede tocar</b>. Para corregirlo '
        'hay que anular esa liquidación primero.',
    ],
)

# ── Liquidar ────────────────────────────────────────────────
S += seccion('5. Liquidar y pagar — tres pasos', [
    ['Paso', 'Qué hace', 'Qué pasa después'],
    ['<b>1. Mirar</b>',
     'Elegir el período y leer el cálculo: clases dictadas, horas, mensual, ajustes y total, '
     'por persona.',
     'Nada. Mirar no compromete: se puede ver cuantas veces se quiera, y el número se '
     'recalcula solo si algo cambia.'],
    ['<b>2. Cerrar</b>',
     'El botón <b>Cerrar</b> en la fila de esa persona. Congela el número de ese período.',
     'Ese número ya no cambia aunque después se carguen clases u horas. El período queda '
     'reservado: <b>no se puede cerrar dos veces</b>, y el sistema lo rechaza si se intenta.'],
    ['<b>3. Pagar</b>',
     'El botón <b>Registrar el pago</b>, eligiendo con qué se paga y de qué cuenta sale.',
     '<b>Acá sale la plata.</b> El sistema carga solo el gasto en "Sueldos y honorarios" y lo '
     'imputa a la cuenta elegida, así aparece en el libro de caja.'],
], [24 * mm, 68 * mm, 80 * mm],
    texto='Todo en <b>Personal → Liquidación del período</b>, eligiendo desde y hasta arriba '
          'de la pantalla.')

S += [Spacer(1, 5)]
S += bloque(
    'Y si algo salió mal',
    [
        'Una liquidación cerrada se puede <b>anular</b>, dejando el motivo escrito. Eso libera '
        'el período para volver a cerrarlo.',
        'Si ya se había pagado, hay que anular <b>primero el gasto</b> en Gastos y después la '
        'liquidación.',
        'En <b>Liquidaciones cerradas</b> queda el historial de todo lo liquidado, con su estado: '
        'cerrada, pagada o anulada.',
    ],
)

# ── Lo que no hay que hacer ─────────────────────────────────
S += seccion('6. Cuatro cosas que conviene no hacer', [
    ['No hacer', 'Por qué'],
    ['<b>Cargar el sueldo a mano en Gastos</b>',
     'El botón "Registrar el pago" ya lo carga. Si además se carga a mano, <b>el sueldo sale dos '
     'veces del libro de caja</b> y los dos gastos son legítimos para el sistema.'],
    ['<b>Dar de baja del catálogo a una profesora que se va</b>',
     'Hay que ponerle la <b>fecha de baja</b> en su ficha. Si se la desactiva del catálogo sin '
     'esa fecha, <b>desaparece de todas las liquidaciones</b>, también de las de los meses en '
     'que sí trabajó, y no hay ningún cartel que lo avise.'],
    ['<b>Cerrar un período que todavía no terminó</b>',
     'El cálculo proyecta las clases de la grilla, así que un período que incluye días futuros '
     '<b>paga clases que no se dieron</b>. Conviene cerrar cuando el período terminó.'],
    ['<b>Borrar horas de un período ya cerrado</b>',
     'Las horas se borran sin aviso, también las de un período pagado. Eso cambia lo que el '
     'sistema dice que ese período daría hoy, y la única señal es un cartel de diferencia.'],
], [58 * mm, 114 * mm],
    texto='Ninguna de las cuatro da un error en pantalla. Por eso están acá.')

# ── Quién ve qué ────────────────────────────────────────────
S += seccion('7. Quién ve qué', [
    ['', 'Ve', 'No ve'],
    ['<b>Administradora</b>',
     'Todo: condiciones de pago, liquidaciones, ajustes, cierres y el pago.',
     '—'],
    ['<b>Recepción</b>',
     'Las fichas del equipo, sus horarios y las horas trabajadas. Puede cargar horas.',
     'Ningún monto: ni las tarifas, ni la liquidación, ni los cierres. La pantalla se lo dice, '
     'no le muestra un cero.'],
    ['<b>Profesora</b>',
     'Su agenda, la ocupación de las clases y las reservas de <b>sus</b> clases. Pasa lista.',
     'Nada de esta pantalla. Tampoco su propia liquidación, todavía.'],
], [30 * mm, 76 * mm, 66 * mm])

# ── Lo que todavía no hace ──────────────────────────────────
S += seccion('8. Lo que todavía no hace', [
    ['Qué falta', 'Mientras tanto'],
    ['<b>Que cada profesora vea su propia liquidación</b>',
     'Es lo próximo del módulo. Hoy los montos los ve solo la administración.'],
    ['<b>Un recibo o comprobante imprimible</b>',
     'La liquidación cerrada guarda el total y el desglose, y el pago queda en el libro de caja '
     'con su comprobante.'],
    ['<b>Horario de entrada y de salida en las horas</b>',
     'Hoy se carga el total de horas del día, más el detalle escrito.'],
    ['<b>Comisión por venta de productos</b>',
     'Depende del módulo de inventario, que quedó para una segunda etapa.'],
    ['<b>Un aviso si quedan días sin liquidar entre dos cierres</b>',
     'El sistema impide que dos períodos se pisen, pero no marca los huecos. Conviene cerrar '
     'períodos que se continúan: del 1 al 15 y del 16 al 30.'],
    ['<b>Corregir una tarifa mal cargada</b>',
     'Se carga la correcta desde una fecha posterior. Las dos quedan en el historial, que es '
     'justamente lo que pidieron que no se pierda.'],
], [58 * mm, 114 * mm],
    texto='Está en la lista de trabajo, y se avisa para que nadie lo busque.')

S += [Spacer(1, 8)]
S += [aviso(
    '<b>Para arrancar alcanza con un paso:</b> cargar una condición de pago por cada persona del '
    'equipo. Con eso el módulo ya calcula, y el resto —horas, ajustes, cierres— se usa cuando '
    'haga falta. Si algo no se comporta como dice acá, avisen con tres datos: en qué pantalla '
    'estaban, qué hicieron y qué esperaban que pasara.',
    color=CREMA, borde=SALVIA,
)]

S += [Spacer(1, 9)]
S += [Paragraph('Casa Fe · El personal y sus pagos · 17 de septiembre de 2026. '
                'El inventario completo del sistema está en "Qué hace el sistema"; las tareas '
                'del día a día, en el Manual del mostrador.', nota)]

doc.build(S)
print('PDF escrito en', SALIDA)
