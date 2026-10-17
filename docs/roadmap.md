# Roadmap

Funcionalidades previstas. Este documento es una referencia de alcance;
el detalle de cada funcionalidad se define al abordarla. Las decisiones de
arquitectura están en [plan.md](plan.md) y [decisions/](decisions/).

## Esencial

- Añadir ítems de forma muy rápida, con autocompletado basado en compras
  anteriores.
- Marcar un ítem como comprado con un solo toque. El ítem se tacha o se mueve
  al final, pero no desaparece.
- Cantidad y unidad opcionales. Solo el nombre es obligatorio.
- Lista compartida en tiempo real entre varias personas.
- Mobile first: botones grandes, uso con una mano.
- Comportamiento honesto sin red: aviso claro, reintentos, no se pierde lo
  que se estaba escribiendo.

## Diferencial

- Agrupación automática por categoría o pasillo, con orden personalizable
  según el recorrido del supermercado habitual.
- Historial e ítems frecuentes, con un acceso rápido para volver a añadir
  los habituales.
- Notas por ítem (marca, tamaño, preferencias).
- Precio estimado opcional por ítem, con moneda por ítem (UYU por defecto)
  y totales por moneda.

## Fase futura

- **Funcionamiento offline completo.** Decidido el 2026-10-17 dejarlo fuera
  del alcance inicial ([ADR 0003](decisions/0003-online-only.md)). Añadirlo
  implica reemplazar la capa de datos del cliente por una local-first. El
  modelo de datos ya está preparado para ello (ids de cliente, `updated_at`,
  borrados lógicos).
- Múltiples listas.
- Añadir ítems por voz.
- Importar ítems desde texto pegado.
- Notificaciones push cuando alguien añade algo.

## Fuera de alcance

- Recetas, inventario de despensa, escaneo de códigos de barras.
- Integración con precios reales de supermercados.
- Gamificación.
