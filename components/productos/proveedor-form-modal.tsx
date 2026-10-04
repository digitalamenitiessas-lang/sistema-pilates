'use client'

/**
 * Alta y edición de un proveedor.
 *
 * El % es la parte del ESTUDIO sobre lo cobrado, y es por proveedor: el 30
 * de hoy es un acuerdo, no una regla del sistema. Cambiarlo rige desde la
 * venta siguiente; cada venta ya hecha guarda el % con que se vendió.
 */

import { useState } from 'react'
import { Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { guardarProveedor } from '@/lib/inventario-api'
import type { Proveedor } from '@/lib/types'
import {
  BotonPrincipal,
  BotonSecundario,
  Hoja,
  inputClass,
  labelClass,
  leerNumero,
} from './comun'

export function ProveedorFormModal({
  proveedor,
  onClose,
  onGuardado,
}: {
  proveedor?: Proveedor
  onClose: () => void
  onGuardado: (id: string) => void
}) {
  const [nombre, setNombre] = useState(proveedor?.nombre ?? '')
  const [contacto, setContacto] = useState(proveedor?.contacto ?? '')
  const [notas, setNotas] = useState(proveedor?.notas ?? '')
  const [pct, setPct] = useState(String(proveedor?.pctEstudio ?? 30))
  const [activo, setActivo] = useState(proveedor?.active ?? true)
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const pctNum = leerNumero(pct)
  const pctValido = pctNum !== null && pctNum >= 0 && pctNum <= 100

  const guardar = async () => {
    if (!nombre.trim()) return setError('Falta el nombre del proveedor.')
    if (!pctValido) return setError('La parte del estudio tiene que ser un porcentaje entre 0 y 100.')
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
      })
      onGuardado(id)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo guardar el proveedor')
      setGuardando(false)
    }
  }

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
            proveedor, sobre lo cobrado. Las ventas ya hechas conservan el % con que se vendieron.
          </p>
        )}
      </div>
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
