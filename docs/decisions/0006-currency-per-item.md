# 0006. Moneda por ítem, UYU por defecto

Fecha: 2026-10-17
Estado: Aceptado

## Contexto

El precio estimado es opcional por ítem. En Uruguay es habitual que algunos
productos se manejen en dólares y la mayoría en pesos, así que una única
moneda por lista no alcanza.

## Decisión

- Cada ítem tiene `estimated_price` y `currency` opcionales.
- Moneda por defecto: UYU (peso uruguayo). El selector de moneda está en el
  ítem, no en la lista.
- El catálogo recuerda el último precio y la última moneda de cada producto
  y los propone al volver a añadirlo.
- Los totales (pendientes y carro) se calculan agrupados por moneda. Si
  solo hay una moneda se muestra un total; si hay varias, uno por moneda.
  No se convierten monedas.
- Formateo con `Intl.NumberFormat`, sin librerías.

## Alternativas consideradas

- Moneda por lista: más simple, no cubre el caso de uso mixto.
- Sin moneda: números sin símbolo, confuso con más de una divisa.
- Conversión a una moneda base: requiere tipo de cambio, fuera de alcance.

## Consecuencias

- Columna `currency` en `items` y `last_currency` en `catalog`.
- La función de totales en `src/lib/domain` devuelve un mapa por moneda y
  se testea con mezcla de monedas.
