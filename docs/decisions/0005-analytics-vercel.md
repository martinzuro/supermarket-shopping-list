# 0005. Sentry para errores y Vercel Web Analytics

Fecha: 2026-10-17
Estado: Aceptado

## Contexto

Con usuarios reales hace falta enterarse de los errores antes de que
avisen, y tener una idea básica de uso. No hay necesidad de funnels ni
experimentación.

## Decisión

- Sentry en cliente y servidor con source maps, tier gratuito.
- Vercel Web Analytics para visitas y visitantes. Sin eventos
  personalizados.

## Alternativas consideradas

- PostHog: eventos, funnels, grabación de sesiones. Más de lo necesario
  para uso personal y de conocidos.
- Ninguna analítica: se pierde la visibilidad mínima de si alguien usa la
  app.

## Consecuencias

- Integración trivial, sin cookies, sin banner de consentimiento.
- Si en algún momento hace falta medir comportamiento (cuántos llegan a
  compartir), PostHog es un ADR nuevo sin coste de migración.
