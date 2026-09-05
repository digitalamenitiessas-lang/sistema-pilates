// Descarga de reportes.
//
// CSV y no .xlsx a propósito: Excel abre el CSV sin plugins ni
// dependencias, y el archivo pesa nada. El BOM del principio es lo que
// hace que Excel muestre "Sofía" y no "SofÃ­a", que es el motivo por el
// que casi todos los CSV exportados se ven rotos.

export interface Columna<T> {
  titulo: string
  valor: (fila: T) => string | number | null | undefined
  /** Los montos se exportan como número, para poder sumarlos en Excel */
  numero?: boolean
}

function celda(v: string | number | null | undefined, numero?: boolean): string {
  if (v === null || v === undefined) return ''
  if (numero) {
    // Coma decimal: es lo que espera un Excel configurado en español.
    return String(v).replace('.', ',')
  }
  const s = String(v)
  return /[";\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

/**
 * Genera el CSV. Separador punto y coma: con la coma decimal del castellano,
 * la coma como separador de columnas parte los montos en dos.
 */
export function armarCsv<T>(filas: T[], columnas: Array<Columna<T>>): string {
  const cabecera = columnas.map((c) => celda(c.titulo)).join(';')
  const cuerpo = filas.map((f) =>
    columnas.map((c) => celda(c.valor(f), c.numero)).join(';')
  )
  return [cabecera, ...cuerpo].join('\r\n')
}

/** Dispara la descarga en el navegador. */
export function descargarCsv<T>(
  nombre: string,
  filas: T[],
  columnas: Array<Columna<T>>
): void {
  const csv = armarCsv(filas, columnas)
  // ﻿ = BOM. Sin esto Excel no reconoce el UTF-8 y rompe los acentos.
  const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `${nombre}.csv`
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

/**
 * Nombre de archivo con el período adentro: un "reporte.csv" suelto en
 * Descargas no le dice nada a nadie tres semanas después.
 */
export function nombreArchivo(reporte: string, desde: string, hasta: string): string {
  const limpio = reporte
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
  return `${limpio}_${desde}_a_${hasta}`
}
