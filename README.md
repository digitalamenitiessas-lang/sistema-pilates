# PilatesStudio — Sistema de Gestión + Landing

Sistema integral para un estudio de Pilates: landing pública animada, gestión de
alumnos, planes, agenda, reservas y pagos, con integración autogestionable de
Mercado Pago.

## Stack

- **Next.js 16** (App Router) + React 19 + Tailwind 4
- **Supabase**: Postgres, Auth con roles (admin / recepción / profesor / alumno) y RLS
- **Mercado Pago**: links de pago Checkout Pro con acreditación automática

## Rutas

- `/` — landing pública (planes y horarios se leen en vivo de la base)
- `/sistema` — sistema de gestión (requiere login)
- `/api/mp/*` — endpoints server-side de Mercado Pago

## Desarrollo local

```bash
pnpm install
pnpm dev
```

Crear `.env.local` con:

```
NEXT_PUBLIC_SUPABASE_URL=<url del proyecto Supabase>
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=<publishable key>
```

## Base de datos

Las migraciones están en `supabase/migrations/` y se ejecutan en orden en el
SQL Editor del dashboard de Supabase:

1. `0001_fase1.sql` — esquema completo + RLS + datos de arranque
2. `0002_fase2_mercadopago.sql` — configuración y columnas de Mercado Pago
3. `0003_landing_publica.sql` — vistas públicas para la landing
4. `0004_autogestion.sql` — catálogo de salas + email en perfiles (gestión de usuarios)

## Deploy (Vercel)

1. Importar el repo en Vercel (framework: Next.js, sin configuración extra).
2. Variables de entorno:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
   - `SUPABASE_SERVICE_ROLE_KEY` *(habilita el webhook de Mercado Pago para
     acreditación instantánea y la gestión de usuarios desde Configuración;
     sin ella la acreditación corre al abrir Pagos y los usuarios se crean
     desde el dashboard de Supabase)*
3. Con el sitio desplegado, registrar el webhook en la aplicación de Mercado
   Pago: `https://<dominio>/api/mp/webhook` (evento: Pagos).

## Personalización de la landing

Los datos del estudio (dirección, WhatsApp, redes, horarios de atención) se
editan en la constante `STUDIO` al inicio de
`components/landing/landing-page.tsx`.
