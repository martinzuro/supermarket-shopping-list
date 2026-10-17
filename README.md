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

| Comando             | Descripción                                    |
| ------------------- | ---------------------------------------------- |
| `npm run dev`       | Servidor de desarrollo con recarga en caliente |
| `npm run build`     | Build de producción                            |
| `npm run start`     | Sirve el build de producción                   |
| `npm run lint`      | Ejecuta ESLint                                 |
| `npm run typecheck` | Genera tipos de rutas y comprueba con tsc      |

## Base de datos local

El backend es Supabase ([ADR 0002](docs/decisions/0002-backend-supabase.md)).
En local corre con Docker mediante la CLI de Supabase, que está instalada
como dependencia de desarrollo: no hace falta instalarla aparte, se usa con
`npx supabase` o con los scripts de abajo.

Requisitos: Docker Desktop en marcha y unos 10 GB libres en disco la
primera vez, para descargar las imágenes.

| Comando            | Descripción                                                            |
| ------------------ | ---------------------------------------------------------------------- |
| `npm run db:start` | Levanta Supabase en local (base, auth, realtime, API, Studio, Mailpit) |
| `npm run db:stop`  | Detiene los contenedores                                               |
| `npm run db:reset` | Recrea la base aplicando `supabase/migrations/` y `supabase/seed.sql`  |
| `npm run db:types` | Regenera `src/lib/supabase/database.types.ts` desde la base local      |

Primera vez:

1. `npm run db:start`.
2. `npx supabase status` muestra las URLs y las claves del entorno local.
3. Crear `.env.local` en la raíz del proyecto con estos valores:

   ```bash
   NEXT_PUBLIC_SUPABASE_URL=<Project URL, normalmente http://127.0.0.1:54321>
   NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=<clave Publishable, empieza por sb_publishable_>
   ```

   `.env.local` está en `.gitignore` y no se versiona. La clave secreta
   (`sb_secret_...` o `service_role`) nunca va en variables `NEXT_PUBLIC_`
   ni en el cliente.

Con el entorno levantado:

- Studio: http://127.0.0.1:54323
- Mailpit, donde llegan los correos de acceso (enlace y código de seis
  dígitos): http://127.0.0.1:54324

Si `npm run db:start` falla porque el puerto 54321 ya está en uso, la API
se puede levantar en otro puerto exportando la variable en la terminal
antes de usar los scripts `db:*`, por ejemplo
`export SUPABASE_API_PORT=54331`. En ese caso `NEXT_PUBLIC_SUPABASE_URL`
usa ese mismo puerto.

Para cambiar el esquema se crea una migración nueva con
`npx supabase migration new <nombre>`, se aplica con `npm run db:reset` y se
regeneran los tipos con `npm run db:types`. Las migraciones ya mergeadas no
se editan.

La configuración local (auth anónima, email con enlace y código OTP, URLs de
redirección) está en `supabase/config.toml` y las plantillas de correo en
`supabase/templates/`.

## Estructura

```
src/
  app/         Rutas, layouts y páginas (App Router)
  components/  Componentes de React reutilizables
  lib/         Utilidades y lógica compartida
  types/       Tipos de TypeScript compartidos
public/        Archivos estáticos
supabase/      Configuración local, migraciones, seed y plantillas de correo
docs/          Documentación del proyecto
```

## Documentación

- [docs/plan.md](docs/plan.md): plan completo del proyecto (decisiones, arquitectura, fases, despliegue).
- [docs/roadmap.md](docs/roadmap.md): funcionalidades previstas para fases futuras.
- [docs/decisions/](docs/decisions/): registro de decisiones de arquitectura (ADR).
- [CLAUDE.md](CLAUDE.md): contexto e instrucciones para sesiones de Claude Code.
