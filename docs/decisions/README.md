# Decisiones de arquitectura (ADR)

Un archivo por decisión, numerado y nunca editado una vez aceptado. Para
cambiar una decisión se escribe un ADR nuevo que la reemplace y se marca el
anterior como "Reemplazado por NNNN".

Formato:

```
# NNNN. Título

Fecha: AAAA-MM-DD
Estado: Aceptado | Reemplazado por NNNN

## Contexto
## Decisión
## Alternativas consideradas
## Consecuencias
```

| ADR | Decisión |
| --- | -------- |
| [0001](0001-hosting-vercel.md) | Hosting en Vercel, plan Hobby |
| [0002](0002-backend-supabase.md) | Supabase como backend, auth y tiempo real |
| [0003](0003-online-only.md) | Cliente solo online, sin capa local-first |
| [0004](0004-auth-magic-link.md) | Autenticación anónima y magic link, sin OAuth |
| [0005](0005-analytics-vercel.md) | Sentry para errores y Vercel Web Analytics |
| [0006](0006-currency-per-item.md) | Moneda por ítem, UYU por defecto |
| [0007](0007-spanish-only.md) | Solo español, textos centralizados |
