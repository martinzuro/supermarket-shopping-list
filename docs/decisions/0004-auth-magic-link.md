# 0004. Autenticación anónima y magic link, sin OAuth

Fecha: 2026-10-17
Estado: Aceptado

## Contexto

Principio del proyecto: usar la app sin registrarse y pedir cuenta solo al
compartir o al cambiar de dispositivo. Supabase Auth soporta usuarios
anónimos que se convierten en cuenta completa conservando sus datos.

## Decisión

- Al primer uso se crea un usuario anónimo de Supabase.
- La conversión a cuenta completa se hace solo por email: magic link con
  código OTP de seis dígitos en el mismo correo como alternativa.
- Sin proveedores OAuth (Google, Apple) por ahora.

## Alternativas consideradas

- Magic link + Google: más fiable en móvil, requiere proyecto en Google
  Cloud y pantalla de consentimiento.
- Añadir Apple: exige cuenta de desarrollador de pago; solo obligatorio si
  se publica en App Store.

## Consecuencias

- Menos configuración externa y menos superficie.
- Riesgo conocido: en móvil el enlace puede abrirse en otro navegador o
  caer en spam. Mitigado con el código OTP, SMTP propio con dominio
  verificado (Fase 4) y texto claro en la pantalla de espera.
- Se mide la tasa de éxito en la beta. Si es baja, añadir Google es un ADR
  nuevo y aproximadamente una tarde de trabajo.
