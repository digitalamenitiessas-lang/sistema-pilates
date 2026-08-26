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

### 🔜 Etapa 2 — Cobranza que se cobra sola *(casi completa)*
- [x] **Renovación automática de membresías** (26/08, migración `0010`): el
      cron renueva las vencidas con `auto_renew` (mismo plan, precio actual
      del plan), genera la cuota pendiente a 5 días con link de MP si está
      conectado, avisa al staff y le manda el email a la alumna con el botón
      de pagar. Interruptor por membresía en la ficha (si una alumna deja,
      se apaga y listo). Los planes de prueba nunca se renuevan solos.
- [x] Avisos automáticos por email (26/08): código listo con Resend —
      arrancan solos al cargar `RESEND_API_KEY` en Vercel.
- [ ] Débito automático mensual (Suscripciones MP). Se puede **desarrollar y
      probar ya** con las credenciales de prueba de MP; solo el primer cobro
      real necesita la cuenta de la clienta. *(Evaluar si hace falta: la
      renovación + link de pago en el email ya cubre gran parte.)*

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

## Pendiente inmediato

- ~~Migración `0010`~~ ✅ aplicada; renovación verificada end-to-end el
  26/08 (renueva, genera cuota, notifica, email entregado, idempotente).
- **Cargar `RESEND_API_KEY` en Vercel** (mismo valor que `.env.local`) para
  que producción también mande emails.
- Resend en sandbox: sin dominio verificado solo entrega a
  `digitalamenitiessas@gmail.com`. Al tener el dominio del estudio:
  Resend → Domains → verificar DNS → `EMAIL_FROM` en Vercel, y los emails
  a las alumnas fluyen solos.

## Estado técnico

| Ítem | Estado |
|---|---|
| Migraciones aplicadas | `0001` a `0009` ✅ (verificadas 26/08) |
| Deploy | Vercel, auto-deploy desde `main` ✅ · npm (adiós pnpm) · cron diario en `vercel.json` |
| `SUPABASE_SERVICE_ROLE_KEY` | En `.env.local` ✅ · verificar en Vercel |
| VAPID / push | Claves generadas en `.env.local` · cargar en Vercel |
| Resend | ✅ Activo en sandbox (26/08, email real entregado) · key en `.env.local`, cargar en Vercel · dominio del estudio pendiente para emails a alumnas |
| Webhook MP | Programado; registrar URL en MP al conectar la cuenta real |
| Usuarios de prueba | `admin@pilatestudio.com` (cambiar clave) · `camila.portal@…` (demo) |
| Roles | admin y recepción escriben; profesor consulta sin pagos ni datos médicos; alumno → portal (UI + RLS) ✅ |
| Acceso enviado a la clienta | 24/08/2026, cuenta admin + demo del portal |
