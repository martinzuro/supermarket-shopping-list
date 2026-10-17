# 0001. Hosting en Vercel, plan Hobby

Fecha: 2026-10-17
Estado: Aceptado

## Contexto

La app es Next.js 16 con App Router. Necesita despliegue continuo, previews
por PR y dominio con certificado, operado por una persona.

## Decisión

Vercel, plan Hobby. Producción desde `main`, preview por cada PR.

## Alternativas consideradas

- Netlify: soporte de Next.js menos completo.
- Cloudflare Pages con OpenNext: más barato a escala, más fricción con
  Next.js 16 hoy.
- Railway / Fly con Docker: más control, más operación.

## Consecuencias

- El uso previsto es personal y de conocidos, compatible con los términos
  de Hobby. Si pasa a uso comercial, migrar a Pro (20 USD/mes) sin cambios
  de código.
- Vercel Web Analytics queda disponible sin integración adicional.
