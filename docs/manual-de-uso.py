"""
Genera el manual de uso de Casa Fe en PDF, con la identidad de la marca.

Se corre a mano:  python3 docs/manual-de-uso.py

El contenido NO vive acá: sale de `docs/manual-de-uso-contenido.json`, que es lo
que escribieron y verificaron los agentes leyendo el código pantalla por
pantalla. Este archivo es solo el diseño. Separarlos es a propósito: corregir
una frase del manual no tiene que obligar a tocar el maquetado, y rehacer el
maquetado no tiene que poner en riesgo el texto que ya se revisó.

Las capturas salen de `docs/manual-capturas/`, generadas con Chrome headless a
doble densidad contra el sistema real, con sesión de administradora.

TIPOGRAFÍA. Montserrat es la de la marca y es libre, así que va tal cual, en
sus cuatro pesos. La Bauer Bodoni de los titulares es comercial y no se puede
incrustar en un PDF — pero para el logotipo no hace falta: se usa el PNG que
mandó la clienta, que es la Bodoni real, recoloreado desde su canal alfa
porque el archivo original viene en el natural de la paleta y sobre el fondo
natural sería invisible.
"""

import json
import os
import re

from reportlab.lib import colors
from reportlab.lib.enums import TA_LEFT
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.units import mm
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.lib.fonts import addMapping
from reportlab.platypus import (
    BaseDocTemplate, Flowable, Frame, Image, KeepTogether, NextPageTemplate,
    PageBreak, PageTemplate, Paragraph, Spacer, Table, TableStyle,
)
from reportlab.platypus.tableofcontents import TableOfContents

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DOCS = os.path.join(RAIZ, 'docs')
RECURSOS = os.path.join(DOCS, 'manual-recursos')
CAPTURAS = os.path.join(DOCS, 'manual-capturas')
CONTENIDO = os.path.join(DOCS, 'manual-de-uso-contenido.json')
SALIDA = os.path.join(DOCS, 'Casa-Fe-manual-de-uso.pdf')

# ------------------------------------------------------------------
# La paleta, exacta. Son los cuatro colores del manual de marca y nada
# más: los dos grises salen de bajarle opacidad al negro sobre el
# natural, no de inventar un quinto color.
# ------------------------------------------------------------------
NATURAL = colors.HexColor('#e1dfdb')
MARRON = colors.HexColor('#847164')
VERDE = colors.HexColor('#bcbaae')
NEGRO = colors.HexColor('#000000')
TENUE = colors.HexColor('#5a534d')   # negro al 65% sobre el natural: 6,2:1
LINEA = colors.HexColor('#c9c5bf')

ANCHO, ALTO = A4
MARGEN = 20 * mm
COLUMNA = ANCHO - 2 * MARGEN
PROPORCION_CAPTURA = 1093 / 1700


def registrar_fuentes():
    for nombre, arch in [
        ('Mont', 'Montserrat-Regular.ttf'),
        ('Mont-Med', 'Montserrat-Medium.ttf'),
        ('Mont-Semi', 'Montserrat-SemiBold.ttf'),
        ('Mont-Bold', 'Montserrat-Bold.ttf'),
    ]:
        pdfmetrics.registerFont(TTFont(nombre, os.path.join(RECURSOS, arch)))
    # Para que <b> dentro de un párrafo tome la negrita de verdad.
    addMapping('Mont', 0, 0, 'Mont')
    addMapping('Mont', 1, 0, 'Mont-Semi')


TAGS_OK = re.compile(r'</?(b|i|u|br\s*/?|sub|super)>', re.I)


def limpiar(texto):
    """
    Deja pasar las negritas y escapa el resto.

    El texto lo escribieron agentes leyendo la pantalla, así que trae cosas
    como "Bienestar & Movimiento" o "<8 lugares". Un `&` suelto o un `<` que no
    abre una etiqueta conocida hacen que reportlab dibuje el párrafo mal o
    directamente no genere el PDF, y eso aparecería recién al final, con el
    manual armado. Más barato prevenirlo acá.
    """
    marcas = []

    def guardar(m):
        marcas.append(m.group(0))
        return '\x00%d\x00' % (len(marcas) - 1)

    t = TAGS_OK.sub(guardar, texto)
    t = t.replace('&', '&amp;').replace('<', '&lt;').replace('>', '&gt;')
    for i, marca in enumerate(marcas):
        t = t.replace('\x00%d\x00' % i, marca)
    return t


def P(texto, estilo):
    """Un párrafo, siempre por el filtro."""
    return Paragraph(limpiar(texto), estilo)


def E(nombre, **kw):
    base = dict(fontName='Mont', fontSize=9.3, leading=14.2, textColor=NEGRO,
                alignment=TA_LEFT)
    base.update(kw)
    return ParagraphStyle(nombre, **base)


def texto_track(canvas, x, y, texto, fuente, tam, color, track):
    """
    Texto con aire entre letras, que es el gesto de la marca.

    Va por un objeto de texto y no por `drawString` porque la separación entre
    letras la maneja el objeto de texto, no el lienzo.
    """
    t = canvas.beginText(x, y)
    t.setFont(fuente, tam)
    t.setFillColor(color)
    t.setCharSpace(track)
    t.textLine(texto)
    canvas.drawText(t)


def ancho_track(texto, fuente, tam, track):
    return pdfmetrics.stringWidth(texto, fuente, tam) + track * max(0, len(texto) - 1)


class Rotulo(Flowable):
    """
    El gesto de la marca: Montserrat en mayúsculas, con aire entre letras.

    Va como Flowable propio porque reportlab no sabe separar letras dentro de
    un párrafo: hay que dibujarlo con un objeto de texto.
    """

    def __init__(self, texto, tam=7.2, color=MARRON, track=1.7, fuente='Mont-Semi'):
        Flowable.__init__(self)
        self.texto, self.tam, self.color, self.track, self.fuente = (
            texto.upper(), tam, color, track, fuente)

    def wrap(self, disponible, alto):
        return (disponible, self.tam * 1.25)

    def draw(self):
        texto_track(self.canv, 0, 2, self.texto, self.fuente, self.tam,
                    self.color, self.track)


class Filete(Flowable):
    """Una línea fina, del ancho que se le pida."""

    def __init__(self, ancho=COLUMNA, color=LINEA, grosor=0.6):
        Flowable.__init__(self)
        self.ancho, self.color, self.grosor = ancho, color, grosor

    def wrap(self, disponible, alto):
        return (self.ancho, self.grosor)

    def draw(self):
        self.canv.setStrokeColor(self.color)
        self.canv.setLineWidth(self.grosor)
        self.canv.line(0, 0, self.ancho, 0)


def fondo(canvas, doc):
    """El natural de la marca en toda la página, y el pie."""
    canvas.saveState()
    canvas.setFillColor(NATURAL)
    canvas.rect(0, 0, ANCHO, ALTO, stroke=0, fill=1)

    if canvas.getPageNumber() > 1:
        texto_track(canvas, MARGEN, 12 * mm, 'CASA FE  ·  MANUAL DE USO',
                    'Mont-Med', 6.6, TENUE, 1.3)
        canvas.setFont('Mont-Semi', 8)
        canvas.setFillColor(MARRON)
        canvas.drawRightString(ANCHO - MARGEN, 12 * mm, str(canvas.getPageNumber()))
        canvas.setStrokeColor(LINEA)
        canvas.setLineWidth(0.6)
        canvas.line(MARGEN, 16 * mm, ANCHO - MARGEN, 16 * mm)
    canvas.restoreState()


def portada(canvas, doc):
    canvas.saveState()
    canvas.setFillColor(NATURAL)
    canvas.rect(0, 0, ANCHO, ALTO, stroke=0, fill=1)

    logo = os.path.join(RECURSOS, 'logo-negro.png')
    ancho_logo = 62 * mm
    canvas.drawImage(logo, (ANCHO - ancho_logo) / 2, ALTO - 118 * mm,
                     width=ancho_logo, height=ancho_logo * 597 / 908, mask='auto')

    def centrado(texto, y, fuente, tam, color, track=0):
        x = (ANCHO - ancho_track(texto, fuente, tam, track)) / 2
        texto_track(canvas, x, y, texto, fuente, tam, color, track)

    centrado('PILATES STUDIO', ALTO - 74 * mm, 'Mont-Semi', 8.4, TENUE, 3.2)
    centrado('MANUAL DE USO DEL SISTEMA', ALTO - 143 * mm, 'Mont-Semi', 12, MARRON, 3.4)

    canvas.setStrokeColor(MARRON)
    canvas.setLineWidth(0.8)
    canvas.line(ANCHO / 2 - 26 * mm, ALTO - 152 * mm, ANCHO / 2 + 26 * mm, ALTO - 152 * mm)

    centrado('Todo lo que hace el sistema, pantalla por pantalla,', ALTO - 166 * mm, 'Mont', 10, NEGRO)
    centrado('con lo que conviene saber antes de tocar cada botón.', ALTO - 172.5 * mm, 'Mont', 10, NEGRO)
    centrado('SETIEMBRE 2026', 30 * mm, 'Mont-Med', 7.4, TENUE, 2.6)
    canvas.restoreState()


class Manual(BaseDocTemplate):
    """
    Existe como clase solo para el índice: reportlab lo arma en una segunda
    pasada, y cada título se anota a sí mismo cuando termina de dibujarse.
    """

    def afterFlowable(self, flowable):
        if isinstance(flowable, Paragraph) and flowable.style.name == 'tituloIndexado':
            self.notify('TOCEntry', (0, flowable.getPlainText(), self.page))


def caja_aviso(items, estilo, titulo='Ojo con esto'):
    """
    Las trampas, en una caja aparte. Verde claro de la marca con una barra
    marrón a la izquierda: se tiene que poder saltear el cuerpo y leer solo
    estas cajas, porque son lo que evita el error caro.
    """
    # Una fila por aviso, y no todo en una celda: hay pantallas con dieciocho
    # advertencias y una celda sola no se puede partir, así que la caja no
    # entraba en la página y el documento no se generaba. Partida por filas, la
    # caja sigue de largo en la página siguiente con su fondo y su barra.
    filas = [[Rotulo(titulo, tam=6.8)]]
    # La viñeta va por `bulletText` y no pegada al texto: así cuelga, los
    # renglones que siguen quedan alineados bajo la primera letra, y —sobre
    # todo— no pasa por `limpiar`, que le escapaba el `&` de su propio
    # `&nbsp;` y terminaba imprimiendo el código en vez del espacio.
    filas += [[Paragraph(limpiar(texto), estilo, bulletText='•')] for texto in items]
    t = Table(filas, colWidths=[COLUMNA], repeatRows=0)
    t.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, -1), VERDE),
        ('LINEBEFORE', (0, 0), (0, -1), 2.2, MARRON),
        ('LEFTPADDING', (0, 0), (-1, -1), 9),
        ('RIGHTPADDING', (0, 0), (-1, -1), 9),
        ('TOPPADDING', (0, 0), (0, 0), 8),
        ('TOPPADDING', (0, 1), (-1, -1), 0),
        ('BOTTOMPADDING', (0, 0), (0, 0), 5),
        ('BOTTOMPADDING', (0, 1), (-1, -2), 5),
        ('BOTTOMPADDING', (0, -1), (-1, -1), 9),
        ('VALIGN', (0, 0), (-1, -1), 'TOP'),
    ]))
    return t


def dos_columnas(filas, est_nombre, est_texto, ancho_izq=46 * mm):
    t = Table([[P(a, est_nombre), P(b, est_texto)] for a, b in filas],
              colWidths=[ancho_izq, COLUMNA - ancho_izq])
    t.setStyle(TableStyle([
        ('VALIGN', (0, 0), (-1, -1), 'TOP'),
        ('LEFTPADDING', (0, 0), (-1, -1), 0),
        ('RIGHTPADDING', (0, 0), (0, -1), 6),
        ('TOPPADDING', (0, 0), (-1, -1), 4),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 5),
        ('LINEBELOW', (0, 0), (-1, -2), 0.5, LINEA),
    ]))
    return t


def pasos(lista, estilo_num, estilo_paso):
    t = Table([[Paragraph(str(i + 1), estilo_num), P(p, estilo_paso)]
               for i, p in enumerate(lista)],
              colWidths=[7 * mm, COLUMNA - 7 * mm])
    t.setStyle(TableStyle([
        ('VALIGN', (0, 0), (-1, -1), 'TOP'),
        ('LEFTPADDING', (0, 0), (-1, -1), 0),
        ('RIGHTPADDING', (0, 0), (-1, -1), 0),
        ('TOPPADDING', (0, 0), (-1, -1), 1.5),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 3.5),
    ]))
    return t


def construir(secciones, antes=(), despues=(), salida=SALIDA, con_portada=True,
              con_indice=True):
    """
    `con_portada=False` y `con_indice=False` existen para revisar el interior:
    el único visor de PDF de esta máquina muestra la primera página, así que sin
    esas opciones no hay forma de mirar una página de contenido.
    """
    registrar_fuentes()

    cuerpo = E('cuerpo', spaceAfter=5)
    entrada = E('entrada', fontSize=10.4, leading=16, spaceAfter=8)
    titulo_ix = E('tituloIndexado', fontName='Mont-Bold', fontSize=19, leading=23,
                  textColor=NEGRO, spaceAfter=8)
    h_parte = E('parte', fontName='Mont-Semi', fontSize=9.3, leading=13, spaceAfter=1)
    p_parte = E('parteTexto', fontSize=9, leading=13.2, textColor=TENUE)
    h_tarea = E('tarea', fontName='Mont-Semi', fontSize=10.4, leading=14,
                textColor=MARRON, spaceBefore=11, spaceAfter=4)
    paso = E('paso', fontSize=9.2, leading=13.6)
    num = E('num', fontName='Mont-Semi', fontSize=9.2, leading=13.6, textColor=MARRON)
    ojo = E('ojo', fontSize=8.8, leading=13, textColor=NEGRO)
    aviso = E('avisoTexto', fontSize=8.8, leading=13, leftIndent=11, bulletIndent=0,
              bulletFontName='Mont', bulletFontSize=8.8)

    doc = Manual(
        salida, pagesize=A4,
        leftMargin=MARGEN, rightMargin=MARGEN, topMargin=MARGEN, bottomMargin=24 * mm,
        title='Casa Fe — Manual de uso del sistema',
        author='Casa Fe', subject='Manual de uso del sistema de gestión',
    )
    marco = Frame(MARGEN, 24 * mm, COLUMNA, ALTO - MARGEN - 24 * mm, id='cuerpo',
                  leftPadding=0, rightPadding=0, topPadding=0, bottomPadding=0)
    doc.addPageTemplates([
        PageTemplate(id='portada', frames=[marco], onPage=portada if con_portada else fondo),
        PageTemplate(id='normal', frames=[marco], onPage=fondo),
    ])

    hist = [NextPageTemplate('normal'), PageBreak()] if con_portada else []

    if con_indice:
        ix = TableOfContents()
        ix.levelStyles = [E('ix', fontName='Mont-Med', fontSize=10.6, leading=21,
                            textColor=NEGRO, firstLineIndent=0, leftIndent=0)]
        ix.dotsMinLevel = 0
        hist += [Rotulo('Qué hay adentro'), Spacer(1, 7),
                 Paragraph('Índice', E('h', fontName='Mont-Bold', fontSize=19,
                                       leading=23, textColor=NEGRO, spaceAfter=9)),
                 Filete(), Spacer(1, 12), ix, PageBreak()]

    def pagina_suelta(p):
        bloque = [Rotulo(p['rotulo']), Spacer(1, 7),
                  P(p['titulo'], titulo_ix), Filete(), Spacer(1, 11)]
        for parrafo in p.get('parrafos', []):
            bloque.append(P(parrafo, entrada))
        for lista in p.get('listas', []):
            bloque += [Spacer(1, 7), Rotulo(lista['titulo']), Spacer(1, 7),
                       dos_columnas([(i['nombre'], i['texto']) for i in lista['items']],
                                    h_parte, p_parte),
                       Spacer(1, 5)]
        if p.get('avisos'):
            bloque += [Spacer(1, 9), caja_aviso(p['avisos'], aviso)]
        return bloque + [PageBreak()]

    for p in antes:
        hist += pagina_suelta(p)

    for i, s in enumerate(secciones):
        bloque = [
            Rotulo('Pantalla %d de %d' % (i + 1, len(secciones))),
            Spacer(1, 7),
            P(s['nombre'], titulo_ix),
            Filete(),
            Spacer(1, 9),
            P('<b>%s</b>' % s['queEs'], entrada),
            P(s['cuandoSeUsa'], cuerpo),
        ]

        captura = os.path.join(CAPTURAS, s['key'] + '.jpg')
        if os.path.exists(captura):
            bloque += [Spacer(1, 8),
                       Image(captura, width=COLUMNA, height=COLUMNA * PROPORCION_CAPTURA),
                       Spacer(1, 10)]

        if s.get('partes'):
            bloque += [Rotulo('Qué hay en la pantalla'), Spacer(1, 7),
                       dos_columnas([(p['nombre'], p['queMuestra']) for p in s['partes']],
                                    h_parte, p_parte),
                       Spacer(1, 4)]
        hist += bloque

        if s.get('tareas'):
            hist += [Spacer(1, 8), Rotulo('Cómo se hace'), Spacer(1, 2)]
            for tarea in s['tareas']:
                sub = [P(tarea['titulo'], h_tarea),
                       pasos(tarea['pasos'], num, paso)]
                if tarea.get('ojo'):
                    sub += [Spacer(1, 3), P('<b>Ojo:</b> ' + tarea['ojo'], ojo)]
                hist.append(KeepTogether(sub))

        if s.get('avisos'):
            hist += [Spacer(1, 12), caja_aviso(s['avisos'], aviso)]

        hist.append(PageBreak())

    for p in despues:
        hist += pagina_suelta(p)

    while hist and isinstance(hist[-1], PageBreak):
        hist.pop()

    # `multiBuild` y no `build`: el índice necesita una segunda pasada para
    # saber en qué página terminó cada pantalla.
    doc.multiBuild(hist)
    return salida


if __name__ == '__main__':
    with open(CONTENIDO, encoding='utf-8') as f:
        datos = json.load(f)
    ruta = construir(datos['secciones'], datos.get('antes', []), datos.get('despues', []))
    print('generado:', ruta, '(%.0f KB)' % (os.path.getsize(ruta) / 1024))
