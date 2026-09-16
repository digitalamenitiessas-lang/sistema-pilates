import { redirect } from 'next/navigation'

/**
 * La puerta de entrada del equipo, mientras la web esté en exhibición.
 *
 * El botón "Ingresar" de la landing quedó comentado el 16/09: el estudio
 * quiere mostrar la página antes de abrir, y no tiene sentido invitar a
 * entrar a un sistema que todavía no está en uso. Pero el equipo tiene
 * que poder entrar igual, y `/admin` es más fácil de dictar por teléfono
 * que `/sistema`.
 *
 * Es un redirect y no una copia de la pantalla: el sistema sigue
 * viviendo en una sola dirección. Dos rutas sirviendo lo mismo parten
 * los favoritos y obligan a que cualquier regla futura conozca las dos.
 * La `start_url` de la app instalable también apunta a `/sistema`, y así
 * sigue habiendo un solo lugar donde cambiarla.
 *
 * Esto NO es una protección: quien escriba `/sistema` entra igual, y
 * para eso está el login. Es no ofrecer una puerta que nadie va a tocar
 * esta semana.
 *
 * Cuando la web se abra, este archivo puede quedar —no molesta— o
 * borrarse junto con descomentar los dos links de la landing.
 */
export default function Admin() {
  redirect('/sistema')
}
