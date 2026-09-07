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
