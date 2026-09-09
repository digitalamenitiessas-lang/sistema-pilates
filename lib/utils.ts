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
