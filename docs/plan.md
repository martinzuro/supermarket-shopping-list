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
  al instante y se revierte si el servidor rechaza.
- Supabase Realtime mantiene la caché al día con los cambios de otros
  miembros de la lista.
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

**Decisión: Serwist** (`@serwist/next`) para instalación y carga rápida,
no para offline.

- Manifest, iconos, precache del app shell y assets. Página de "sin
  conexión" estática como fallback de navegación.
- Notificaciones push fuera del alcance inicial.

### 2.6 Interfaz

- **Tailwind CSS 4** (ya instalado) con tokens de diseño en `globals.css`.
- **shadcn/ui** para primitivas accesibles (diálogos, sheets, menús,
  toasts). Se copian al repo. Añadir componentes solo cuando se necesiten.
- **lucide-react** para iconos.
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

**Compartir.** El dueño genera un enlace con token. Si es anónimo, antes
convierte su cuenta con magic link. Quien abre el enlace, si es anónimo,
también convierte la suya. Al aceptar se inserta en `list_members`.

**Recuperar en otro dispositivo.** Al entrar con magic link en un
dispositivo nuevo, se cargan las listas donde es miembro. Si además había
una lista anónima local en ese dispositivo, se ofrece fusionar o descartar.

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

Pendiente, requiere acción del usuario:

- [ ] **Cuenta de Vercel** en https://vercel.com/signup con la cuenta de
      GitHub. Importar el repo. Vercel detecta Next.js solo; no hace falta
      configurar nada hasta la Fase 1. Después, `npm i -g vercel` y
      `vercel login` para enlazar el proyecto desde local.
- [ ] **Cuenta de Supabase** en https://supabase.com/dashboard con la
      cuenta de GitHub. Crear una organización y dos proyectos:
      `supermarket-shopping-list-staging` y
      `supermarket-shopping-list-prod`, región `South America (São Paulo)`
      por cercanía a Uruguay. Guardar la contraseña de la base de cada uno
      en un gestor de contraseñas. Después, `brew install supabase/tap/supabase`
      y `supabase login`.
- [ ] **Cuenta de Sentry** en https://sentry.io/signup con la cuenta de
      GitHub. Crear un proyecto de tipo Next.js. Se integra en la Fase 4,
      pero tener el DSN desde la Fase 1 evita rehacer configuración.
- [ ] **Resend** puede esperar a la Fase 4; requiere dominio propio para
      verificar.

Cuando las cuentas existan, avisar en la sesión para enlazar el repo con
Vercel y crear la configuración local de Supabase.

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

**Salida:** la app se instala como PWA, crea un usuario anónimo y su
lista, muestra el layout final vacío y se despliega sola en cada merge.
Tests y CI en verde.

### Fase 2. Lista funcional y compartida — 3 a 4 días

**2a. Lista (1,5 días).** Añadir ítem con nombre, cantidad y unidad
opcionales. Marcar y desmarcar. Editar y borrar. Secciones "pendientes" y
"en el carro". Vaciar carro al terminar. Todo con mutaciones optimistas.

**2b. Tiempo real (0,5 a 1 día).** Canal Realtime por lista,
invalidación o parche de caché al recibir cambios. Test e2e con dos
contextos de navegador.

**2c. Compartir (1,5 días).** Enlace de invitación, aceptación,
conversión de cuenta anónima, lista de miembros, salir de la lista, dueño
elimina miembro. Recuperar la lista en otro dispositivo.

**Salida:** dos personas en dos teléfonos comparten una lista y ven los
cambios de la otra en menos de un segundo.

### Fase 3. Diferencial — 5 días

- **Categorías y recorrido:** agrupación, asignación automática desde el
  catálogo, cambio manual, reordenar categorías (flechas arriba/abajo,
  más fiable en móvil que arrastrar), orden persistido por lista.
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
