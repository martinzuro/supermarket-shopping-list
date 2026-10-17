# CLAUDE.md

Contexto e instrucciones para sesiones de Claude Code en este repositorio.

## Objetivo del proyecto

Desarrollar una web app para gestionar listas de compras de supermercado.

## Estado actual

Fase 0 del plan. Solo existe una página inicial mínima en
`src/app/page.tsx`. No hay funcionalidades de negocio, esquema de base de
datos, autenticación ni dependencias más allá del scaffold. La siguiente
fase es la 1 (fundaciones), descrita en `docs/plan.md`.

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
- Sentry para errores, Vercel Web Analytics para visitas.
- Moneda por ítem, UYU por defecto, totales agrupados por moneda.
- Solo español, textos centralizados en `src/lib/texts.ts`.
- Nombre provisional del producto: "Lista".

No implementar nada que contradiga un ADR sin que el usuario lo pida
explícitamente. Seguir el orden de fases del plan: no adelantar trabajo de
una fase posterior.

## Stack

- Next.js 16 con App Router y Turbopack. Esta versión tiene cambios respecto
  a versiones anteriores: antes de escribir código, consultar las guías en
  `node_modules/next/dist/docs/` (ver también `AGENTS.md`, que `next dev`
  regenera automáticamente).
- React 19, TypeScript en modo `strict`, Tailwind CSS 4 (configuración por
  CSS en `src/app/globals.css`, sin `tailwind.config`).
- ESLint con `eslint-config-next`.
- npm. No usar otros package managers.

## Estructura

```
src/app/         Rutas, layouts y páginas
src/components/  Componentes reutilizables
src/lib/         Utilidades y lógica compartida
src/types/       Tipos de TypeScript compartidos
public/          Archivos estáticos
docs/            Documentación del proyecto
```

Alias de importación: `@/*` apunta a `src/*`.

## Comandos

```bash
npm run dev        # desarrollo en http://localhost:3000
npm run build      # build de producción
npm run lint       # ESLint
npm run typecheck  # tsc --noEmit
```

Antes de dar por terminado un cambio, ejecutar `npm run lint`,
`npm run typecheck` y `npm run build`.

## Convenciones

- Idioma de la interfaz y de la documentación: español. Código,
  identificadores y mensajes de commit: inglés.
- Server Components por defecto. Añadir `"use client"` solo cuando el
  componente necesite estado, efectos o APIs del navegador.
- Mantener la estructura simple. No crear capas, abstracciones o carpetas
  nuevas hasta que haya código que las justifique.
- Mobile first: la app se usará principalmente desde el móvil.
