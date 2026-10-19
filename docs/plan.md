# Plan del proyecto

Plan para llevar la web app de listas de compras desde el scaffold actual
hasta un producto en producción con usuarios reales. Cubre decisiones
técnicas, arquitectura, fases de implementación, infraestructura, despliegue
y operación.

Estado: **decisiones aprobadas el 2026-10-17**. Cada decisión tiene su ADR
en [decisions/](decisions/). Cambiar una decisión implica escribir un ADR
nuevo que reemplace al anterior.

Alcance funcional de referencia: [roadmap.md](roadmap.md).

---

## 1. Principios que guían el plan

1. **Sin registro hasta compartir.** Se puede crear y usar la lista sin
   cuenta. La cuenta se pide solo al compartir o al querer recuperar la lista
   en otro dispositivo.
2. **Una persona puede operarlo.** Servicios gestionados con tier gratuito o
   barato, sin servidores propios.
3. **Pocas dependencias, bien elegidas.** Cada librería añadida tiene que
   resolver un problema que ya existe en el código.
4. **Mobile first y rápido.** Objetivo: añadir un ítem en menos de dos
   segundos desde que se abre la app, con el móvil en una mano. La latencia
   percibida se esconde con actualizaciones optimistas.
5. **Online por diseño, honesto sin red.** La app requiere conexión. Cuando
   no la hay, lo dice con claridad, no deja perder lo que se estaba
   escribiendo y reintenta sola.

---

## 2. Decisiones técnicas

### 2.1 Hosting del frontend

**Decisión: Vercel, plan Hobby.** [ADR 0001](decisions/0001-hosting-vercel.md)

- Integración nativa con Next.js 16, preview deployments por PR, dominios y
  certificados gestionados.
- El uso previsto es personal y de conocidos, así que Hobby es válido. Si
  en algún momento pasa a uso comercial, se migra a Pro (20 USD/mes) sin
  cambios de código.
- Alternativas descartadas: Netlify, Cloudflare Pages con OpenNext,
  Railway/Fly con Docker.

### 2.2 Backend, base de datos, auth y tiempo real

**Decisión: Supabase.** [ADR 0002](decisions/0002-backend-supabase.md)

- Postgres gestionado, Auth, Realtime y Row Level Security en un solo
  proveedor, con CLI, migraciones versionadas y entorno local con Docker.
- Auth soporta usuarios anónimos que luego se convierten en cuenta completa
  sin perder datos: es exactamente el flujo "sin registro hasta compartir".
- Alternativas descartadas: Convex, Firebase, Neon + Auth.js + WebSockets
  propios, PocketBase.
- Coste: Free para desarrollo y beta. **Pro (25 USD/mes) antes de abrir a
  usuarios fuera del círculo de prueba**: Free pausa proyectos tras una
  semana sin actividad y no incluye backups.

### 2.3 Modelo de datos en el cliente: solo online

**Decisión: sin capa local-first. Supabase directo con TanStack Query y
actualizaciones optimistas.** [ADR 0003](decisions/0003-online-only.md)

- Toda lectura va a Supabase a través de TanStack Query, que aporta caché
  en memoria, deduplicación, reintentos y estado de carga.
- Toda escritura es una mutación con actualización optimista: la UI cambia
  al instante y se revierte si el servidor rechaza. El patrón de referencia
  está en `src/lib/queries/items.ts` y `errors.ts`:
  - Una cola por lista: todas las escrituras de ítems comparten un `scope`
    (`items:<listId>`) y se ejecutan en serie, reintentos incluidos, así el
    servidor recibe los cambios en el orden del usuario (un marcado sobre un
    insert en vuelo espera a que la fila exista).
  - Rollback dirigido: `onError` deshace solo el cambio de esa mutación,
    nunca restaura un snapshot de la lista, y solo si la caché todavía
    muestra esa escritura (un cambio posterior sobre el mismo campo no se
    pisa).
  - `onSuccess` reemplaza la fila por la respuesta del servidor solo si
    `isLastWriteTo` confirma que no hay otra escritura pendiente sobre el
    mismo ítem.
  - `settle` invalida una sola vez, al terminar la última escritura en
    vuelo de la lista, tanto los ítems como el catálogo (lo cambian los
    triggers). Mientras hay escrituras en vuelo no hay refetch por foco ni
    por reconexión.
  - Reintentos solo ante status 0 (sin respuesta) o 5xx, con backoff y hasta
    tres veces; un rechazo (4xx) se revierte en el acto. Cada escritura
    tiene un timeout de 10 s, que cuenta como status 0. Si el reintento de
    un insert choca con su propio id (`23505`, se perdió la respuesta), se
    recupera la fila ya guardada.
- Supabase Realtime mantiene la caché al día con los cambios de otros
  miembros de la lista (`src/lib/queries/realtime.ts` y el final de
  `items.ts`):
  - Un canal por lista (`useListRealtime`, montado una vez en `ListView`)
    con `postgres_changes` de ítems y categorías filtrado por `list_id`.
    Hace `setAuth()` antes de unirse y usa un topic distinto por apertura
    (lo exige StrictMode). Se cierra al cambiar la lista o el usuario y al
    desmontar; si el servidor lo cierra, se reabre con backoff (1, 2, 5 y
    10 s). Los errores y timeouts los reintenta la librería.
  - La versión de una fila es `updated_at`: el trigger `set_updated_at`
    usa `clock_timestamp()`, así que crece con cada cambio confirmado. Un
    evento que no es más nuevo que la fila en caché no cambia nada: es un
    evento tardío, el eco de una escritura propia o un cambio ajeno que una
    lectura trajo antes que su evento. El eco se reconoce por las versiones
    (id y `updated_at`) que devolvieron las escrituras propias, no por la
    caché.
  - Mientras hay una escritura propia del ítem en cola o en vuelo gana el
    estado optimista y el evento queda para el refetch de `settle`.
  - Una lectura en vuelo cuando llega un cambio se cancela, y sigue una
    sola lectura 100 ms después por ráfaga, que espera a que no queden
    escrituras pendientes (`readItemsAgain`). No se deja a `settle`: la
    lectura cancelada puede ser la suya.
  - Una fila archivada queda marcada en la caché hasta el próximo refetch.
    Un UPDATE nunca crea una fila que falta: pide una lectura. Los DELETE
    traen solo el id. Un insert remoto entra en el orden del servidor.
  - Las categorías se invalidan con cualquier evento, el catálogo con
    altas y renombres remotos.
  - Recuperación: cada `SUBSCRIBED` vuelve a leer ítems, categorías y
    catálogo con las mismas reglas. El foco y la reconexión releen la
    lista aunque esté fresca, salvo que haya una escritura pendiente.
  - Pulso: la fila que otro miembro añade, edita, marca o devuelve se
    ilumina (`useRemoteChanges`), también si una lectura la mostró antes
    de que llegara su evento (en un UPDATE, si el registro anterior del
    evento dice qué cambió). Nunca por cambios propios, ecos, borrados ni
    archivados (ver `DESIGN_SYSTEM.md`, sección 5). Los lectores de
    pantalla reciben una frase por ráfaga en una región cortés
    (`useRemoteAnnouncement`), sin autor y nunca de cambios propios: lo
    que la ráfaga dejó en cada fila (marcar y desmarcar se anulan). Una
    baja que una lectura mostró antes que su evento no se anuncia, porque
    nada dice que el usuario haya visto la fila.
- Membresía (Fase 2c, `realtime.ts` y `lists.ts`): el mismo canal de la
  lista escucha también `list_members` filtrado por `list_id`. Un alta o una
  baja de otro miembro actualiza la lista de miembros y el conteo de la
  lista. Cuando el DELETE es de la propia membresía del usuario (salió, lo
  sacaron, o salió desde otro dispositivo), el canal se cierra en el acto y
  la lista sale de la caché sin esperar una lectura: la pantalla pasa a la
  otra lista del usuario o a una nueva suya y dice por qué
  (`useMembershipNotice`: "left", "removed" o "leave_failed"; "removed"
  también cubre salir desde otro dispositivo, por eso su texto es neutro).
  Realtime no aplica RLS a los eventos DELETE: es lo que permite que ese
  evento le llegue a alguien que ya no está en la lista, y por eso el canal
  no puede quedar abierto después (un no miembro que conozca el id de una
  lista oiría las bajas de ítems y de miembros). Cada `SUBSCRIBED` relee
  también las listas (y los miembros): si el usuario perdió la lista
  mientras no escuchaba, así se entera. Una lista perdida con la app
  cerrada se avisa en la apertura siguiente (`lista:last-list:<usuario>` en
  `localStorage`).
- Sin red: banner persistente "sin conexión", las mutaciones en curso se
  reintentan con backoff mientras la pestaña siga abierta, el texto del
  input de añadir se conserva. No se garantiza nada más.
- Esta decisión **saca "funciona offline" del alcance**. Queda en el
  roadmap como fase futura con la advertencia de que requerirá reemplazar
  esta capa por una local-first (Dexie + outbox o PowerSync). Se diseña el
  modelo de datos para no cerrar esa puerta: ids generados en el cliente,
  `updated_at` y borrados lógicos en todas las tablas sincronizables.

### 2.4 Autenticación

**Decisión: usuario anónimo al primer uso, conversión solo con magic
link.** [ADR 0004](decisions/0004-auth-magic-link.md)

- Sin OAuth de terceros por ahora. Menos configuración, menos superficie.
- Riesgo conocido: en móvil el enlace puede abrirse en otro navegador o
  caer en spam. Mitigaciones: código OTP de seis dígitos como alternativa
  al enlace (Supabase lo soporta en el mismo email), SMTP propio con
  dominio verificado antes de la beta, y texto claro en la pantalla de
  espera.
- Si la tasa de fallo en la beta es alta, añadir Google es un ADR nuevo y
  una tarde de trabajo.

### 2.5 PWA

**Decisión: Serwist** (`@serwist/turbopack`) para instalación y carga rápida,
no para offline. `@serwist/next` no funciona con el build de Turbopack de
Next 16; `@serwist/turbopack` es el paquete oficial de Serwist para ese caso
(marcado como experimental) y se verificó de punta a punta el 2026-10-17.

- Manifest, iconos, precache del app shell y assets. Página de "sin
  conexión" estática como fallback de navegación.
- Notificaciones push fuera del alcance inicial.

### 2.6 Interfaz

La dirección visual está en `DESIGN_DIRECTION.md` y es un requisito
fundamental del proyecto (nivel Awwwards). Las herramientas de abajo se
subordinan a ella.

- **Tailwind CSS 4** (ya instalado) con tokens de diseño en `globals.css`.
- **Primitivas accesibles sin estilo** (shadcn/ui o Base UI) solo por su
  comportamiento: diálogos, hojas, menús. La apariencia es siempre propia;
  nunca se entrega el estilo por defecto.
- **lucide-react** para iconos de interfaz con stroke 1.5; iconos de
  categoría e ilustraciones propios en `src/components/icons` e
  `src/components/illustrations`.
- **Motion for React** para el movimiento ([ADR 0009](decisions/0009-motion-for-react.md)).
- Referencia de implementación del sistema de diseño:
  [`DESIGN_SYSTEM.md`](DESIGN_SYSTEM.md).
- **TanStack Query** como única capa de estado de servidor. Estado de UI
  efímero en React. Sin store global.
- Sin librería de formularios. Validación con **zod** en los límites
  (entrada de usuario, respuestas de Supabase si hace falta).
- **Textos centralizados** en `src/lib/texts.ts`, solo español, sin
  librería de i18n. [ADR 0007](decisions/0007-spanish-only.md)
- **Moneda por ítem**, peso uruguayo (UYU) por defecto, formateo con
  `Intl.NumberFormat`. [ADR 0006](decisions/0006-currency-per-item.md)

### 2.7 Calidad y tooling

- **Prettier** con plugin de Tailwind.
- **Vitest** + Testing Library. Prioridad: normalización de nombres para
  autocompletado, totales por moneda, ordenación por categoría, hooks de
  mutación optimista.
- **Playwright** para los flujos críticos: primer uso anónimo, añadir y
  marcar, compartir y aceptar entre dos contextos de navegador, ver un
  cambio del otro en tiempo real.
- **GitHub Actions**: lint, typecheck, test y build en cada PR.
- Husky + lint-staged opcional.

### 2.8 Observabilidad y analítica

- **Sentry** para errores de cliente y servidor. [ADR 0005](decisions/0005-analytics-vercel.md)
- **Vercel Web Analytics** para visitas. Sin eventos personalizados por
  ahora. Si hace falta medir funnels, PostHog es un ADR nuevo.
- Logs de Supabase para base y auth.

### 2.9 Entornos

| Entorno    | Frontend                   | Supabase                                     |
| ---------- | -------------------------- | -------------------------------------------- |
| Local      | `npm run dev`              | `supabase start` (Docker) o proyecto staging |
| Preview    | Vercel preview por PR      | Proyecto staging                             |
| Producción | Vercel producción (`main`) | Proyecto producción                          |

Variables de entorno gestionadas en Vercel por entorno. Nunca claves
`service_role` en el cliente. `.env.example` versionado con nombres y sin
valores.

---

## 3. Arquitectura

### 3.1 Vista general

```
┌──────────────────── Navegador (PWA instalable) ────────────────────┐
│  React / Next.js App Router                                         │
│    └─ componentes ──► TanStack Query (caché + optimista)            │
│                              │                      ▲               │
│                        supabase-js                  │ Realtime      │
│  Service worker (Serwist): app shell, assets, página sin conexión   │
└──────────────────────────────┼──────────────────────┼───────────────┘
                               ▼                      │
                     ┌──────────────────────────────────┐
                     │  Supabase                        │
                     │  Postgres + RLS                  │
                     │  Auth (anónimo → magic link)     │
                     │  Realtime (un canal por lista)   │
                     └──────────────────────────────────┘
```

Server Components de Next.js se usan para el shell, el callback de auth y
las páginas estáticas. La lista en sí es un Client Component: necesita
Realtime, optimismo y foco en el input.

### 3.2 Modelo de datos (Postgres)

Se modela `lists` como tabla aunque la v1 muestre una sola lista por
usuario. Deja abierta la funcionalidad de múltiples listas sin migración
dolorosa.

```
lists
  id uuid pk, name text, created_by uuid,
  created_at, updated_at, deleted_at

list_members
  list_id uuid fk, user_id uuid fk, role text ('owner'|'member'), joined_at
  pk (list_id, user_id)

list_invites
  id uuid pk, list_id fk, token text unique, created_by,
  expires_at, used_at, used_by

categories
  id uuid pk, list_id fk, name text, position int, is_default bool,
  created_at, updated_at, deleted_at
  -- el orden (position) por lista ES el recorrido del supermercado

items
  id uuid pk, list_id fk, name text, name_normalized text,
  quantity numeric null, unit text null, note text null,
  category_id uuid null fk,
  estimated_price numeric null, currency text null default 'UYU',
  checked bool default false, checked_at timestamptz null,
  position int, created_by uuid, created_at, updated_at, deleted_at

catalog
  list_id fk, name_normalized text, display_name text,
  last_category_id uuid null, last_unit text null,
  last_price numeric null, last_currency text null,
  times_added int, last_added_at
  pk (list_id, name_normalized)
  -- fuente del autocompletado y de "frecuentes"; se actualiza por trigger
```

Reglas:

- `updated_at` y `deleted_at` en todas las tablas de dominio, aunque hoy
  no haya sync local. Es lo que mantiene abierta la puerta al offline.
- Ids UUID v7 generados en el cliente, por el mismo motivo y porque
  simplifica el optimismo (la UI conoce el id antes de la respuesta).
- RLS: un usuario solo ve filas de listas donde es miembro. Las policies se
  prueban con tests de integración contra Supabase local.
- `name_normalized`: minúsculas, sin tildes, espacios colapsados. Vive en
  `src/lib/domain` y se replica en SQL para el trigger.
- Categorías por defecto sembradas al crear una lista: frutas y verduras,
  carnes y pescados, fiambres y lácteos, panadería, almacén, bebidas,
  congelados, limpieza, higiene, otros.
- Totales: suma de `estimated_price` agrupada por `currency`, para
  pendientes y para el carro. Si solo hay una moneda se muestra un total.

### 3.3 Flujos clave

**Primer uso.** Se crea usuario anónimo en Supabase, una lista con
categorías por defecto y membresía como dueño. Si no hay red, pantalla de
sin conexión con reintento.

**Añadir ítem.** Input con autocompletado desde `catalog` (query cacheada,
filtrado en cliente). Enter inserta con mutación optimista: aparece al
instante con categoría sugerida, el input se vacía y conserva el foco. Si
el servidor falla, el ítem desaparece con un toast y el texto vuelve al
input.

**Marcar comprado.** Toggle optimista, el ítem baja a "en el carro". El
otro miembro lo ve en menos de un segundo vía Realtime.

**Compartir.** La app le pide al dueño una cuenta antes de invitar (correo
y código; es una regla de la interfaz: la base deja que un dueño anónimo cree
invitaciones, porque el carry-over las necesita) y genera un enlace de un
solo uso que vence a los 7 días. Quien abre
el enlace lo acepta como usuario anónimo, sin convertir nada: al aceptar se
inserta en `list_members` y esa lista pasa a ser la que ve (la última a la
que se unió). Cada miembro ve quiénes comparten la lista (su correo, o "Sin
cuenta" si es anónimo); el dueño saca a un miembro y un miembro puede salir
(el dueño no). Lo que quedó atrás se fusiona o se descarta: una lista propia
vacía se fusiona sin preguntar, una con ítems se pregunta ("traerlos o
descartarlos"), y descartar una lista ajena es salir de ella.

**Recuperar en otro dispositivo.** Al entrar con correo y código en un
dispositivo nuevo se cargan las listas donde el usuario es miembro. Si el
dispositivo tenía una lista anónima con ítems, antes de pedir el código se
deja un pase (`list_invites` con `purpose = 'carry_over'`; en `localStorage`
solo el token, el conteo y el correo de la cuenta) y, ya dentro de esa
cuenta, se ofrece traer esos ítems a su lista o dejarlos afuera. No hace falta unirse a la
lista anónima: la RPC copia con el token.

**Pérdida de conexión.** Banner "sin conexión". Las mutaciones pendientes
reintentan con backoff. Al volver la red, TanStack Query refresca y
Realtime se reconecta.

### 3.4 Estructura de código prevista

```
src/
  app/
    (app)/              layout de la app, página de la lista
    invite/[token]/     aceptar invitación
    auth/callback/      retorno de magic link
    offline/            página estática de sin conexión
  components/
    ui/                 primitivas (shadcn)
    list/               ItemRow, AddItemInput, CategoryGroup, Totals...
    share/              diálogo de compartir, lista de miembros
  lib/
    supabase/           clientes browser/server, tipos generados
    queries/            hooks de TanStack Query por entidad, con optimismo
    realtime/           suscripción por lista e invalidación de caché
    domain/             normalización, totales, ordenación (puro, testeable)
    texts.ts            todos los textos visibles
  types/
supabase/
  migrations/
  seed.sql
  config.toml
```

---

## 4. Fases

Cada fase tiene un criterio de salida verificable. No se empieza la
siguiente sin cumplirlo. Las estimaciones son en días de trabajo efectivo
con ayuda de Claude Code y sirven para ordenar, no para comprometer fechas.

### Fase 0. Preparación — medio día

Hecho el 2026-10-17:

- [x] Decisiones tomadas y registradas como ADR.
- [x] Primer commit.
- [x] Repositorio público en GitHub:
      https://github.com/martinzuro/supermarket-shopping-list
- [x] Workflow de CI (lint, typecheck, build) en `.github/workflows/ci.yml`.
- [x] Ruleset "Protect main": sin borrado ni force push, cambios solo por
      pull request, check "Lint, typecheck and build" obligatorio y rama al
      día con `main`. Sin revisores obligatorios (una sola persona).
      Las ramas se borran al mergear.

Cuentas, hecho el 2026-10-17:

- [x] **Vercel**: proyecto importado desde GitHub, preview por PR y
      producción desde `main`. Variables `NEXT_PUBLIC_SUPABASE_*` cargadas
      para preview y producción (ambas apuntan a staging hasta que exista el
      proyecto de producción). Pendiente: desactivar Vercel Authentication
      para producción en Deployment Protection, o nadie fuera de la cuenta
      podrá abrir la app.
- [x] **Supabase**: proyecto `supermarket-shopping-list-staging` en
      São Paulo con Postgres 17 (requerido: `normalize_name` usa la
      collation `pg_c_utf8`). El CLI va como devDependency de npm
      (`npx supabase`), porque Homebrew no lo instala con el Xcode de la
      máquina. Pendiente: proyecto de producción antes de la beta (Fase 4) y
      `npx supabase db push` para aplicar la migración a staging.
- [ ] **Sentry**: pospuesto por decisión del 2026-10-17 para ahorrar
      tiempo. Se retoma en la Fase 4 junto con la observabilidad.
- [ ] **Resend** puede esperar a la Fase 4; requiere dominio propio para
      verificar.

**Salida:** repo remoto con CI en verde y cuentas creadas.

### Fase 1. Fundaciones — 3 días

- Tooling: Prettier, Vitest, Playwright, GitHub Actions, `.env.example`.
- Supabase CLI, entorno local, primera migración con el esquema completo,
  RLS, triggers de `catalog` y `updated_at`, seed de categorías. Tipos
  TypeScript generados.
- Auth: usuario anónimo al primer uso, conversión con magic link y código
  OTP, callback, cierre de sesión.
- TanStack Query configurado con cliente de Supabase. Capa `queries/` con
  el patrón de mutación optimista definido y testeado una vez.
- PWA: manifest, iconos, service worker con app shell y página sin
  conexión. Prueba de instalación en iOS y Android.
- Sistema de diseño mínimo: tokens, tipografía, tamaños táctiles, modo
  oscuro, primitivas de shadcn necesarias.
- Deploy continuo a Vercel: preview por PR y producción desde `main`.

Estado al 2026-10-17: todo lo anterior está en `main`: tooling, sistema de
diseño provisional con layout vacío, PWA (`@serwist/turbopack`), esquema
con RLS y triggers verificado contra el stack local, tipos generados,
helpers de dominio, auth (usuario anónimo, conversión por código o enlace,
cierre de sesión), capa de queries con TanStack Query y el patrón de
mutación optimista testeado, y deploy continuo en Vercel con variables
hacia Supabase staging. Estado al 2026-10-18: el sistema de diseño Fresh
Editorial está construido y las pantallas existentes lo usan (PR 13 a 20,
ver `docs/DESIGN_SYSTEM.md`). Pendiente de la Fase 1: instalación probada
en iOS y Android (dispositivo real) y la revisión cruzada del sistema por
un modelo distinto al que lo construyó. Limitación
conocida: en staging los correos solo traen el enlace, no el código,
hasta configurar Resend (plan gratuito de Supabase).

**Salida:** la app se instala como PWA, crea un usuario anónimo y su
lista, muestra el layout final vacío y se despliega sola en cada merge.
Tests y CI en verde.

### Fase 2. Lista funcional y compartida — 3 a 4 días

**2a. Lista (1,5 días).** Añadir ítem con nombre, cantidad y unidad
opcionales. Marcar y desmarcar. Editar y borrar. Secciones "pendientes" y
"en el carro". Vaciar carro al terminar. Todo con mutaciones optimistas.

Estado al 2026-10-19: la 2a está en `main` (PR 27 a 29 y el cierre de
fase). Se puede añadir un ítem desde el campo único, que saca cantidad y
unidad del texto ("2 kg de tomates", "Leche x3"), marcar y desmarcar, editar
en una hoja (nombre, cantidad, unidad y nota) y borrar con confirmación
ligera (borrado blando con `deleted_at`). Pendientes se agrupa por categoría
en el orden del recorrido, y un ítem nuevo entra en la categoría que el
catálogo recuerda para ese producto (sin categoría, en "Otros"). "Vaciar el
carro" archiva con `deleted_at` las filas marcadas, con una sola marca de
tiempo y un solo pedido, y muestra el momento "Buena compra". Todo es
optimista, con un `scope` de mutaciones por lista, rollbacks dirigidos,
reintentos solo ante falta de respuesta o 5xx y timeout de 10 s por
escritura (ver 2.3). Los e2e con Supabase local (`E2E_SUPABASE=1`) cubren
cada flujo, incluido el criterio de salida de la 2a en
`e2e/phase-2a.spec.ts`. Cambio de alcance, a pedido del usuario: la
"agrupación y asignación automática desde el catálogo", que estaba en la
Fase 3, se adelantó a la 2a. Desde el 2026-10-19 esos e2e también corren en
CI: el job "E2E" levanta el stack local con `npx supabase start` (sin los
servicios que los tests no usan) y compila contra sus claves. El selector
manual de categoría sigue en la Fase 3.

**2b. Tiempo real (0,5 a 1 día).** Canal Realtime por lista,
invalidación o parche de caché al recibir cambios. Test e2e con dos
contextos de navegador.

Estado al 2026-10-19: la 2b está en `main` (PR 32 y el cierre de fase). Un
canal Realtime por lista mantiene la caché al día con los cambios de los
otros miembros sin romper el patrón optimista, con las reglas de 2.3:
versión por `updated_at` (migración `monotonic_updated_at`, que pasa el
trigger a `clock_timestamp()`), el estado optimista gana mientras hay
escrituras pendientes, una sola relectura por ráfaga y recuperación completa
en cada `SUBSCRIBED`, además de relectura al volver el foco o la red. La
fila que otro miembro añade, edita, marca o devuelve pulsa un segundo en
total (400 ms encendida y fundido de `duration-slow`); nunca pulsan los
cambios propios, que se reconocen por las versiones que devolvieron las
escrituras propias, y pulsa también el cambio ajeno que una lectura mostró
antes que su evento. Los tests unitarios de `realtime.test.tsx` cubren el
ciclo de vida del canal, los casos límite de la reconciliación, las ráfagas
y la recuperación. `e2e/phase-2b.spec.ts` abre dos contextos (dos miembros
de una lista, con la membresía puesta por el rol de servicio porque
compartir es la 2c), en claro y oscuro a 375px: mide cada paso en menos de 1
s (añadir, marcar, editar, añadir, borrar, escrituras en cola mientras el
otro escribe, vaciar el carro), comprueba que el pulso solo aparece en las
filas del otro miembro, sin pulso ni parpadeo en las propias, y corre en CI
con el resto. Limitaciones conocidas: el mismo usuario en otro dispositivo
ve pulsar sus propios cambios, porque los UPDATE no traen autor (haría falta
`updated_by`); y un INSERT que llega después de una lectura hecha tras
archivar la fila la muestra hasta que el evento de archivado, que llega a
continuación y en orden, la oculta; y dos altas simultáneas con la misma
posición se ordenan por la hora de creación, que en la fila optimista es la
del reloj del cliente, así que pueden intercambiarse al releer la lista.

**2c. Compartir (1,5 días).** Enlace de invitación, aceptación,
conversión de cuenta anónima, lista de miembros, salir de la lista, dueño
elimina miembro. Recuperar la lista en otro dispositivo.

Estado al 2026-10-19: la 2c está en `main` (PR 35, 36 y el cierre de
fase) y con ella la Fase 2 completa. El PR 35 trajo la capa de datos
(migraciones de compartir, RPC `accept_invite`, `merge_list`,
`claim_carry_over`, `list_member_emails`, y los hooks de `src/lib/queries`);
el 36, el enlace y la pantalla de invitación; este, los miembros, los avisos
de pérdida de lista y las preguntas de "traer lo de otra lista". Decisiones
que quedaron: quien acepta lo hace como usuario anónimo, sin convertir;
los enlaces son de un solo uso y duran 7 días; la app le pide al dueño una
cuenta antes de invitar; los miembros se reconocen por su correo (no hay perfiles)
y "Sin cuenta" si son anónimos; en la v1 se ve una sola lista, la última a
la que el usuario se unió. Reglas de la fusión (`merge_list`): gana el
destino por `name_normalized` (lo que ya está no se duplica), los ítems del
carro siguen marcados, las categorías se emparejan por nombre y las
entradas del catálogo que el destino no tiene vienen con su historial.
`claim_carry_over` aplica las mismas reglas desde la lista anónima de otro
dispositivo, sin unirse a ella. La hoja de la cabecera (`UserPlus` o
`Users`) es para todos: lista a los miembros, el dueño además saca a
alguien (confirmación ligera, optimista) e invita, un miembro además sale.
Quien sale o es sacado deja de ver la lista en el acto y lo dice un aviso
arriba de la lista; las dos preguntas de traer ítems son un bloque de la
pantalla de la lista (`BringOver`). Los e2e de `e2e/phase-2c.spec.ts`
(invitar y aceptar, con los tiempos de la 2b) y de
`e2e/phase-2c-members.spec.ts` (quitar a un miembro y que pierda la lista
en menos de un segundo, salir, traer o descartar lo que quedó atrás, y
recuperar la cuenta en otro dispositivo con "traer" y con "dejar afuera"),
en claro y oscuro a 375px y con capturas, cubren el criterio de salida. Los
tests de base de datos están en `e2e/sharing-db.spec.ts`.

Limitaciones conocidas de la 2c:

- Un miembro anónimo que más tarde entra a otra cuenta que ya existía deja
  de ver la lista compartida (su usuario anónimo, que era el miembro, ya no
  es el de la sesión), y lo que había en ella no se le ofrece traer: el
  carry-over solo sale de una lista propia que nadie más usa.
- El carry-over queda atado al correo al que se pidió entrar: si en ese
  dispositivo entra otra cuenta, no se le ofrece.
- El dueño de una lista que otros usan, si se une a otra, deja la suya atrás
  y sin verla (la v1 muestra una sola lista): no se le ofrece fusionarla ni
  descartarla, porque descartarla sacaría a los demás.
- Un aceptar concurrente puede colarse entre el chequeo `list_shared` y el
  descarte de una lista propia.
- Quien no es miembro pero conoce el id de una lista puede oír los ids de
  los usuarios que la dejan y los de ítems borrados de verdad (los DELETE de
  Realtime no pasan por RLS).
- Un enlace de una lista en la que el usuario ya es miembro pero que no es
  la actual ("Ya estás adentro") lleva a "Ir a la lista", que abre la lista
  actual (la última a la que se unió), no esa.

**Salida (cumplida):** dos personas en dos teléfonos comparten una lista y
ven los cambios de la otra en menos de un segundo.

### Fase 3. Diferencial — 5 días

- **Categorías y recorrido:** cambio manual, reordenar categorías (flechas
  arriba/abajo, más fiable en móvil que arrastrar), orden persistido por
  lista. La agrupación y la asignación automática desde el catálogo se
  adelantaron a la Fase 2a.
- **Autocompletado y frecuentes:** sugerencias desde `catalog`, vista de
  frecuentes con un toque para añadir, botón "lo de siempre".
- **Notas por ítem.**
- **Precio estimado por ítem con moneda:** UYU por defecto, selector de
  moneda en el ítem, recuerda último precio y moneda del catálogo, totales
  por moneda para pendientes y carro.

**Salida:** roadmap "Esencial" (menos offline) y "Diferencial" completos y
probados en dispositivo real.

### Fase 4. Preparación para producción — 3 a 4 días

- **Rendimiento:** Lighthouse móvil y PWA por encima de 90, bundle
  analizado, fuentes locales, sin layout shift.
- **Accesibilidad:** teclado, etiquetas, contraste, 44 px táctiles,
  auditoría con axe en Playwright.
- **Robustez:** estados vacío, sin red, sesión perdida, lista sin acceso,
  invitación caducada, mutación rechazada.
- **Seguridad:** tests de RLS, rate limit en invitaciones, cabeceras
  (CSP, HSTS), dependencias auditadas.
- **Email:** Resend como SMTP de Supabase con dominio verificado (SPF,
  DKIM, DMARC). El SMTP por defecto no sirve para usuarios reales.
- **Datos y legal:** página de privacidad simple, borrado de cuenta
  autoservicio, exportar lista como texto.
- **Observabilidad:** Sentry en cliente y servidor con alertas, Vercel
  Analytics activado.
- **Backups:** Supabase Pro antes de la beta, restauración documentada y
  probada una vez.
- **Documentación:** `docs/runbook.md`.

**Salida:** checklist completa, runbook escrito, restauración probada.

### Fase 5. Beta y apertura — 2 semanas de calendario

- Subdominio de Vercel mientras no haya nombre. Dominio propio cuando lo
  haya.
- Beta con 5 a 10 hogares conocidos. Feedback por el canal que ya uses con
  ellos. Revisión diaria de Sentry.
- Corregir por frecuencia. Medir especialmente la tasa de éxito del magic
  link en móvil: si es mala, ADR para añadir Google.
- Abrir a quien quiera usarla.

**Salida:** app en uso por hogares fuera del tuyo, sin errores críticos en
una semana.

### Fase 6. Operación continua

- Revisión semanal de errores y costes.
- Dependabot o Renovate mensual.
- Backlog en GitHub Issues. Candidatos: offline (reescritura de la capa de
  datos), múltiples listas, añadir por voz, importar texto pegado,
  notificaciones push, recetas, despensa.

---

## 5. Infraestructura y costes estimados

| Servicio | Uso                            | Coste inicial    | Coste con usuarios reales                  |
| -------- | ------------------------------ | ---------------- | ------------------------------------------ |
| Vercel   | Frontend, previews, analytics  | 0 (Hobby)        | 0 mientras el uso sea no comercial         |
| Supabase | DB, auth, realtime             | 0 (Free)         | 25 USD/mes Pro, por backups y no pausa     |
| Resend   | Emails de auth                 | 0 (3.000/mes)    | 0 hasta superar el límite                  |
| Sentry   | Errores                        | 0 (Developer)    | 0 salvo volumen alto                       |
| Dominio  | Cuando haya nombre             | 0                | 10 a 15 USD/año                            |
| GitHub   | Repo, Actions                  | 0                | 0                                          |

Total realista en producción: 25 USD al mes, más dominio si se compra.

---

## 6. Riesgos y mitigaciones

| Riesgo | Impacto | Mitigación |
| ------ | ------- | ---------- |
| Sin red dentro del supermercado, que es el momento de uso principal | Alto | Decisión consciente. Banner claro, reintentos, input que no pierde texto. Si la beta muestra que duele, offline sube al tope del backlog y se asume la reescritura |
| Magic link falla en móvil (otro navegador, spam) | Medio | Código OTP en el mismo email, Resend con dominio verificado, medir en beta, Google como ADR de reserva |
| Next.js 16 es muy reciente y difiere de lo que Claude Code conoce | Medio | Leer `node_modules/next/dist/docs/` antes de tocar rutas, caché o data fetching |
| Supabase Free pausa el proyecto | Alto en producción | Pro antes de la beta |
| Límites de Realtime | Bajo al inicio | Un canal por lista, desconectar en segundo plano |
| El alcance se expande antes de lanzar | Alto | Fases con criterio de salida; nada del backlog entra antes de la Fase 5 |
| Nombre provisional se queda para siempre | Bajo | Cambiarlo toca manifest, emails y títulos; está centralizado en `texts.ts` y variables de entorno |

---

## 7. Decisiones tomadas (antes "preguntas abiertas")

Resueltas el 2026-10-17:

| Pregunta | Decisión |
| -------- | -------- |
| Estrategia de sync | Solo online. Offline pasa a fase futura asumiendo reescritura |
| Autenticación | Solo magic link (con OTP). Google como reserva |
| Uso comercial | Personal y conocidos. Vercel Hobby |
| Analítica | Vercel Web Analytics, sin eventos |
| Moneda | UYU por defecto, configurable por ítem, totales por moneda |
| Idioma | Solo español, textos centralizados |
| Nombre y dominio | Provisional "Lista" y subdominio de Vercel |

---

## 8. Criterios de éxito del proyecto

- Añadir un ítem tarda menos de dos segundos desde abrir la app instalada.
- Dos personas ven los cambios de la otra en menos de un segundo.
- Lighthouse móvil y PWA por encima de 90.
- Cero errores no manejados en Sentry durante la primera semana pública.
- Al menos tres hogares de la beta siguen usándola un mes después sin que
  se les pida.
