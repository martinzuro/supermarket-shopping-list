# 0009. Motion for React para el movimiento

Fecha: 2026-10-18
Estado: Aceptado

## Contexto

La dirección de diseño (ADR 0008) exige movimiento diseñado: entradas
coreografiadas, hojas que entran y salen, avisos que se despliegan,
respeto a `prefers-reduced-motion` y solo `transform` y `opacity` en lo
frecuente. Las primitivas de shadcn traían `tw-animate-css`, que anima
solo la entrada con clases y no puede animar la salida de un componente
que se desmonta.

## Decisión

Usar Motion for React (`motion`) como única librería de animación, con
primitivas propias en `src/components/motion` (`MotionProvider`, `Enter`,
`Stagger`, `StaggerItem`, `Collapse`) que leen los tokens de
`src/lib/design/motion.ts`. `MotionConfig` con `reducedMotion="user"`
quita desplazamientos y cambios de altura cuando el sistema lo pide y
deja los fundidos. `tw-animate-css` se elimina.

## Alternativas consideradas

- Seguir con `tw-animate-css` y transiciones CSS: sin animación de salida,
  sin coreografías por lista, sin layout animation.
- GSAP: más potente para timelines cinematográficas, pero sin integración
  con el ciclo de vida de React y más peso. Queda como opción si un
  momento concreto lo justifica.
- CSS puro con `@starting-style` y View Transitions: soporte aún desigual
  en los navegadores móviles que importan.

## Consecuencias

- `Sheet` se reconstruye sobre `AnimatePresence` y `forceMount` de Radix,
  y guarda el estado abierto para poder animar la salida.
- Una raíz con `AnimatePresence` cuyos hijos `Enter` o `Stagger` tienen
  retrasos debe darles `exit={undefined}`, o la presencia no termina
  nunca (aprendido en la bienvenida).
- Las transiciones CSS de los componentes siguen usando las clases de
  duración y curva; Motion se usa donde hay montaje, desmontaje o
  coreografía.
