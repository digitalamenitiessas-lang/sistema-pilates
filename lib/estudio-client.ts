'use client'

/**
 * El nombre del estudio para las pantallas de antes de entrar: el login y
 * el recupero de contraseña. Ahí todavía no hay sesión, así que no sirve
 * el paquete del estudio — se lee de la vista pública, la misma que usa la
 * web sin login.
 *
 * Adentro del sistema no hace falta esto: ahí está `useStudio().settings`.
 */
import { useEffect, useState } from 'react'
import { supabase } from './supabase'
import { NOMBRE_POR_DEFECTO } from './estudio'

/**
 * Si el cliente puede crearse el acceso solo (0057). Arranca en `false` y
 * queda en `false` si la clave no está o la consulta no vuelve: es el
 * mismo default que el servidor, que falla cerrado. Así la pantalla no
 * ofrece una puerta que el endpoint va a rechazar — y si se equivoca, se
 * equivoca escondiendo, no prometiendo.
 */
export function useAutoregistro(): boolean {
  const [puede, setPuede] = useState(false)

  useEffect(() => {
    let vivo = true
    supabase
      .from('public_studio_settings')
      .select('value')
      .eq('key', 'portal_autoregistro')
      .maybeSingle()
      .then(({ data }) => {
        if (vivo) setPuede(data?.value?.trim() === 'true')
      })
    return () => {
      vivo = false
    }
  }, [])

  return puede
}

export function useNombreDelEstudio(): string {
  const [nombre, setNombre] = useState(NOMBRE_POR_DEFECTO)

  useEffect(() => {
    let vivo = true
    supabase
      .from('public_studio_settings')
      .select('value')
      .eq('key', 'studio_name')
      .maybeSingle()
      .then(({ data }) => {
        const v = data?.value?.trim()
        if (vivo && v) setNombre(v)
      })
    return () => {
      vivo = false
    }
  }, [])

  return nombre
}
