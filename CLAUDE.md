# Cómo se trabaja en este proyecto

Sistema de gestión para el estudio de Pilates **Casa Fé**. Next.js 16 (App
Router) + React 19 + Tailwind 4, Supabase (Postgres con RLS) y Mercado Pago.

## La hoja de ruta

El documento de la clienta manda: **[`docs/REQUERIMIENTOS-CASA-FE.md`](docs/REQUERIMIENTOS-CASA-FE.md)**
tiene el estado por sección, los choques con lo que ya funciona, las
decisiones tomadas y el plan por bloques. El anexo
[`docs/requerimientos-casa-fe-detalle.md`](docs/requerimientos-casa-fe-detalle.md)
tiene los 178 requerimientos uno por uno.
[`docs/PLAN.md`](docs/PLAN.md) es el registro de lo construido.

**Actualizar esos documentos es parte de terminar un bloque**, no un extra.

## El criterio que ordena las decisiones

**Lo que es un número o un texto se configura desde el sistema, no se
escribe en el código.** Plazos, anticipaciones de avisos, ventanas de pago,
precios, disciplinas, datos del estudio: todo eso vive en tablas que el
estudio edita desde Configuración. Así la clienta ajusta sus reglas sin
esperar un desarrollo, y nosotros no quedamos bloqueados esperando
respuestas.

Corolario: cuando aparece una pregunta de negocio, antes de frenar hay que
preguntarse si se puede parametrizar. Casi siempre se puede.

## Migraciones

Van en `supabase/migrations/`, numeradas, y **se corren a mano en el SQL
Editor del dashboard de Supabase** — no hay CLI ni automatismo. Por eso:

- Cada migración se escribe para pegarse entera y envuelta en
  `begin; ... commit;`, así un error no deja media migración aplicada.
- El código tiene que tolerar que la migración todavía no haya corrido:
  valores por defecto, `select('*')` en vez de listar columnas nuevas,
  bloques `try/catch` alrededor de tablas nuevas. El sistema sigue
  funcionando igual hasta que la migración se aplica.
- Las migraciones que cambian políticas llevan su propio bloque de vuelta
  atrás comentado al final.
- Los comentarios explican **por qué**, no qué. El qué se lee en el SQL.

## La base es la autoridad, la pantalla solo acompaña

Las políticas de RLS son las que deciden. La interfaz esconde lo que la
base va a rechazar igual, para no ofrecer acciones que van a fallar — pero
esconder un botón nunca es la protección.

Cuidado con los endpoints de `app/api/**`: usan el service role, que **no
pasa por las políticas**. Ahí el permiso se exige a mano con
`exigir(request, 'clave')` de [`lib/permisos-server.ts`](lib/permisos-server.ts).

## Permisos

Motor configurable por rol y por persona (migraciones 0012-0014). Lo que
hay que saber para no romperlo:

- Cada clave guarda en `legacy_roles` lo que el sistema respondía **antes**
  del motor, y mientras está en `enforce_mode = 'sombra'` responde eso. Por
  eso migrar políticas a `can()` es un cambio sin efecto, verificable.
- **`select * from public.perm_diff()` tiene que dar cero filas.** Cualquier
  fila ahí es un permiso que cambió sin que nadie lo pidiera.
- El encendido va grupo por grupo: `update permission_keys set
  enforce_mode = 'activo' where grupo = '...'`, y se revierte igual.
- Interruptor de pánico: `update permission_config set value = 'emergencia'
  where key = 'modo'`.
- `can()` va **siempre** envuelta en `(select ...)` dentro de una política.
  Suelta se evalúa una vez por fila.
- Lo que nunca es configurable: el aislamiento de la alumna
  (`my_student_ids`), la administración de perfiles, el token de Mercado
  Pago y las políticas del propio motor.

## Verificación

**Nada se da por hecho sin verlo andar.** El flujo es: `preview_start` con
`pilates-dev`, entrar con la sesión real, ejercer la acción y comprobar el
resultado contra la base — no contra la pantalla.

- Para probar algo que la interfaz no expone, se agrega una sonda temporal
  en `lib/data-context.tsx` (`window.__loquesea`, solo en desarrollo), se
  usa, y **se quita antes de commitear**.
- Al sacar la sonda, cuidado con no llevarse el bloque de `permisos` /
  `can` que está pegado abajo. Ya pasó dos veces.
- Los datos de prueba se revierten: si se crea una reserva, se borra; si se
  cambia un parámetro, se deja como estaba.
- Un `delete` que devuelve `error: null` **no garantiza que haya borrado**:
  si la política lo rechaza, la fila simplemente no se toca. Hay que mirar
  cuántas filas volvieron.

## Git

- Se trabaja en la rama **`matias`** y Matías mergea a `main` por PR. El
  deploy de Vercel sale de `main`.
- Commits en español. El título dice qué cambió; el cuerpo, **por qué** y
  qué se verificó. Si el cambio arregla algo, explicar cuál era el síntoma.
- No commitear sin que `npx tsc --noEmit` y `npx next build` pasen.

## Cosas del código que conviene saber

- `fetchStudioData` (en [`lib/api.ts`](lib/api.ts)) trae el estudio entero en
  un solo paquete y las pantallas derivan de ahí. Para reportes con rangos
  de fechas eso no va a escalar: hay que ir a vistas SQL.
- Una tabla sin permiso devuelve **cero filas, no un error**. Por eso
  `StudioData.denied` dice qué quedó fuera de alcance, y las pantallas
  distinguen "no tenés acceso" de "está vacío" en vez de mostrar un $0 que
  miente.
- RLS filtra **filas, no columnas**. Por eso lo sensible vive en tablas
  satélite (`student_private`). Si mañana hay sueldos, van en
  `teacher_private`, no como columna de `teachers`.
- Las bajas son lógicas: `active = false`. El sistema casi no borra nada.
- El huso horario del estudio es `America/Argentina/Buenos_Aires` y el día
  se deriva siempre de ahí (migración 0016).

## Lo que le decimos a la clienta

Sin prometer lo que el sistema no hace. Dos ejemplos que ya están escritos
en la interfaz y conviene sostener:

- Los permisos en sombra avisan que todavía no rigen.
- Sacar "ver información financiera" esconde los pagos, pero **no** el
  precio que figura en la membresía: la base filtra por dato, no por campo
  suelto.
