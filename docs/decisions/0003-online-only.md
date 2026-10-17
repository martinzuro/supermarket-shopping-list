# 0003. Cliente solo online, sin capa local-first

Fecha: 2026-10-17
Estado: Aceptado

## Contexto

El roadmap inicial incluía "funciona offline" como esencial, porque dentro
del supermercado suele no haber señal. Implementarlo requiere una capa
local-first (IndexedDB con outbox y reconciliación, o un producto como
PowerSync), que es la parte de mayor riesgo técnico del proyecto.

## Decisión

El cliente habla directamente con Supabase a través de TanStack Query, con
actualizaciones optimistas y Supabase Realtime para los cambios de otros
miembros. No hay base de datos local ni cola de operaciones.

Sin conexión, la app muestra un banner persistente, reintenta las
mutaciones en curso con backoff mientras la pestaña esté abierta y conserva
el texto del input de añadir. No se garantiza nada más.

"Funciona offline" pasa al roadmap como fase futura.

## Alternativas consideradas

- Motor propio con Dexie + outbox + LWW: unos cientos de líneas, riesgo de
  casos límite.
- PowerSync sobre Supabase: sólido, suma un servicio y fricción con Next.js.
- CRDT (Yjs/Automerge) con Liveblocks o PartyKit: natural para una lista,
  pero otra pieza de infraestructura.

## Consecuencias

- La Fase 2 se reduce de 6 a 8 días a 3 o 4.
- El momento de uso principal (dentro del súper) puede quedar sin servicio.
  Se mide en la beta; si duele, offline sube al tope del backlog.
- Para no cerrar la puerta, el modelo de datos mantiene ids generados en
  el cliente (UUID v7), `updated_at` y `deleted_at` en todas las tablas de
  dominio. Añadir offline después reemplaza la capa `src/lib/queries/`,
  no el esquema.
