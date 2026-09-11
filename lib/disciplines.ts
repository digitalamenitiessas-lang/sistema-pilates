import type { DisciplineItem } from './types'

/**
 * Colores y textos de una disciplina. Desde la migración 0011 salen del
 * catálogo editable (tabla `disciplines`), no de constantes en el código.
 *
 * Son valores CSS y no clases de Tailwind a propósito: las clases arbitrarias
 * (`bg-[#FDEEE8]`) tienen que existir en el código para que Tailwind las
 * genere, y estas ahora vienen de la base.
 */
export interface DisciplineStyle {
  /** Color del punto y de los acentos */
  dot: string
  /** Fondo de la etiqueta */
  bg: string
  /** Color del texto sobre ese fondo */
  text: string
  /** Descripción breve que se muestra en la web */
  blurb: string
}

/** Para una disciplina que todavía no está en el catálogo. */
export const DEFAULT_DISCIPLINE_STYLE: DisciplineStyle = {
  dot: '#847164',
  bg: '#BCBAAE',
  text: '#000000',
  blurb: '',
}

export function disciplineStyle(catalog: DisciplineItem[], name: string): DisciplineStyle {
  const d = catalog.find((x) => x.name === name)
  if (!d) return DEFAULT_DISCIPLINE_STYLE
  return { dot: d.color, bg: d.bgColor, text: d.textColor, blurb: d.blurb }
}

/** Nombres del catálogo, en el orden configurado. */
export function disciplineNames(catalog: DisciplineItem[]): string[] {
  return catalog.map((d) => d.name)
}
