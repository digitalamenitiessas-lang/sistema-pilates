# Plan de avance — PilatesStudio

> Documento vivo. Se actualiza con cada bloque de trabajo.
> Última actualización: **04/08/2026** (portal del alumno verificado end-to-end).
> Snapshot para compartir: `docs/PilatesStudio-integraciones-y-etapas.pdf`.

## Estado general

Sistema desplegado en Vercel y operativo con datos de ejemplo. Núcleo completo
(gestión + cobros + landing + autogestión + portal del alumno). Lo que falta se
divide en: trabajo nuestro (avisos automáticos, mostrador) y cosas bloqueadas
por la clienta (cuenta MP, datos reales, decisiones de negocio).

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

### 🔜 Etapa 2 — Cobranza que se cobra sola *(próximo bloque nuestro)*
- [ ] Avisos automáticos por email (cron diario en Vercel + Resend):
      membresía por vencer, deuda generada, pago recibido. **No depende de
      nadie** (sandbox ahora, dominio del estudio después).
- [ ] Débito automático mensual (Suscripciones MP). **Bloqueado**: requiere
      la cuenta MP real de la clienta para probar con cobros de verdad.

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

## Estado técnico

| Ítem | Estado |
|---|---|
| Migraciones aplicadas | `0001` a `0005` ✅ |
| Deploy | Vercel, auto-deploy desde `main` ✅ |
| `SUPABASE_SERVICE_ROLE_KEY` | En `.env.local` ✅ · verificar en Vercel |
| Webhook MP | Programado; registrar URL en MP al conectar la cuenta real |
| Usuarios de prueba | `admin@pilatestudio.com` (cambiar clave) · `camila.portal@…` (demo) |
