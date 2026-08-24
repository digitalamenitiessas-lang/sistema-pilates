'use client'

import { createContext, useCallback, useContext, useEffect, useState } from 'react'
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
  sessionLoading: boolean
  data: StudioData | null
  dataLoading: boolean
  dataError: string | null
  refresh: () => Promise<void>
  signOut: () => Promise<void>
}

const DataContext = createContext<DataContextValue | null>(null)

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
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session)
    })
    return () => subscription.unsubscribe()
  }, [])

  const refresh = useCallback(async () => {
    try {
      setDataError(null)
      const bundle = await fetchStudioData()
      setData(bundle)
    } catch (err) {
      setDataError(err instanceof Error ? err.message : 'Error al cargar los datos')
    }
  }, [])

  useEffect(() => {
    if (!session) {
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
        .eq('id', session.user.id)
        .single()
        .then(({ data: p }) => {
          if (cancelled) return
          if (p) {
            setProfile({
              id: p.id,
              fullName: p.full_name || session.user.email || '',
              email: session.user.email ?? '',
              role: p.role as Role,
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
  }, [session, refresh])

  const canWrite = profile?.role === 'admin' || profile?.role === 'recepcion'

  const signOut = useCallback(async () => {
    await supabase.auth.signOut()
  }, [])

  return (
    <DataContext.Provider
      value={{ session, profile, profileReady, canWrite, sessionLoading, data, dataLoading, dataError, refresh, signOut }}
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
