# Plan de avance — PilatesStudio

> Documento vivo. Se actualiza con cada bloque de trabajo.
> Última actualización: **26/08/2026** (responsive + PWA + notificaciones + roles).
> Documento para la clienta: `docs/PilatesStudio-integraciones-y-etapas.pdf`
> (versión presentable, no este plan interno).

## Estado general

Sistema desplegado en Vercel y operativo con datos de ejemplo. Núcleo completo
(gestión + cobros + landing + autogestión + portal del alumno), ahora también
usable desde el celular, instalable como app y con notificaciones reales.
Lo que falta se divide en: trabajo nuestro (renovación automática, huecos del
portal, mostrador) y cosas bloqueadas por la clienta (cuenta MP, datos reales,
decisiones de negocio).

Desde el 26/08 **sí corre un proceso solo**: el cron diario de Vercel
(`/api/cron/diario`) genera las notificaciones de membresías por vencer /
vencidas y deudas, manda push al staff y emails a las alumnas (cuando Resend
esté configurado). Además los triggers de la base crean notificaciones al
acreditarse un pago y al darse de alta un alumno. Las alertas del tablero de
inicio siguen derivándose al leer (`buildAlerts` en `lib/api.ts`) — conviven:
el tablero muestra el estado, la campana muestra los eventos.

## Etapas

### ✅ Etapa 0 — Base (jul 2026)
Sistema de gestión completo: alumnos, planes, membresías, agenda, reservas,
pagos con comprobantes autonumerados. Auth con roles + RLS. Migración `0001`.

### ✅ Mercado Pago autogestionable (jul 2026)
Credenciales cargadas por el admin en Configuración, links de pago Checkout
Pro por deuda, acreditación automática al abrir Pagos + webhook para
producción. Migración `0002`.

### ✅ Landing pública (jul 2026)
Landing animada en `/` con planes y horarios en vivo desde la base (vistas
públicas). Sistema movido a `/sistema`. WhatsApp real en todos los CTA. Menú
mobile. Migración `0003`.

### ✅ Autogestión total (jul 2026)
ABM de clases desde la agenda; profesores, salas y usuarios del sistema desde
Configuración. Recordatorios de WhatsApp con un click (con link de pago
incluido) en deudas y alertas. Migración `0004`.

### ✅ Etapa 3 — Portal del alumno + PWA (04/08/2026, verificada)
- Portal mobile-first: membresía con clases restantes, reserva con cupos en
  vivo y lista de espera, cancelación, deudas con "Pagar online", historial.
- RLS por alumno (cada uno ve SOLO sus datos — verificado con intentos de
  fuga), cupo garantizado por trigger en la base, acceso creado desde la
  ficha por staff. PWA instalable con ícono de marca. Migración `0005`.
- Cuenta demo: `camila.portal@pilatestudio.com` (borrar o usar para demos).

### ✅ Rol profesor en modo solo consulta (24/08/2026)
La base ya lo protegía (las políticas de escritura son solo `admin` y
`recepcion`), pero la interfaz mostraba igual los botones de alta, edición y
cobro: un profesor los veía y al tocarlos recibía un error de permisos.
Ahora `canWrite` sale del contexto (`lib/data-context.tsx`) replicando esa
misma regla, y esconde las acciones en agenda, alumnos, ficha, planes,
reservas, pagos, configuración y los avisos de WhatsApp del inicio. El header
muestra el distintivo "Solo consulta". La base sigue siendo la que manda —
esto solo evita ofrecer acciones que iban a fallar.

### ✅ Bloque 26/08 — Seguridad, responsive, PWA, notificaciones y roles
- **Seguridad**: el trigger de perfiles ya no toma el rol de la metadata del
  registro (cualquiera con la anon key podía nacer admin si los signups
  públicos estaban habilitados — migración `0006`); checks explícitos de rol
  staff en los endpoints de MP.
- **Responsive**: sidebar drawer en mobile con hamburguesa (la causa del
  "se desconfigura todo"), agenda con vista por día, tabs de la ficha con
  scroll, modales que ya no cortan contenido, grids y paddings.
- **PWA**: invitación post-login a agregar la app al inicio (pasos de Safari
  en iPhone, diálogo nativo en Android; `pwa-debug`=`ios` en localStorage la
  fuerza para demos) + service worker con push.
- **Notificaciones** (migración `0007`): campana funcional con panel, leídas
  por usuario, Realtime, push por dispositivo (VAPID), cron diario de
  vencimientos, emails Resend (pago recibido, por vencer, deuda) — no-op sin
  `RESEND_API_KEY`.
- **Roles** (migración `0008`): profesor sin pagos ni datos médicos
  (`student_private`), credenciales MP legibles solo por admin (recepción
  opera vía service role), chip "Solo consulta" visible en mobile.

### 🔜 Etapa 2 — Cobranza que se cobra sola *(próximo bloque nuestro)*
- [ ] **Renovación automática de membresías** con generación de la cuota del
      mes. Hoy al vencer hay que reasignar el plan a mano, alumna por alumna
      — es el trabajo manual más pesado del ciclo mensual. **No depende de
      nadie.** Comprometido con la clienta en el mensaje del 24/08.
- [ ] Avisos automáticos por email (cron diario en Vercel + Resend):
      membresía por vencer, deuda generada, pago recibido. **No depende de
      nadie** (sandbox ahora, dominio del estudio después).
- [ ] Débito automático mensual (Suscripciones MP). Se puede **desarrollar y
      probar ya** con las credenciales de prueba de MP; solo el primer cobro
      real necesita la cuenta de la clienta.

### 🔜 Portal del alumno — lo que falta para que escale *(nuestro)*
- [ ] **Auto-registro.** No existe ningún `signUp`: hoy el acceso lo crea el
      staff desde la ficha, uno por uno, y le pasa la clave a mano. Con
      volumen y rotación pasa a ser trabajo permanente.
- [ ] **Recuperar contraseña.** No hay reset ni cambio de clave desde el
      portal. Si una alumna pierde la suya, la única salida hoy es el
      dashboard de Supabase. Va a generar pedidos de soporte desde el día
      uno.

### ⏸️ Etapa 4 — Mostrador *(cuando el estudio opere con el sistema)*
- [ ] Inventario y venta de productos (POS) con stock.
- [ ] Metas de venta con tablero.
- [ ] Tiquetera (requiere impresora térmica comprada).

### ⏸️ Etapa 5 — Dependen de terceros *(lanzar trámites ya, integrar después)*
- [ ] Gympass (Wellhub) / Totalpass — falta que el estudio firme convenio.
- [ ] Factura electrónica ARCA — falta decisión de la clienta.
- [ ] WhatsApp Business API — cuando el volumen justifique el costo.

## Bloqueado por la clienta (checklist)

- [ ] Cuenta de Mercado Pago del negocio conectada en Configuración.
- [ ] Datos reales: planes y precios, grilla de horarios, profesores, salas,
      dirección, Instagram, fotos propias.
- [ ] Decisión sobre factura electrónica (¿desde el sistema o aparte?).
- [ ] Dominio propio elegido (conectar en Vercel).
- [ ] Cambiar la contraseña admin de prueba y pasar la lista del equipo real.

## Pendiente inmediato (Matías)

1. **URGENTE**: aplicar `0006` en el SQL Editor — quedó sin correr el 26/08
   (verificado en vivo: un signup con `role: admin` en la metadata todavía
   crea un admin). Aplicar también `0009` (fix formato de montos).
   `0007` y `0008` ya están aplicadas y verificadas ✅.
2. Supabase → Authentication → Sign In / Up → **deshabilitar signups
   públicos** (hoy siguen habilitados, verificado el 26/08).
3. Vercel → Environment Variables: `NEXT_PUBLIC_VAPID_PUBLIC_KEY`,
   `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT`, `CRON_SECRET` (los valores están en
   `.env.local`; elegir un `CRON_SECRET`). Cuando active Resend:
   `RESEND_API_KEY` y `EMAIL_FROM`.

## Estado técnico

| Ítem | Estado |
|---|---|
| Migraciones aplicadas | `0001` a `0005` ✅ · `0006`–`0008` escritas, **pendientes de aplicar** |
| Deploy | Vercel, auto-deploy desde `main` ✅ · cron diario en `vercel.json` |
| `SUPABASE_SERVICE_ROLE_KEY` | En `.env.local` ✅ · verificar en Vercel |
| VAPID / push | Claves generadas en `.env.local` · cargar en Vercel |
| Resend | Código listo, sin cuenta todavía (no-op hasta poner la key) |
| Webhook MP | Programado; registrar URL en MP al conectar la cuenta real |
| Usuarios de prueba | `admin@pilatestudio.com` (cambiar clave) · `camila.portal@…` (demo) |
| Roles | admin y recepción escriben; profesor consulta sin pagos ni datos médicos; alumno → portal (UI + RLS) ✅ |
| Acceso enviado a la clienta | 24/08/2026, cuenta admin + demo del portal |
