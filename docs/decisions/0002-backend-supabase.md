# 0002. Supabase como backend, auth y tiempo real

Fecha: 2026-10-17
Estado: Aceptado

## Contexto

Se necesita persistencia relacional, autenticación con usuarios anónimos
convertibles, autorización por fila y un canal de tiempo real para listas
compartidas, sin operar servidores propios.

## Decisión

Supabase: Postgres gestionado, Auth, Realtime y Row Level Security.
Migraciones versionadas con Supabase CLI en `supabase/migrations/`.
Entorno local con `supabase start`. Proyectos separados para staging y
producción.

## Alternativas consideradas

- Convex: tiempo real excelente, modelo de datos propio, offline limitado.
- Firebase: offline maduro, NoSQL y lock-in fuerte.
- Neon + Auth.js + WebSockets propios: más piezas que operar.
- PocketBase: un binario, pero hay que hostearlo.

## Consecuencias

- Toda la autorización vive en RLS y se prueba con tests de integración.
- Nunca se expone la clave `service_role` al cliente.
- Pasar a Supabase Pro (25 USD/mes) antes de abrir a usuarios reales: Free
  pausa proyectos inactivos y no incluye backups.
- El SMTP por defecto de Supabase Auth no sirve para producción; se
  configura Resend en la Fase 4.
