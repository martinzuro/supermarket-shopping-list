# CLAUDE.md

Contexto e instrucciones para sesiones de Claude Code en este repositorio.

## Objetivo del proyecto

Desarrollar una web app para gestionar listas de compras de supermercado.

## Estado actual

Fase 1 (fundaciones) casi completa; Fase 2a (la lista con ítems reales) y
2b (tiempo real) entregadas el 2026-10-19, ver el estado fechado en
`docs/plan.md`. En `main`: tooling
(Prettier, Vitest, Playwright, CI), PWA, esquema de Supabase con RLS y
triggers en `supabase/migrations/`, tipos generados en
`src/lib/supabase/database.types.ts`, helpers puros en `src/lib/domain/`,
auth anónima con conversión por código, capa de queries con TanStack Query
y canal Realtime por lista, y el sistema de diseño Fresh Editorial
construido y aplicado a las pantallas (`docs/DESIGN_SYSTEM.md`, página
interna `/design`). La lista guarda ítems (añadir, marcar, editar, borrar,
agrupar por categoría, vaciar el carro), todo optimista, y refleja los
cambios de otros miembros. Lo siguiente es la 2c (compartir).

## Decisiones tomadas

Las decisiones de arquitectura están cerradas y documentadas:

- `docs/plan.md`: plan completo (arquitectura, modelo de datos, fases,
  despliegue, operación). Es la referencia principal antes de implementar
  cualquier cosa.
- `docs/decisions/`: un ADR por decisión. Para cambiar una decisión se
  escribe un ADR nuevo, no se edita el existente.
- `docs/roadmap.md`: alcance funcional.

Resumen de lo decidido (2026-10-17):

- Hosting en Vercel (Hobby). Backend, auth y tiempo real en Supabase.
- Cliente **solo online**: TanStack Query con actualizaciones optimistas y
  Supabase Realtime. Sin base local ni cola offline. Offline es fase futura.
- Auth: usuario anónimo al primer uso, conversión solo por magic link con
  código OTP. Sin OAuth.
- Sentry para errores (pospuesto hasta la Fase 4), Vercel Web Analytics
  para visitas.
- PWA con Serwist vía `@serwist/turbopack` (`@serwist/next` no funciona
  con el build de Turbopack de Next 16).
- Moneda por ítem, UYU por defecto, totales agrupados por moneda.
- Solo español, textos centralizados en `src/lib/texts.ts`.
- Nombre provisional del producto: "Lista".

No implementar nada que contradiga un ADR sin que el usuario lo pida
explícitamente. Seguir el orden de fases del plan: no adelantar trabajo de
una fase posterior.

## Calidad visual: requisito fundamental

La calidad visual y de experiencia al nivel de los mejores sitios
reconocidos por Awwwards es un requisito del proyecto, no un deseable.
Esto significa identidad propia, dirección de arte, tipografía con
criterio, movimiento diseñado y cero apariencia de plantilla o de
componente por defecto.

Antes de cualquier trabajo de interfaz (tokens, componentes, pantallas,
animaciones, iconos, estados vacíos, textos visibles), leer en este orden:

1. `docs/DESIGN_SYSTEM.md`: qué existe en el código (tokens, tipografía,
   componentes, motion, iconos, ilustraciones, pruebas) y cómo se extiende.
2. `docs/DESIGN_DIRECTION.md`: concepto "Fresh Editorial", principios
   visuales y las decisiones aprobadas (ADR 0008).
3. `docs/DESIGN_REFERENCES.md`: análisis de las cinco referencias y los
   principios que se trasladan y los que no.

Reglas que se derivan de esos documentos y se aplican siempre:

- Nunca entregar un componente con la apariencia por defecto de una
  librería. Las primitivas accesibles pueden venir de fuera; el aspecto es
  siempre propio y sale de los tokens del proyecto.
- Sin degradados ni glassmorphism decorativos, sin más de un nivel de
  sombra, sin interfaces de tarjetas, sin fotografía de stock, sin emojis
  como iconos.
- Todo movimiento usa los tokens de duración y curva del sistema, solo
  anima `transform` y `opacity` en interacciones frecuentes y respeta
  `prefers-reduced-motion`.
- Las pantallas se construyen con los tokens y componentes existentes
  (`src/app/globals.css`, `src/components/ui`, `src/components/motion`).
  No se añaden tokens ni componentes hasta que una pantalla real los pida,
  y cuando se añaden siguen la sección 11 de `docs/DESIGN_SYSTEM.md`:
  dos modos, test de contraste, muestra en `/design`.
- Toda pieza visual se verifica renderizada a 375px en claro y oscuro
  antes de abrir el PR. `e2e/visual.spec.ts` captura las pantallas
  principales y comprueba invariantes del sistema en CI.

## Stack

- Next.js 16 con App Router y Turbopack. Esta versión tiene cambios respecto
  a versiones anteriores: antes de escribir código, consultar las guías en
  `node_modules/next/dist/docs/` (ver también `AGENTS.md`, que `next dev`
  regenera automáticamente).
- React 19, TypeScript en modo `strict`, Tailwind CSS 4 (configuración por
  CSS en `src/app/globals.css`, sin `tailwind.config`).
- ESLint con `eslint-config-next`, Prettier con plugin de Tailwind.
- Vitest + Testing Library para unitarios, Playwright para e2e (proyecto
  móvil, Pixel 7).
- Supabase: CLI como devDependency (`npx supabase`), stack local con
  Docker. La API local escucha en el puerto 54331, no en el 54321.
- npm. No usar otros package managers.

## Estructura

```
src/app/         Rutas, layouts y páginas (`/design` es la muestra interna)
src/components/  Componentes reutilizables
src/components/ui/            Componentes base del sistema de diseño
src/components/motion/        Primitivas de Motion for React
src/components/icons/         Iconos de categoría propios
src/components/illustrations/ Ilustraciones monolínea
src/components/welcome/       Bienvenida del primer uso
src/lib/         Utilidades y lógica compartida
src/lib/design/  Tokens en TypeScript, contraste y su test
src/lib/domain/  Funciones puras (normalización, totales, orden), con tests
src/lib/supabase/ Clientes y tipos generados (`database.types.ts`)
src/types/       Tipos de TypeScript compartidos
public/          Archivos estáticos
supabase/        config.toml, migraciones, seed y plantillas de email
docs/            Documentación del proyecto
```

Alias de importación: `@/*` apunta a `src/*`.

## Comandos

```bash
npm run dev        # desarrollo en http://localhost:3000
npm run build      # build de producción
npm run lint       # ESLint
npm run typecheck  # next typegen + tsc --noEmit
npm run format     # Prettier (format:check solo comprueba)
npm test           # Vitest
npm run test:e2e   # Playwright (requiere build previo)
npm run db:start   # Supabase local (db:stop, db:reset, db:types)
```

Antes de dar por terminado un cambio, ejecutar `npm run lint`,
`npm run typecheck`, `npm run format:check`, `npm test`, `npm run test:e2e`
y por último `npm run build`. Los e2e van antes del build: `next build`
con `next dev` abierto deja el dev server sirviendo CSS viejo (si pasa,
parar la preview, borrar `.next/dev` y relanzar).
Si cambia el esquema: migración nueva con `npx supabase migration new`,
`npm run db:reset` y `npm run db:types`; las migraciones mergeadas no se
editan.

## Flujo de trabajo

- `main` está protegida: todo cambio entra por pull request con el check
  de CI en verde. No intentar push directo.
- Ramas cortas con prefijo: `feat/`, `fix/`, `docs/`, `chore/`.
- Merge por squash; la rama se borra sola al mergear.

## Convenciones

- Idioma de la interfaz y de la documentación: español. Código,
  identificadores y mensajes de commit: inglés.
- Server Components por defecto. Añadir `"use client"` solo cuando el
  componente necesite estado, efectos o APIs del navegador.
- Mantener la estructura simple. No crear capas, abstracciones o carpetas
  nuevas hasta que haya código que las justifique.
- Mobile first: la app se usará principalmente desde el móvil.
- Textos de la interfaz en español rioplatense con voseo (ADR 0007), todos
  en `src/lib/texts.ts`.

## Modelos y esfuerzo

Elegir modelo y esfuerzo por tarea, no uno para todo: Fable para patrones
fundacionales y revisión de seguridad (RLS, auth); Opus en high/xhigh para
auth, Realtime, compartir y lógica con casos límite; Sonnet en medium/high
para UI, funciones de dominio, configuración y docs; Haiku en low para
explorar, resumir y triar. Revisar cada PR con un modelo distinto al que
lo escribió.
