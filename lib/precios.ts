/**
 * La cuenta del cobro, como la hace la base.
 *
 * Quien cobra es `cobrar_cuota()` y el monto se escribe allá: esto es la
 * vista previa, lo que la pantalla le anticipa a quien está en el
 * mostrador antes de apretar "Confirmar". Por eso tiene que dar
 * EXACTAMENTE lo mismo que `precio_de_cobro()` (0086) —o, si esa
 * migración todavía no corrió, lo mismo que la cuenta de la 0079—, y no
 * "casi": un número anticipado que la base después corrige es una
 * promesa rota delante de la persona que paga.
 *
 * Por lo mismo, las cuentas van en enteros y no en coma flotante. La base
 * calcula en `numeric`, que es exacto; en JavaScript 70.000 × 0,97 da
 * 67.900,00000000001, y en el borde de un redondeo esa diferencia cambia
 * el resultado. Acá cada monto se lleva a diezmilmillonésimas de peso
 * (centavos × 10⁸), que alcanza para el producto de dos porcentajes con
 * dos decimales sin perder nada, y en BigInt, que no tiene tope.
 *
 * Sin dependencias a propósito: se prueba contra la base con node, sin
 * levantar la app.
 */

/**
 * Cómo combina la base la promo con el ajuste del medio.
 *
 * - `respeta_recargo` (0086): el recargo va encima del precio con la
 *   promo; el descuento del medio no se suma, queda el mayor.
 * - `reemplaza` (0079): la promo reemplaza al ajuste del medio, sea
 *   descuento o recargo.
 */
export type ReglaDelCobro = 'respeta_recargo' | 'reemplaza'

export interface PromoDelCobro {
  tipo: 'porcentaje' | 'monto'
  valor: number
}

export interface PrecioDeCobro {
  /** Lo que se cobra. */
  cobrado: number
  /**
   * Lo mismo que la base guarda en `payments.descuento`: con promo, lo
   * que descontó la promo; sin promo, lo que hizo el medio (negativo si
   * recargó).
   */
  descuento: number
  /** Si la promo se aplica. Cuando no gana, el cobro sale sin ella y no gasta el uso. */
  aplicaPromo: boolean
  /** El precio con la promo, redondeado y antes del recargo. Nulo si la promo no se aplica. */
  conPromo: number | null
  /** Lo que el recargo del medio suma encima del precio con la promo. Cero si no hay. */
  recargo: number
}

// Las constantes van con `BigInt(...)` y no como literales `10n`: el
// proyecto compila con `target: ES6`, que no acepta la sintaxis.
const CERO = BigInt(0)
const UNO = BigInt(1)
const DOS = BigInt(2)
const CINCUENTA = BigInt(50)
const CIEN = BigInt(100)
/** 10⁴: el 100% en centésimos de punto, y el paso de centavos × 10⁴. */
const DIEZ_MIL = BigInt(10000)
/** Una unidad de cuenta es la diezmilmillonésima de peso. */
const POR_CENTAVO = BigInt(100000000)
const POR_PESO = POR_CENTAVO * CIEN

/**
 * Pesos (con hasta dos decimales, como `numeric(12,2)`) a centavos exactos.
 * `BigInt(NaN)` tira una excepción, y en medio de un render eso deja el
 * modal en blanco: un dato que no es número cuenta como cero.
 */
function aCentavos(pesos: number): bigint {
  return Number.isFinite(pesos) ? BigInt(Math.round(pesos * 100)) : CERO
}

/** Un porcentaje con hasta dos decimales (−5, 25, 12,5) a centésimos: −500, 2500, 1250. */
function aCentesimos(pct: number): bigint {
  return Number.isFinite(pct) ? BigInt(Math.round(pct * 100)) : CERO
}

/** Unidades a pesos. Sólo se llama con múltiplos de un centavo, así que no pierde nada. */
function aPesos(unidades: bigint): number {
  return Number(unidades / POR_CENTAVO) / 100
}

/** Cociente redondeado con la mitad para afuera del cero, como `round()` de Postgres. */
function divRedondeando(n: bigint, d: bigint): bigint {
  const neg = n < CERO
  const a = neg ? -n : n
  const q = (DOS * a + d) / (DOS * d)
  return neg ? -q : q
}

/** Cociente redondeado hacia arriba, como `ceil()`. */
function divHaciaArriba(n: bigint, d: bigint): bigint {
  if (n >= CERO) return (n + d - UNO) / d
  return -((-n) / d)
}

/** `redondear_precio()` de la base (0086), que es el `case` de siempre (0028, 0079). */
function redondear(unidades: bigint, modo: string): bigint {
  switch (modo) {
    case 'cien':        return divRedondeando(unidades, CIEN * POR_PESO) * CIEN * POR_PESO
    case 'cien_arriba': return divHaciaArriba(unidades, CIEN * POR_PESO) * CIEN * POR_PESO
    case 'ninguno':     return divRedondeando(unidades, POR_CENTAVO) * POR_CENTAVO
    // 'cincuenta' es el default y el que deja intacta la lista de precios
    // publicada: sus doce valores son múltiplos de 50. Un valor que no se
    // reconoce también cae acá, igual que en la base.
    default:            return divRedondeando(unidades, CINCUENTA * POR_PESO) * CINCUENTA * POR_PESO
  }
}

/** El precio de lista multiplicado por (1 + pct/100), en unidades. */
function conAjuste(listaCent: bigint, pctCent: bigint): bigint {
  // centavos × 10⁸ × (10000 + pct) / 10000 = centavos × 10⁴ × (10000 + pct)
  return listaCent * DIEZ_MIL * (DIEZ_MIL + pctCent)
}

/** El precio con la promo y sin ningún ajuste, en unidades. Nunca negativo. */
function conLaPromo(listaCent: bigint, promo: PromoDelCobro): bigint {
  const u =
    promo.tipo === 'porcentaje'
      ? listaCent * DIEZ_MIL * (DIEZ_MIL - aCentesimos(promo.valor))
      : (listaCent - aCentavos(promo.valor)) * POR_CENTAVO
  return u < CERO ? CERO : u
}

/**
 * Lo que la base va a cobrar por una cuota.
 *
 * Espejo de `precio_de_cobro()` (0086) con `regla = 'respeta_recargo'`, y
 * de la cuenta de `cobrar_cuota()` de la 0079 con `regla = 'reemplaza'`.
 * Hace la cuenta con UNA promo; cuál se prueba primero y cuál después lo
 * decide `cobroDeLaBase`, que es lo que usa la pantalla.
 */
export function precioDeCobro(
  lista: number,
  ajustePct: number,
  promo: PromoDelCobro | null | undefined,
  redondeo: string = 'cincuenta',
  regla: ReglaDelCobro = 'respeta_recargo'
): PrecioDeCobro {
  const listaCent = aCentavos(lista)
  const aj = aCentesimos(ajustePct || 0)
  const sinPromo = redondear(conAjuste(listaCent, aj), redondeo)

  if (promo) {
    const soloPromo = conLaPromo(listaCent, promo)
    const promoRedondeada = redondear(soloPromo, redondeo)

    if (regla === 'reemplaza') {
      // 0079: la promo manda y el ajuste del medio no se aplica, gane o
      // pierda. Es lo que cobra la base hasta que corra la 0086.
      return {
        cobrado: aPesos(promoRedondeada),
        descuento: aPesos(listaCent * POR_CENTAVO - promoRedondeada),
        aplicaPromo: true,
        conPromo: aPesos(promoRedondeada),
        recargo: 0,
      }
    }

    // 0086: el recargo encima; el descuento del medio, no.
    const recargoPct = aj > CERO ? aj : CERO
    const conTodo = redondear((soloPromo * (DIEZ_MIL + recargoPct)) / DIEZ_MIL, redondeo)
    if (conTodo < sinPromo) {
      return {
        cobrado: aPesos(conTodo),
        descuento: aPesos(listaCent * POR_CENTAVO - promoRedondeada),
        aplicaPromo: true,
        conPromo: aPesos(promoRedondeada),
        recargo: aPesos(conTodo - promoRedondeada),
      }
    }
  }

  return {
    cobrado: aPesos(sinPromo),
    descuento: aPesos(listaCent * POR_CENTAVO - sinPromo),
    aplicaPromo: false,
    conPromo: null,
    recargo: 0,
  }
}

/**
 * Qué promo aplica la base y cuánto cobra, a partir de las dos candidatas
 * que prueba `cobrar_cuota()`: el cupón escrito, si hay, y la mejor
 * automática (la primera de `promociones_para`, la que más descuenta).
 *
 * - `respeta_recargo` (0086): primero el cupón; si no le gana al medio,
 *   la automática, igual que si no se hubiera escrito nada; si tampoco
 *   gana, ninguna. Un cupón que no gana no puede dejar afuera a la
 *   automática: traerlo saldría más caro que no traerlo.
 * - `reemplaza` (0079): el cupón si hay, si no la automática, y se
 *   aplica siempre.
 *
 * `sinAplicar` son las que se probaron y no ganaron, en ese orden: la
 * pantalla las nombra para que nadie crea que se olvidó de aplicarlas.
 */
export function cobroDeLaBase<P extends PromoDelCobro>(
  lista: number,
  ajustePct: number,
  cupon: P | null | undefined,
  automatica: P | null | undefined,
  redondeo: string = 'cincuenta',
  regla: ReglaDelCobro = 'respeta_recargo'
): { precio: PrecioDeCobro; aplicada: P | null; sinAplicar: P[] } {
  if (regla === 'reemplaza') {
    const promo = cupon ?? automatica ?? null
    return {
      precio: precioDeCobro(lista, ajustePct, promo, redondeo, 'reemplaza'),
      aplicada: promo,
      sinAplicar: [],
    }
  }
  const sinAplicar: P[] = []
  for (const promo of [cupon, automatica]) {
    if (!promo) continue
    const precio = precioDeCobro(lista, ajustePct, promo, redondeo, 'respeta_recargo')
    if (precio.aplicaPromo) return { precio, aplicada: promo, sinAplicar }
    sinAplicar.push(promo)
  }
  return { precio: precioDeCobro(lista, ajustePct, null, redondeo), aplicada: null, sinAplicar }
}

/**
 * El precio que se cobra según cómo paga el cliente, sin promo.
 *
 * El ajuste vive en el medio de pago (0028) y no en el plan: es una
 * propiedad de cómo se paga, no de qué se compra. El redondeo es un
 * parámetro porque base × 0,95 da entero solo si la base es múltiplo de
 * 20 — con los precios de hoy nunca se nota, con el primer aumento sí.
 */
export function precioConAjuste(
  base: number,
  ajustePct: number,
  redondeo: string = 'cincuenta'
): number {
  return precioDeCobro(base, ajustePct, null, redondeo).cobrado
}

/**
 * El precio con una promoción aplicada, antes de cualquier ajuste del
 * medio. Es el número con que se comparan dos promos: la que deja el
 * precio más bajo acá es la mejor en cualquier medio, porque el recargo
 * multiplica a todas por igual.
 *
 * El tope en cero es el mismo que el de la base: un monto fijo más grande
 * que la cuota no puede dejar una deuda negativa.
 */
export function precioConPromo(
  base: number,
  tipo: 'porcentaje' | 'monto',
  valor: number,
  redondeo: string = 'cincuenta'
): number {
  return aPesos(redondear(conLaPromo(aCentavos(base), { tipo, valor }), redondeo))
}
