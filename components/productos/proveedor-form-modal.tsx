'use client'

/**
 * Alta y edición de un proveedor.
 *
 * El % es la parte del ESTUDIO y es por proveedor: el 30 de hoy es un
 * acuerdo, no una regla del sistema. Cambiarlo rige desde la venta
 * siguiente; cada venta ya hecha guarda el % con que se vendió.
 *
 * Con la 0092 se configura también SOBRE QUÉ se calcula ese %: el precio
 * de efectivo de la pieza, cobre como cobre (el recargo de la tarjeta
 * queda entero para el estudio; así lo confirmó el estudio el 06/10 para
 * los difusores), o lo que se cobró (la regla de la 0090). Y la lista de
 * precios por letra, para los productos que se venden con la letra de la
 * etiqueta. Al guardar viaja SÓLO lo que cambió: una letra que se saca va
 * en null, una celda que se vacía también, y lo demás no se toca. La regla
 * también viaja sólo si cambió: así guardar el nombre o el % anda igual con
 * las funciones de la 0090 (base vieja, o la 0092 vuelta atrás).
 */

import { useMemo, useState } from 'react'
import { AlertTriangle, Loader2, Plus, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useStudio } from '@/lib/data-context'
import { guardarProveedor } from '@/lib/inventario-api'
import type { ComisionSobre, Proveedor } from '@/lib/types'
import { mediosParaCobrar } from '@/components/pagos/pagos-page'
import {
  BotonPrincipal,
  BotonSecundario,
  Hoja,
  inputClass,
  labelClass,
  leerNumero,
  ordenarLetras,
  plata,
  reparto,
} from './comun'

/** Las dos transferencias suelen tener el mismo precio: se escriben juntas mientras coincidan. */
const GEMELO: Record<string, string> = { transferencia: 'transferencia_bbva', transferencia_bbva: 'transferencia' }

type Fila = { clave: number; letra: string; precios: Record<string, string> }

/** La letra que sigue a la última: L después de K. */
function siguienteLetra(usadas: string[]): string {
  const orden = ordenarLetras(usadas)
  const ultima = orden[orden.length - 1]
  if (!ultima) return 'A'
  if (/^[A-Y]$/.test(ultima)) {
    const s = String.fromCharCode(ultima.charCodeAt(0) + 1)
    return usadas.includes(s) ? '' : s
  }
  return ''
}

export function ProveedorFormModal({
  proveedor,
  letras,
  letrasSinLeer = null,
  onClose,
  onGuardado,
}: {
  proveedor?: Proveedor
  /** Su lista por letra (letra → medio → precio); null = la 0092 no corrió, o no se sabe */
  letras: Record<string, Record<string, number>> | null
  /**
   * Si `letras` es null porque no se pudieron leer (o todavía no llegaron),
   * el porqué. Entonces no se sabe si corrió la 0092: no se ofrece cambiar
   * la regla ni las letras, y no se afirma sobre qué se calcula.
   */
  letrasSinLeer?: string | null
  onClose: () => void
  onGuardado: (id: string) => void
}) {
  const hay0092 = letras !== null
  const noSeSabe = !hay0092 && letrasSinLeer !== null
  // Lo que rige hoy. De un proveedor que ya existe lo dice su fila (sin la
  // columna, 'cobrado'), aunque las letras no se hayan podido leer.
  const reglaGuardada: ComisionSobre | null = proveedor
    ? proveedor.comisionSobre
    : hay0092
      ? 'efectivo'
      : noSeSabe
        ? null
        : 'cobrado'
  const { paymentMethods } = useStudio()
  const original = useMemo(() => letras ?? {}, [letras])

  const [nombre, setNombre] = useState(proveedor?.nombre ?? '')
  const [contacto, setContacto] = useState(proveedor?.contacto ?? '')
  const [notas, setNotas] = useState(proveedor?.notas ?? '')
  const [pct, setPct] = useState(String(proveedor?.pctEstudio ?? 30))
  const [activo, setActivo] = useState(proveedor?.active ?? true)
  // Un proveedor nuevo nace sobre el efectivo (lo que pone la base).
  const [sobre, setSobre] = useState<ComisionSobre>(proveedor?.comisionSobre ?? 'efectivo')
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Las columnas: los medios del mostrador y, si la lista tiene precios en
  // otro (uno dado de baja), ése también, para poder verlo y sacarlo.
  const medios = useMemo(() => mediosParaCobrar(paymentMethods), [paymentMethods])
  const columnas = useMemo(() => {
    const codes = medios.map((m) => m.code)
    for (const l of Object.values(original)) for (const c of Object.keys(l)) if (!codes.includes(c)) codes.push(c)
    return codes
  }, [medios, original])
  const nombreMedio = (code: string) => paymentMethods.find((m) => m.code === code)?.name ?? code

  const [filas, setFilas] = useState<Fila[]>(() =>
    ordenarLetras(Object.keys(original)).map((l, i) => ({
      clave: i,
      letra: l,
      precios: Object.fromEntries(
        columnas.map((c) => [c, original[l][c] !== undefined ? String(original[l][c]) : ''])
      ),
    }))
  )
  const [proxima, setProxima] = useState(filas.length)

  const pctNum = leerNumero(pct)
  const pctValido = pctNum !== null && pctNum >= 0 && pctNum <= 100

  const cambiarPrecio = (clave: number, code: string, valor: string) =>
    setFilas((fs) =>
      fs.map((f) => {
        if (f.clave !== clave) return f
        const precios = { ...f.precios, [code]: valor }
        const g = GEMELO[code]
        // Mientras la otra transferencia esté vacía o igual a ésta, se
        // escriben juntas: una L sin precio BBVA no se ofrecería en BBVA y
        // nadie se daría cuenta.
        if (g && columnas.includes(g) && (f.precios[g] === '' || f.precios[g] === f.precios[code])) {
          precios[g] = valor
        }
        return { ...f, precios }
      })
    )

  const agregarLetra = () => {
    setFilas((fs) => [
      ...fs,
      {
        clave: proxima,
        letra: siguienteLetra(fs.map((f) => f.letra.trim().toUpperCase()).filter(Boolean)),
        precios: Object.fromEntries(columnas.map((c) => [c, ''])),
      },
    ])
    setProxima((n) => n + 1)
  }

  /** Lo que cambió de la lista, como lo espera la base; o el error a mostrar. */
  const cambiosDeLetras = (): { letras: Record<string, Record<string, number | null> | null> } | { error: string } => {
    const cambios: Record<string, Record<string, number | null> | null> = {}
    const vistas = new Set<string>()
    for (const f of filas) {
      const l = f.letra.trim().toUpperCase()
      const algo = columnas.some((c) => f.precios[c].trim() !== '')
      if (!l) {
        if (algo) return { error: 'Hay una fila con precios y sin letra.' }
        continue
      }
      if (!/^[A-Z0-9]{1,4}$/.test(l)) return { error: `La letra «${f.letra.trim()}» no sirve: usá de 1 a 4 letras o números, sin espacios.` }
      if (vistas.has(l)) return { error: `La letra ${l} está dos veces.` }
      vistas.add(l)
      if (algo && sobre === 'efectivo' && !f.precios.efectivo?.trim()) {
        return { error: `La letra ${l} no tiene precio en efectivo, y la parte del estudio se calcula sobre ese precio.` }
      }
      const antes = original[l] ?? {}
      const fila: Record<string, number | null> = {}
      for (const c of columnas) {
        const t = f.precios[c].trim()
        if (!t) {
          if (antes[c] !== undefined) fila[c] = null
          continue
        }
        const n = leerNumero(t)
        if (n === null || n <= 0) return { error: `El precio de la letra ${l} en ${nombreMedio(c)} tiene que ser un número mayor que cero.` }
        if (n !== antes[c]) fila[c] = n
      }
      if (Object.keys(fila).length > 0) cambios[l] = fila
    }
    // Las que estaban y ya no: se borran enteras.
    for (const l of Object.keys(original)) if (!vistas.has(l)) cambios[l] = null
    return { letras: cambios }
  }

  const guardar = async () => {
    if (!nombre.trim()) return setError('Falta el nombre del proveedor.')
    if (!pctValido) return setError('La parte del estudio tiene que ser un porcentaje entre 0 y 100.')
    let extra: { comisionSobre?: ComisionSobre; letras?: Record<string, Record<string, number | null> | null> } = {}
    if (hay0092) {
      const c = cambiosDeLetras()
      if ('error' in c) return setError(c.error)
      extra = {
        ...(sobre !== reglaGuardada ? { comisionSobre: sobre } : {}),
        ...(Object.keys(c.letras).length > 0 ? { letras: c.letras } : {}),
      }
    }
    setGuardando(true)
    setError(null)
    try {
      const id = await guardarProveedor({
        id: proveedor?.id ?? null,
        nombre,
        contacto,
        notas,
        pctEstudio: pctNum!,
        activo,
        ...extra,
      })
      onGuardado(id)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo guardar el proveedor')
      setGuardando(false)
    }
  }

  // El ejemplo, con el % que está escrito: así se ve qué cambia elegir una
  // base u otra antes de guardar.
  const ejemplo = pctValido
    ? reparto(13000, sobre === 'efectivo' ? 10000 : 13000, pctNum!)
    : null

  return (
    <Hoja
      titulo={proveedor ? 'Editar proveedor' : 'Nuevo proveedor'}
      ocupado={guardando}
      onClose={onClose}
      error={error}
      pie={
        <>
          <BotonSecundario onClick={onClose} disabled={guardando}>
            Cancelar
          </BotonSecundario>
          <BotonPrincipal onClick={guardar} disabled={guardando}>
            {guardando && <Loader2 className="w-4 h-4 animate-spin" />}
            Guardar
          </BotonPrincipal>
        </>
      }
    >
      <div>
        <label className={labelClass}>Nombre *</label>
        <input value={nombre} onChange={(e) => setNombre(e.target.value)} maxLength={80} className={inputClass} />
      </div>
      <div>
        <label className={labelClass}>Parte del estudio (%) *</label>
        <input
          value={pct}
          onChange={(e) => setPct(e.target.value)}
          inputMode="decimal"
          className={cn(inputClass, !pctValido && pct.trim() && 'border-destructive')}
        />
        {pctValido && (
          <p className="text-[11px] text-muted-foreground mt-1">
            De cada venta, el {pctNum}% es del estudio y el {Math.round((100 - pctNum!) * 100) / 100}% del
            proveedor
            {(() => {
              const regla = hay0092 ? sobre : reglaGuardada
              return regla === null ? '' : regla === 'efectivo' ? ', sobre el precio de efectivo' : ', sobre lo cobrado'
            })()}
            . Las ventas ya hechas conservan el % con que se vendieron.
          </p>
        )}
      </div>

      {noSeSabe && (
        <p className="text-xs text-aviso-fuerte bg-aviso-suave rounded-xl px-3 py-2.5 flex gap-2">
          <AlertTriangle className="w-4 h-4 shrink-0" />
          <span>
            Los precios por letra no están disponibles ({letrasSinLeer}). Se puede guardar lo demás; sobre qué se
            calcula la parte del estudio y la lista por letra quedan como están. Para cambiarlos, cerrá y volvé a
            abrir.
          </span>
        </p>
      )}

      {hay0092 && (
        <div>
          <label className={labelClass}>La parte del estudio se calcula sobre</label>
          <div className="grid grid-cols-2 gap-1.5">
            {(
              [
                ['efectivo', 'El precio de efectivo'],
                ['cobrado', 'Lo que se cobró'],
              ] as const
            ).map(([v, t]) => (
              <button
                key={v}
                type="button"
                onClick={() => setSobre(v)}
                className={cn(
                  'py-2 rounded-xl border text-xs font-semibold transition-colors',
                  sobre === v
                    ? 'border-primary bg-primary/5 text-primary-fuerte'
                    : 'border-border text-muted-foreground hover:border-primary/40'
                )}
              >
                {t}
              </button>
            ))}
          </div>
          {ejemplo && (
            <p className="text-[11px] text-muted-foreground mt-1">
              Algo que en efectivo vale {plata(10000)} y se cobra {plata(13000)} con tarjeta: proveedor{' '}
              {plata(ejemplo.proveedor)}, estudio {plata(ejemplo.estudio)}.
              {sobre === 'efectivo' && ' El recargo de la tarjeta o la transferencia queda entero para el estudio.'}
            </p>
          )}
        </div>
      )}

      {hay0092 && (
        <div>
          <label className={labelClass}>Precios por letra (opcional)</label>
          <p className="text-[11px] text-muted-foreground mb-2">
            Para los productos que se venden con la letra de la etiqueta: al vender se elige la letra y el precio
            sale de acá. Una lista para todos los productos de este proveedor.
          </p>
          {filas.length > 0 && (
            // Sólo se desplaza la tabla, nunca la página.
            <div className="overflow-x-auto -mx-1 px-1">
              <table className="min-w-[30rem] w-full text-xs">
                <thead>
                  <tr className="text-muted-foreground">
                    {/* La letra queda fija al correr la tabla de costado: si
                        no, en el teléfono se cargan los precios de tarjeta
                        sin ver de qué letra son. */}
                    <th className="sticky left-0 z-10 bg-card text-left font-semibold pb-1 pr-1.5 w-14">Letra</th>
                    {columnas.map((c) => (
                      <th key={c} className="text-left font-semibold pb-1 pr-1.5">
                        {nombreMedio(c)}
                        {!medios.some((m) => m.code === c) && (
                          <span className="block text-[10px] font-normal">no está en el mostrador</span>
                        )}
                      </th>
                    ))}
                    <th className="w-8" />
                  </tr>
                </thead>
                <tbody>
                  {filas.map((f) => (
                    <tr key={f.clave}>
                      <td className="sticky left-0 z-10 bg-card pr-1.5 py-0.5">
                        <input
                          value={f.letra}
                          onChange={(e) =>
                            setFilas((fs) => fs.map((x) => (x.clave === f.clave ? { ...x, letra: e.target.value } : x)))
                          }
                          maxLength={4}
                          autoCapitalize="characters"
                          aria-label="Letra"
                          className={cn(inputClass, 'px-2 py-2 text-center font-bold uppercase')}
                        />
                      </td>
                      {columnas.map((c) => (
                        <td key={c} className="pr-1.5 py-0.5">
                          <input
                            value={f.precios[c]}
                            onChange={(e) => cambiarPrecio(f.clave, c, e.target.value)}
                            inputMode="numeric"
                            placeholder="—"
                            aria-label={`Letra ${f.letra || '?'} en ${nombreMedio(c)}`}
                            className={cn(inputClass, 'px-2 py-2 tabular-nums')}
                          />
                        </td>
                      ))}
                      <td className="py-0.5">
                        <button
                          type="button"
                          onClick={() => setFilas((fs) => fs.filter((x) => x.clave !== f.clave))}
                          className="w-8 h-8 rounded-lg hover:bg-muted flex items-center justify-center text-muted-foreground"
                          aria-label={`Sacar la letra ${f.letra}`}
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <button
            type="button"
            onClick={agregarLetra}
            className="mt-2 px-3 py-1.5 rounded-lg border border-border text-xs font-semibold text-foreground hover:bg-muted inline-flex items-center gap-1"
          >
            <Plus className="w-3.5 h-3.5" />
            Agregar letra
          </button>
          <p className="text-[11px] text-muted-foreground mt-1">
            Vacío = esa letra no se ofrece en ese medio. Las dos transferencias se escriben juntas mientras tengan el
            mismo precio.
            {sobre === 'efectivo' && ' Cada letra necesita su precio en efectivo: la parte del estudio sale de ahí.'}
          </p>
        </div>
      )}

      <div>
        <label className={labelClass}>Contacto (opcional)</label>
        <input
          value={contacto}
          onChange={(e) => setContacto(e.target.value)}
          placeholder="Teléfono, mail, a quién llamar"
          className={inputClass}
        />
      </div>
      <div>
        <label className={labelClass}>Notas (opcional)</label>
        <input value={notas} onChange={(e) => setNotas(e.target.value)} className={inputClass} />
      </div>
      {proveedor && (
        <label className="flex items-center gap-2 text-sm text-foreground">
          <input type="checkbox" checked={activo} onChange={(e) => setActivo(e.target.checked)} />
          Activo
          <span className="text-[11px] text-muted-foreground">
            (dado de baja no se elige para productos nuevos; lo que ya se vendió se le sigue rindiendo)
          </span>
        </label>
      )}
    </Hoja>
  )
}
