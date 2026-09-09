'use client'

import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from './supabase'
import { fetchStudioData, type StudioData } from './api'
import type { Profile, Role } from './types'

interface DataContextValue {
  session: Session | null
  profile: Profile | null
  /** true cuando ya se resolvió la carga del perfil (con o sin resultado) */
  profileReady: boolean
  /**
   * El rol puede modificar datos. Refleja las políticas RLS: escriben admin y
   * recepción; profesor y alumno son de solo consulta. La base es la que manda
   * — esto solo evita mostrar acciones que la base va a rechazar.
   */
  canWrite: boolean
  /**
   * ¿El usuario tiene esta clave de permiso? (migración 0012)
   *
   * Mientras la clave está en modo sombra, la base responde con lo que el
   * rol puede hacer hoy, así que esto devuelve exactamente lo mismo que
   * canWrite devolvía. Si la migración todavía no corrió, no hay claves y
   * las pantallas caen a canWrite.
   */
  can: (clave: string) => boolean
  /** true si la base devolvió permisos (migración 0012 aplicada) */
  permisosReady: boolean
  sessionLoading: boolean
  data: StudioData | null
  dataLoading: boolean
  dataError: string | null
  refresh: () => Promise<void>
  signOut: () => Promise<void>
}

const DataContext = createContext<DataContextValue | null>(null)

/**
 * Cuánto tiene que hacer que se cargaron los datos para que valga la pena
 * volver a traerlos al reaparecer la pestaña. No es una regla del negocio
 * sino el costo de las consultas: alternar entre dos pestañas no debería
 * pedirle el estudio entero a la base cada vez.
 */
const ESPERA_ENTRE_REFRESCOS_MS = 60_000

export function DataProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [profile, setProfile] = useState<Profile | null>(null)
  const [profileReady, setProfileReady] = useState(false)
  const [sessionLoading, setSessionLoading] = useState(true)
  const [data, setData] = useState<StudioData | null>(null)
  const [dataLoading, setDataLoading] = useState(false)
  const [dataError, setDataError] = useState<string | null>(null)

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session)
      setSessionLoading(false)
    })
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_evento, session) => {
      setSession((anterior) => {
        // Supabase vuelve a emitir SIGNED_IN con la MISMA sesión (mismo
        // token) cada vez que la pestaña vuelve al frente. Si guardáramos
        // ese objeto nuevo, la referencia cambiaría y el efecto de abajo
        // recargaría el estudio entero por nada. Cuando de verdad no
        // cambió nada, conservamos el objeto anterior.
        if (
          anterior &&
          session &&
          anterior.user.id === session.user.id &&
          anterior.access_token === session.access_token
        ) {
          return anterior
        }
        return session
      })
    })
    return () => subscription.unsubscribe()
  }, [])

  /**
   * Cuándo terminó la última carga. Sirve para no repetir las catorce
   * consultas del bundle cada vez que alguien alterna entre dos pestañas.
   */
  const ultimaCarga = useRef(0)
  /**
   * Hay un refresco automático en curso. No frena a los refrescos que pide
   * una pantalla después de guardar: esos tienen que ver el dato nuevo.
   */
  const refrescoDeFondo = useRef(false)

  const refresh = useCallback(async () => {
    try {
      setDataError(null)
      const bundle = await fetchStudioData()
      setData(bundle)
    } catch (err) {
      setDataError(err instanceof Error ? err.message : 'Error al cargar los datos')
    } finally {
      ultimaCarga.current = Date.now()
    }
  }, [])

  // La carga del estudio se dispara por QUIÉN entró, no por el objeto de
  // sesión: el token se renueva cada tanto y eso no cambia nada de lo que
  // hay que traer. El email sale de una ref para no volverlo dependencia.
  const userId = session?.user?.id ?? null
  const emailRef = useRef(session?.user?.email ?? '')
  useEffect(() => {
    emailRef.current = session?.user?.email ?? ''
  }, [session])

  useEffect(() => {
    if (!userId) {
      setData(null)
      setProfile(null)
      setProfileReady(false)
      return
    }
    let cancelled = false

    setDataLoading(true)
    Promise.all([
      refresh(),
      supabase
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .single()
        .then(({ data: p }) => {
          if (cancelled) return
          if (p) {
            setProfile({
              id: p.id,
              fullName: p.full_name || emailRef.current || '',
              email: emailRef.current,
              role: p.role as Role,
              active: p.active ?? true,
            })
          }
          setProfileReady(true)
        }),
    ]).finally(() => {
      if (!cancelled) setDataLoading(false)
    })

    return () => {
      cancelled = true
    }
  }, [userId, refresh])

  // Al volver a la pestaña sí conviene traer datos frescos: el estudio
  // siguió operando mientras la persona estaba en otra cosa. Pero por
  // debajo, sin tapar la pantalla — que es lo que hacía antes, cuando la
  // recarga venía disparada por el SIGNED_IN repetido de Supabase.
  useEffect(() => {
    if (!userId) return
    const alVolver = () => {
      if (document.visibilityState !== 'visible') return
      // Volver al frente puede disparar varios visibilitychange en menos de
      // un segundo, y ultimaCarga recién se marca al terminar: sin esta
      // bandera el estudio se pedía dos o tres veces en paralelo.
      if (refrescoDeFondo.current) return
      const esperado = Date.now() - ultimaCarga.current
      if (esperado < ESPERA_ENTRE_REFRESCOS_MS) return
      refrescoDeFondo.current = true
      void refresh().finally(() => {
        refrescoDeFondo.current = false
      })
    }
    document.addEventListener('visibilitychange', alVolver)
    return () => document.removeEventListener('visibilitychange', alVolver)
  }, [userId, refresh])

  const canWrite = profile?.role === 'admin' || profile?.role === 'recepcion'

  const permisos = data?.permisos
  const permisosReady = !!permisos && permisos.length > 0
  const can = useCallback(
    (clave: string) => (permisos ? permisos.includes(clave) : false),
    [permisos]
  )

  const signOut = useCallback(async () => {
    await supabase.auth.signOut()
  }, [])

  return (
    <DataContext.Provider
      value={{ session, profile, profileReady, canWrite, can, permisosReady, sessionLoading, data, dataLoading, dataError, refresh, signOut }}
    >
      {children}
    </DataContext.Provider>
  )
}

export function useData(): DataContextValue {
  const ctx = useContext(DataContext)
  if (!ctx) throw new Error('useData debe usarse dentro de <DataProvider>')
  return ctx
}

/** Igual que useData() pero garantiza que el bundle ya cargó. */
export function useStudio(): StudioData {
  const { data } = useData()
  if (!data) throw new Error('useStudio requiere datos cargados')
  return data
}
