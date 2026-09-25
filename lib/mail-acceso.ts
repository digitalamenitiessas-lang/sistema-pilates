// El mail que recibe una clienta cuando le crean el acceso.
//
// Vive acá y no dentro del endpoint porque lo mandan dos caminos: cuando el
// acceso se crea (último paso del alta) y cuando hay que reenviarlo porque
// la primera vez no salió o el mail estaba mal escrito. Escrito dos veces
// se iba a desincronizar el día que cambie el texto, y el texto es una
// promesa: dice cuál es la contraseña.

import { emailLayout } from './email-server'

export async function mailDeAcceso(input: {
  email: string
  nombre: string
  origen: string
  /**
   * Es un blanqueo y no un acceso nuevo. Cambia el asunto y la primera
   * línea, y agrega qué hacer si no lo pidió: un blanqueo que ella no
   * pidió es la única señal que tiene de que alguien quiso entrar a su
   * cuenta.
   */
  blanqueo?: boolean
}): Promise<{ subject: string; html: string }> {
  const nombre = input.nombre.trim().split(' ')[0] || 'Hola'
  return {
    subject: input.blanqueo ? 'Tu contraseña del portal se blanqueó' : 'Tu acceso al portal',
    html: await emailLayout(
      `¡Hola ${nombre}!`,
      `${
        input.blanqueo
          ? '<p>En el estudio blanquearon tu contraseña del portal. Si no lo pediste vos, avisanos cuanto antes.</p>'
          : '<p>Ya podés entrar a tu portal: reservar tus clases, ver cuántas te quedan y tus pagos.</p>'
      }
       <p style="margin:18px 0 6px;"><strong>Cómo entrar</strong></p>
       <p style="margin:0;">Usuario: <strong>${input.email}</strong><br>
       Contraseña: <strong>tu número de documento</strong>, sin puntos</p>
       <p style="margin:18px 0;"><a href="${input.origen}/sistema" style="display:inline-block;padding:12px 22px;border-radius:12px;background:#847164;color:#fff;text-decoration:none;font-weight:700;">Entrar al portal</a></p>
       <p style="font-size:13px;color:#6B5646;">La primera vez te vamos a pedir que elijas una contraseña nueva: tu documento no es un secreto, así que sirve para entrar una sola vez.</p>`
    ),
  }
}
