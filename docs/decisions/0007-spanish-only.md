# 0007. Solo español, textos centralizados

Fecha: 2026-10-17
Estado: Aceptado

## Contexto

Los usuarios previstos son hispanohablantes. Preparar i18n completa suma
rutas por idioma, detección y mantenimiento de varios archivos de textos.

## Decisión

- Interfaz solo en español (variante rioplatense neutra).
- Todos los textos visibles viven en `src/lib/texts.ts`. Ningún componente
  contiene cadenas de interfaz literales.
- Sin librería de i18n.

## Alternativas consideradas

- next-intl con español e inglés desde el inicio.

## Consecuencias

- Traducir en el futuro es mecánico: un archivo de textos y una librería.
- El nombre provisional del producto ("Lista") también vive en `texts.ts`
  y en una variable de entorno para manifest y emails, de modo que
  renombrar sea un cambio pequeño.
