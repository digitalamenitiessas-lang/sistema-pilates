'use client'

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from 'react'
import { ChevronDown } from 'lucide-react'
import { cn } from '@/lib/utils'

/**
 * Secciones que se despliegan y se contraen, para pantallas que juntan
 * muchas cosas distintas (Configuración es el caso). El estado vive en el
 * contexto y no en cada sección, por dos razones: hace posible un
 * "desplegar todo", y permite recordar en el navegador lo que quedó
 * abierto la última vez — quien entra a Configuración casi siempre vuelve
 * a lo mismo que estaba tocando.
 *
 * Es preferencia de pantalla de un solo navegador, no dato del estudio:
 * por eso localStorage y no una tabla. Si el navegador lo bloquea, la
 * pantalla funciona igual y arranca con los valores por defecto.
 */

const PREFIJO = 'casafe:secciones-abiertas'

interface Plegables {
  abierta: (id: string) => boolean
  alternar: (id: string) => void
  registrar: (id: string, abiertaPorDefecto: boolean) => void
  desplegarTodo: () => void
  contraerTodo: () => void
  /** Cuántas hay abiertas, para que el botón de arriba sepa qué ofrecer */
  cantidadAbiertas: number
}

const Ctx = createContext<Plegables | null>(null)

export function useSeccionesPlegables(): Plegables {
  const ctx = useContext(Ctx)
  if (!ctx) throw new Error('Falta envolver las secciones en <SeccionesPlegables>')
  return ctx
}

export function SeccionesPlegables({
  memoria,
  children,
}: {
  /** Nombre con el que se recuerda esta pantalla en el navegador */
  memoria: string
  children: React.ReactNode
}) {
  const clave = `${PREFIJO}:${memoria}`
  // Todas las secciones que se montaron, para poder desplegarlas todas
  const conocidas = useRef<Set<string>>(new Set())
  const [abiertas, setAbiertas] = useState<Set<string>>(new Set())
  // Los efectos de los hijos corren antes que los del padre, así que las
  // secciones ya registraron su valor por defecto cuando llegamos acá: si
  // hay algo guardado, pisa esos valores; si no, quedan los del código.
  const restaurado = useRef(false)

  useEffect(() => {
    try {
      const guardado = window.localStorage.getItem(clave)
      if (guardado) setAbiertas(new Set(JSON.parse(guardado) as string[]))
    } catch {
      // Navegador sin storage o JSON viejo: se arranca con los defaults
    }
    restaurado.current = true
  }, [clave])

  const recordar = useCallback(
    (s: Set<string>) => {
      try {
        window.localStorage.setItem(clave, JSON.stringify([...s]))
      } catch {
        // Que no se pueda recordar no rompe la pantalla
      }
      return s
    },
    [clave]
  )

  const registrar = useCallback((id: string, abiertaPorDefecto: boolean) => {
    conocidas.current.add(id)
    if (abiertaPorDefecto && !restaurado.current) {
      setAbiertas((prev) => (prev.has(id) ? prev : new Set(prev).add(id)))
    }
  }, [])

  const alternar = useCallback(
    (id: string) => {
      setAbiertas((prev) => {
        const next = new Set(prev)
        if (next.has(id)) next.delete(id)
        else next.add(id)
        return recordar(next)
      })
    },
    [recordar]
  )

  const desplegarTodo = useCallback(
    () => setAbiertas(recordar(new Set(conocidas.current))),
    [recordar]
  )
  const contraerTodo = useCallback(() => setAbiertas(recordar(new Set())), [recordar])

  const abierta = useCallback((id: string) => abiertas.has(id), [abiertas])

  return (
    <Ctx.Provider
      value={{
        abierta,
        alternar,
        registrar,
        desplegarTodo,
        contraerTodo,
        cantidadAbiertas: abiertas.size,
      }}
    >
      {children}
    </Ctx.Provider>
  )
}

interface SeccionPlegableProps {
  /** Identidad estable: con esto se recuerda si quedó abierta */
  id: string
  icono: React.ComponentType<{ className?: string }>
  /** Color del chip del ícono, ej: 'bg-primary/10 text-primary-fuerte' */
  colorIcono?: string
  titulo: string
  ayuda?: string
  /** Lo que se ve en el encabezado sin abrir: un conteo, un estado */
  resumen?: React.ReactNode
  /**
   * Acción propia de la sección (un "Agregar"). Va al lado del botón que
   * despliega y no adentro: un botón dentro de otro botón no es HTML
   * válido y el navegador decide solo cuál de los dos gana.
   */
  accion?: React.ReactNode
  abiertaPorDefecto?: boolean
  children: React.ReactNode
}

export function SeccionPlegable({
  id,
  icono: Icono,
  colorIcono = 'bg-primary/10 text-primary-fuerte',
  titulo,
  ayuda,
  resumen,
  accion,
  abiertaPorDefecto = false,
  children,
}: SeccionPlegableProps) {
  const { abierta, alternar, registrar } = useSeccionesPlegables()
  const estaAbierta = abierta(id)

  useEffect(() => {
    registrar(id, abiertaPorDefecto)
  }, [id, abiertaPorDefecto, registrar])

  return (
    <section
      className={cn(
        'bg-card rounded-2xl border overflow-hidden transition-shadow',
        estaAbierta ? 'border-border shadow-sm' : 'border-border'
      )}
    >
      <div className="flex items-center gap-1">
        <button
          type="button"
          onClick={() => alternar(id)}
          aria-expanded={estaAbierta}
          aria-controls={`seccion-${id}`}
          className="flex flex-1 items-center gap-3 px-5 py-4 text-left min-w-0 hover:bg-muted/50 transition-colors rounded-2xl"
        >
          <div
            className={cn(
              'w-9 h-9 rounded-xl flex items-center justify-center shrink-0',
              colorIcono
            )}
          >
            <Icono className="w-5 h-5" />
          </div>
          <div className="min-w-0 flex-1">
            <h2 className="text-sm font-bold text-foreground">{titulo}</h2>
            {/* Dos líneas y corta: así todas las filas cerradas miden
                parecido y la lista se lee de un saque */}
            {ayuda && <p className="text-xs text-muted-foreground line-clamp-2">{ayuda}</p>}
          </div>
          {/* El resumen se muestra siempre: si es una advertencia (cambios
              sin guardar, permisos en sombra) esconderla en el celular es
              justo lo que no hay que hacer. Lo que se puede esconder es el
              conteo, y eso lo decide quien lo pasa. */}
          {resumen && <div className="shrink-0">{resumen}</div>}
          <ChevronDown
            className={cn(
              'w-4 h-4 shrink-0 text-muted-foreground transition-transform duration-200',
              estaAbierta && 'rotate-180'
            )}
          />
        </button>
        {accion && <div className="shrink-0 pr-4">{accion}</div>}
      </div>

      <div
        id={`seccion-${id}`}
        hidden={!estaAbierta}
        className={cn(
          'border-t border-border',
          estaAbierta &&
            'animate-in fade-in slide-in-from-top-1 duration-200 motion-reduce:animate-none'
        )}
      >
        {children}
      </div>
    </section>
  )
}
