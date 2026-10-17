# Supermarket Shopping List

Web app para gestionar listas de compras de supermercado.

Estado actual: proyecto inicializado. Todavía no hay funcionalidades implementadas.

## Stack

- Next.js 16 (App Router) con Turbopack
- React 19
- TypeScript
- Tailwind CSS 4
- ESLint
- npm como package manager

## Requisitos

- Node.js 20.9 o superior (el proyecto se creó con Node 24, ver `.nvmrc`)
- npm

## Ejecutar en local

```bash
npm install
npm run dev
```

Abrir http://localhost:3000 en el navegador.

## Scripts

| Comando             | Descripción                                   |
| ------------------- | --------------------------------------------- |
| `npm run dev`       | Servidor de desarrollo con recarga en caliente |
| `npm run build`     | Build de producción                           |
| `npm run start`     | Sirve el build de producción                  |
| `npm run lint`      | Ejecuta ESLint                                |
| `npm run typecheck` | Genera tipos de rutas y comprueba con tsc     |

## Estructura

```
src/
  app/         Rutas, layouts y páginas (App Router)
  components/  Componentes de React reutilizables
  lib/         Utilidades y lógica compartida
  types/       Tipos de TypeScript compartidos
public/        Archivos estáticos
docs/          Documentación del proyecto
```

## PWA

La app es instalable. El manifest está en `src/app/manifest.ts`, los iconos en
`public/icons/` y la página sin conexión en `src/app/offline/page.tsx`.

El service worker (`src/app/sw.ts`, Serwist) se compila con
`@serwist/turbopack` y se sirve desde `/serwist/sw.js` (route handler en
`src/app/serwist/[path]/route.ts`). Se registra desde el layout raíz con
`SerwistProvider`, solo en producción. Precachea el app shell, los assets y
`/offline`; las peticiones a Supabase y a `/api/` nunca se cachean.

Instalar:

- **iOS (Safari):** Compartir, "Añadir a pantalla de inicio".
- **Android (Chrome):** menú, "Instalar app".

Verificar el manifest en un build de producción:

```bash
npm run build && npm run start
```

Abrir http://localhost:3000, DevTools, pestaña Application: en Manifest se ve
el manifest; en Service Workers, `/serwist/sw.js` activado; en Cache Storage,
el precache incluye `/offline`. Para probar el fallback: marcar Offline en
Network y navegar a una ruta no visitada.

## Documentación

- [docs/plan.md](docs/plan.md): plan completo del proyecto (decisiones, arquitectura, fases, despliegue).
- [docs/roadmap.md](docs/roadmap.md): funcionalidades previstas para fases futuras.
- [docs/decisions/](docs/decisions/): registro de decisiones de arquitectura (ADR).
- [CLAUDE.md](CLAUDE.md): contexto e instrucciones para sesiones de Claude Code.
