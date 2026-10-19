"use client";

import {
  AnimatePresence,
  MotionConfig,
  motion,
  useReducedMotion,
  type HTMLMotionProps,
  type Transition,
  type Variants,
} from "motion/react";
import * as React from "react";
import { motionTokens as t } from "@/lib/design/motion";

/**
 * Primitivas de motion del sistema (DESIGN_DIRECTION.md, sección 8). Todas
 * usan los tokens de duración y curva, solo animan transform y opacity, y
 * respetan prefers-reduced-motion: MotionConfig con reducedMotion="user"
 * quita los desplazamientos y deja los fundidos.
 */

export const transitions = {
  instant: { duration: t.duration.instant, ease: t.ease.out },
  fast: { duration: t.duration.fast, ease: t.ease.out },
  base: { duration: t.duration.base, ease: t.ease.out },
  slow: { duration: t.duration.slow, ease: t.ease.out },
  cinematic: { duration: t.duration.cinematic, ease: t.ease.inOut },
} satisfies Record<string, Transition>;

export function MotionProvider({ children }: { children: React.ReactNode }) {
  return (
    <MotionConfig reducedMotion="user" transition={transitions.base}>
      {children}
    </MotionConfig>
  );
}

/** Entrada estándar: fundido más desplazamiento vertical de 8px. */
const enterVariants: Variants = {
  hidden: { opacity: 0, y: t.shift },
  show: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: t.shift },
};

/**
 * Variantes del contenedor escalonado. Se construyen por instancia porque
 * Motion toma la transición de la variante y descarta la del prop, y con
 * movimiento reducido el escalonado y el retraso inicial son 0.
 */
function staggerVariants(stagger: number, delay: number): Variants {
  return {
    hidden: {},
    show: { transition: { staggerChildren: stagger, delayChildren: delay } },
    exit: {
      transition: { staggerChildren: stagger / 2, staggerDirection: -1 },
    },
  };
}

const tags = {
  div: motion.div,
  section: motion.section,
  ul: motion.ul,
  ol: motion.ol,
  li: motion.li,
  p: motion.p,
  header: motion.header,
  footer: motion.footer,
} as const;

type Tag = keyof typeof tags;

type EnterProps = Omit<HTMLMotionProps<"div">, "variants"> & {
  as?: Tag;
  /** Retraso en segundos, para coreografías manuales. */
  delay?: number;
};

/**
 * Elemento que entra con la animación estándar y sale con la inversa. Dentro
 * de un <Stagger> no se usa: ahí va <StaggerItem>.
 */
export function Enter({
  as = "div",
  delay = 0,
  transition,
  ...props
}: EnterProps) {
  const Tag = tags[as] as typeof motion.div;
  // Con movimiento reducido la coreografía se aplana: todo funde a la vez.
  const reduced = useReducedMotion();
  return (
    <Tag
      variants={enterVariants}
      initial="hidden"
      animate="show"
      exit="exit"
      transition={{
        ...transitions.base,
        delay: reduced ? 0 : delay,
        ...transition,
      }}
      {...props}
    />
  );
}

type StaggerProps = Omit<HTMLMotionProps<"ul">, "variants"> & {
  as?: Tag;
  /** Retraso en segundos antes del primer hijo. */
  delayChildren?: number;
};

/**
 * Contenedor cuyos <StaggerItem> entran escalonados con el token de
 * stagger. Con movimiento reducido entran todos a la vez y sin retraso.
 */
export function Stagger({
  as = "ul",
  delayChildren = 0,
  ...props
}: StaggerProps) {
  const Tag = tags[as] as typeof motion.ul;
  const reduced = useReducedMotion();
  const variants = React.useMemo(
    () => staggerVariants(reduced ? 0 : t.stagger, reduced ? 0 : delayChildren),
    [reduced, delayChildren],
  );
  return (
    <Tag
      variants={variants}
      initial="hidden"
      animate="show"
      exit="exit"
      {...props}
    />
  );
}

type StaggerItemProps = Omit<HTMLMotionProps<"li">, "variants"> & { as?: Tag };

export function StaggerItem({
  as = "li",
  transition,
  ...props
}: StaggerItemProps) {
  const Tag = tags[as] as typeof motion.li;
  return (
    <Tag
      variants={enterVariants}
      transition={{ ...transitions.base, ...transition }}
      {...props}
    />
  );
}

type CollapseProps = {
  show: boolean;
  className?: string;
  children: React.ReactNode;
};

/**
 * Monta y desmonta un bloque (avisos, mensajes) con fundido y un
 * desplazamiento vertical de --motion-shift. Solo anima transform y
 * opacity: el cambio de layout es instantáneo. Con movimiento reducido
 * queda solo el fundido.
 */
export function Collapse({ show, className, children }: CollapseProps) {
  const reduced = useReducedMotion();
  const hidden = reduced ? { opacity: 0 } : { opacity: 0, y: t.shift };
  const visible = reduced ? { opacity: 1 } : { opacity: 1, y: 0 };

  return (
    <AnimatePresence initial={false}>
      {show ? (
        <motion.div
          key="collapse"
          initial={hidden}
          animate={visible}
          exit={hidden}
          transition={transitions.base}
          className={className}
        >
          {children}
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}
