/**
 * Tokens de motion en TypeScript, para Motion for React. Deben coincidir con
 * las variables --motion-* de src/app/globals.css; tokens.test.ts lo
 * comprueba. Duraciones en segundos, desplazamiento en píxeles.
 */
export const motionTokens = {
  ease: {
    out: [0.19, 1, 0.22, 1],
    inOut: [0.65, 0.05, 0, 1],
  },
  duration: {
    instant: 0.12,
    fast: 0.2,
    base: 0.32,
    slow: 0.6,
    cinematic: 0.9,
  },
  stagger: 0.035,
  shift: 8,
} as const;
