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

**Estado del service worker:** `src/app/sw.ts` (Serwist) está escrito pero
todavía **no está conectado al build**. `@serwist/next` solo funciona con
webpack y Next 16 compila con Turbopack. Hasta resolverlo no se genera
`public/sw.js`, por lo que la app no se instala en todos los navegadores
(Chrome en Android exige service worker; iOS no). Ver la descripción del PR
para las opciones.

Instalar:

- **iOS (Safari):** Compartir, "Añadir a pantalla de inicio".
- **Android (Chrome):** menú, "Instalar app" (requiere el service worker).

Verificar el manifest en un build de producción:

```bash
npm run build && npm run start
```

Abrir http://localhost:3000, DevTools, pestaña Application, sección Manifest.
Cuando el service worker esté conectado, comprobar en Application, Service
Workers, que `/sw.js` está activado, y en Cache Storage que el precache incluye
`/offline`. Para probar el fallback: marcar Offline en Network y navegar a una
ruta no visitada.

## Documentación

- [docs/plan.md](docs/plan.md): plan completo del proyecto (decisiones, arquitectura, fases, despliegue).
- [docs/roadmap.md](docs/roadmap.md): funcionalidades previstas para fases futuras.
- [docs/decisions/](docs/decisions/): registro de decisiones de arquitectura (ADR).
- [CLAUDE.md](CLAUDE.md): contexto e instrucciones para sesiones de Claude Code.
