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
