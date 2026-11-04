'use client'

import { useCallback, useEffect, useState } from 'react'
import { Loader2, RotateCcw, UserX } from 'lucide-react'
import { useData } from '@/lib/data-context'
import { fetchClientesDeBaja, reactivarCliente, type ClienteDeBaja } from '@/lib/api'

function fechaDeBaja(iso: string): string {
  return new Date(iso).toLocaleDateString('es-AR', {
    day: 'numeric',
    month: 'numeric',
    year: 'numeric',
    timeZone: 'America/Argentina/Buenos_Aires',
  })
}

/**
 * La lista "De baja" de Clientes (0097).
 *
 * Las fichas inactivas no vienen en el paquete del estudio —por eso
 * desaparecen de todos lados al darlas de baja—, así que se piden acá,
 * sólo cuando alguien abre esta lista. Desde acá se reactivan: si la
 * clienta vuelve, recupera su ficha con su historia y su credencial.
 */
export function ClientesDeBaja({ search }: { search: string }) {
  const { refresh, can } = useData()
  const puede = can('alumnos.eliminar')
  const [lista, setLista] = useState<ClienteDeBaja[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [confirmando, setConfirmando] = useState<string | null>(null)
  const [guardando, setGuardando] = useState<string | null>(null)
  const [errorFila, setErrorFila] = useState<{ id: string; texto: string } | null>(null)

  const cargar = useCallback(async () => {
    try {
      setLista(await fetchClientesDeBaja())
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo traer la lista')
    }
  }, [])

  useEffect(() => {
    cargar()
  }, [cargar])

  const reactivar = async (id: string) => {
    setGuardando(id)
    setErrorFila(null)
    try {
      await reactivarCliente(id)
      setConfirmando(null)
      await Promise.all([refresh(), cargar()])
    } catch (err) {
      setErrorFila({ id, texto: err instanceof Error ? err.message : 'No se pudo reactivar' })
    } finally {
      setGuardando(null)
    }
  }

  if (error) {
    return <p className="text-sm text-destructive-fuerte bg-destructive/10 rounded-xl px-3 py-2">{error}</p>
  }
  if (!lista) {
    return (
      <div className="flex items-center justify-center h-48 text-muted-foreground">
        <Loader2 className="w-5 h-5 animate-spin" />
      </div>
    )
  }

  const q = search.toLowerCase()
  const filtrada = lista.filter(
    (c) => q === '' || c.name.toLowerCase().includes(q) || c.dni.includes(q) || c.phone.includes(q)
  )

  if (filtrada.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-48 text-muted-foreground">
        <UserX className="w-10 h-10 mb-3 opacity-30" />
        <p className="text-sm">{lista.length === 0 ? 'No hay clientes dados de baja' : 'No se encontraron clientes'}</p>
      </div>
    )
  }

  return (
    <div className="space-y-2 max-w-3xl">
      <p className="text-xs text-muted-foreground mb-3">
        {filtrada.length} {filtrada.length === 1 ? 'ficha dada de baja' : 'fichas dadas de baja'}. No
        aparecen en la lista, en el buscador ni en la agenda, pero conservan su historia: si alguien
        vuelve, se reactiva.
      </p>
      {filtrada.map((c) => (
        <div key={c.id} className="bg-card border border-border rounded-2xl px-4 py-3">
          <div className="flex items-center gap-3">
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-foreground truncate">{c.name}</p>
              <p className="text-xs text-muted-foreground truncate">
                {c.bajaAt ? `De baja desde el ${fechaDeBaja(c.bajaAt)}` : 'De baja'}
                {c.bajaMotivo && ` · ${c.bajaMotivo}`}
              </p>
            </div>
            {puede && confirmando !== c.id && (
              <button
                onClick={() => {
                  setConfirmando(c.id)
                  setErrorFila(null)
                }}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border text-xs font-semibold text-muted-foreground hover:bg-muted hover:text-foreground transition-colors shrink-0"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                Reactivar
              </button>
            )}
          </div>
          {confirmando === c.id && (
            <div className="mt-3 pt-3 border-t border-border space-y-2">
              <p className="text-xs text-foreground">
                ¿Reactivar a <strong>{c.name}</strong>? Vuelve a la lista de clientes con su historia. Lo
                que la baja canceló —reservas, turnos fijos— no vuelve: para que reserve, asignale un
                plan.
              </p>
              <div className="flex gap-2">
                <button
                  onClick={() => setConfirmando(null)}
                  disabled={guardando === c.id}
                  className="flex-1 py-2 rounded-xl border border-border text-xs font-semibold text-muted-foreground hover:bg-muted"
                >
                  No
                </button>
                <button
                  onClick={() => reactivar(c.id)}
                  disabled={guardando === c.id}
                  className="flex-1 py-2 rounded-xl bg-primary text-primary-foreground text-xs font-semibold hover:opacity-90 disabled:opacity-50 flex items-center justify-center gap-1.5"
                >
                  {guardando === c.id && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                  Sí, reactivar
                </button>
              </div>
            </div>
          )}
          {errorFila?.id === c.id && <p className="text-xs text-destructive-fuerte mt-2">{errorFila.texto}</p>}
        </div>
      ))}
    </div>
  )
}
