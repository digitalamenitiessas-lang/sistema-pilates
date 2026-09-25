import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'
import type { Plan } from './types'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * Cómo se dice la vigencia de un plan en pantalla. Un solo lugar porque
 * aparece en Planes, en el modal de asignación y en la ficha, y con dos
 * unidades es fácil que una de las tres quede diciendo "días" para siempre.
 */
export function vigenciaTexto(plan: Pick<Plan, 'durationDays' | 'durationMonths'>): string {
  return `Vigencia ${cuantoDura(plan)}`
}

/**
 * Lo mismo sin el rótulo, para donde la vigencia va suelta en una línea
 * con otros datos ("8 clases · 1 mes").
 *
 * Existe porque el modal de asignación resolvía eso con
 * `vigenciaTexto(p).replace('Vigencia ', '')`: el día que cambie la
 * redacción del rótulo el replace deja de matchear, la pantalla muestra
 * "8 clases · Vigencia 1 mes" y nada falla ni avisa.
 */
export function cuantoDura(plan: Pick<Plan, 'durationDays' | 'durationMonths'>): string {
  if (plan.durationMonths > 0) {
    return plan.durationMonths === 1 ? '1 mes' : `${plan.durationMonths} meses`
  }
  return plan.durationDays === 1 ? '1 día' : `${plan.durationDays} días`
}

/**
 * Los días de la grilla. El estudio no dicta domingo, así que el índice
 * 0 es lunes y no domingo como en JavaScript — es la misma convención de
 * `class_sessions.day_of_week` desde la 0001, y mezclarlas corre la
 * grilla un día entero.
 */
export const DIAS = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo']

export function nombreDelDia(n: number): string {
  return DIAS[n] ?? '—'
}

/**
 * El número tal como lo pide `wa.me`: sólo dígitos, con el 54 de la
 * Argentina y el 9 de los celulares, sin el 0 de larga distancia ni el 15.
 *
 * Los links de WhatsApp sacaban lo que no era dígito y nada más, y el
 * mostrador carga el teléfono como lo dicta la clienta: "381 572-7352".
 * Eso armaba wa.me/3815727352, que WhatsApp lee como un número de Serbia
 * (+381): el chat no abría, o abría con un desconocido y le llevaba el
 * nombre de la clienta y el monto de su deuda. El 25/09 eran 3 de 5 fichas.
 *
 * Es la regla de numeración argentina, no un parámetro del estudio: el
 * estudio no decide cómo marca WhatsApp. Un número escrito con + (o 00)
 * y el código de otro país se deja como está; sin eso, se lo trata como
 * argentino. Si no alcanza para armar un número —un dígito suelto, un
 * celular sin característica—, devuelve null y el botón no se ofrece: un
 * link a un chat equivocado es peor que ninguno.
 */
export function numeroDeWhatsApp(telefono: string | null | undefined): string | null {
  const crudo = String(telefono ?? '').trim()
  let d = crudo.replace(/\D/g, '')
  if (!d) return null
  // Con + o 00 adelante, el código de país viene escrito. Si no es el 54,
  // es de otro país y va tal cual: recortarle un 0 o un 15 sería
  // inventarle otro número.
  const internacional = /^(\+|00)/.test(crudo)
  if (d.startsWith('00')) d = d.slice(2)
  if (internacional && !d.startsWith('54')) return d.length >= 8 ? d : null
  // Ninguna característica argentina empieza con 5, así que un 54 adelante
  // es siempre el código de país, venga o no con el +.
  if (d.startsWith('54')) {
    d = d.slice(2)
    if (d.startsWith('9')) d = d.slice(1)
  }
  if (d.startsWith('0')) d = d.slice(1)
  // El 15 va después de la característica, que tiene de 2 a 4 dígitos
  // (11 Buenos Aires, 381 Tucumán, 3865 Concepción). Con él, un número
  // argentino tiene 12 dígitos en vez de 10.
  if (d.length === 12) {
    for (const largo of [3, 4, 2]) {
      if (d.slice(largo, largo + 2) === '15') {
        d = d.slice(0, largo) + d.slice(largo + 2)
        break
      }
    }
  }
  // Tiene que quedar una característica que exista: todas empiezan con 11,
  // con 2 o con 3. Un 15 sin característica o un 0800 no llegan a ningún
  // celular, y un link a un número inexistente no le sirve a nadie.
  return d.length === 10 && /^(11|2|3)/.test(d) ? `549${d}` : null
}
