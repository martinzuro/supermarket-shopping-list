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
import { cn } from "@/lib/utils";

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
export const enterVariants: Variants = {
  hidden: { opacity: 0, y: t.shift },
  show: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: t.shift },
};

const staggerVariants: Variants = {
  hidden: {},
  show: { transition: { staggerChildren: t.stagger } },
  exit: {
    transition: { staggerChildren: t.stagger / 2, staggerDirection: -1 },
  },
};

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
  return (
    <Tag
      variants={enterVariants}
      initial="hidden"
      animate="show"
      exit="exit"
      transition={{ ...transitions.base, delay, ...transition }}
      {...props}
    />
  );
}

type StaggerProps = Omit<HTMLMotionProps<"ul">, "variants"> & { as?: Tag };

/** Contenedor cuyos <StaggerItem> entran escalonados con el token de stagger. */
export function Stagger({ as = "ul", ...props }: StaggerProps) {
  const Tag = tags[as] as typeof motion.ul;
  return (
    <Tag
      variants={staggerVariants}
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
 * Monta y desmonta un bloque (avisos, mensajes) abriendo su altura. Con
 * movimiento reducido solo funde: la altura cambia de golpe.
 */
export function Collapse({ show, className, children }: CollapseProps) {
  const reduced = useReducedMotion();
  const hidden = reduced ? { opacity: 0 } : { opacity: 0, height: 0 };
  const visible = reduced ? { opacity: 1 } : { opacity: 1, height: "auto" };

  return (
    <AnimatePresence initial={false}>
      {show ? (
        <motion.div
          key="collapse"
          initial={hidden}
          animate={visible}
          exit={hidden}
          transition={transitions.base}
          className={cn("overflow-hidden", className)}
        >
          {children}
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}

export { AnimatePresence, motion };
