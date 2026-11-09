"use client";

import { Trash2 } from "lucide-react";
import {
  animate,
  motion,
  useMotionValue,
  useMotionValueEvent,
  useReducedMotion,
  useTransform,
  type PanInfo,
} from "motion/react";
import * as React from "react";
import { transitions } from "@/components/motion";
import { cn } from "@/lib/utils";

/** Fracción del ancho de la fila que hay que recorrer para borrar. */
export const SWIPE_THRESHOLD = 0.35;
/** Un tirón rápido borra antes del umbral, si ya recorrió esto (px). */
export const SWIPE_FLING_DISTANCE = 56;
/** Velocidad (px/s) hacia la izquierda que cuenta como tirón. */
export const SWIPE_FLING_VELOCITY = 700;

/**
 * Si soltar la fila con ese desplazamiento (negativo hacia la izquierda) y
 * esa velocidad la borra: pasado el umbral, o con un tirón claro.
 */
export function swipeRemoves(
  offset: number,
  velocity: number,
  width: number,
): boolean {
  if (offset >= 0 || width <= 0) return false;
  if (-offset >= width * SWIPE_THRESHOLD) return true;
  return -offset >= SWIPE_FLING_DISTANCE && velocity <= -SWIPE_FLING_VELOCITY;
}

type SwipeToRemoveProps = {
  /** Lo que asoma detrás de la fila: "Borrar". Es decorativo para lectores. */
  label: string;
  /**
   * Se llama una vez, al soltar pasado el umbral, cuando la fila ya salió
   * de la vista. El aviso de la barra ofrece deshacerlo.
   */
  onRemove: () => void;
  children: React.ReactNode;
  /**
   * Sin deslizar: la fila queda quieta y no asoma nada. El envoltorio sigue
   * ahí, para que una fila que cambia de sección no se vuelva a montar.
   */
  disabled?: boolean;
  className?: string;
};

/**
 * Deslizar hacia la izquierda para borrar (M-9). La fila sigue al dedo solo
 * en horizontal: `drag="x"` deja el desplazamiento vertical al navegador
 * (`touch-action: pan-y`) y `dragDirectionLock` decide el eje con el primer
 * movimiento, así que un scroll nunca arrastra la fila. Detrás asoma el
 * fondo de peligro con la papelera; pasado el umbral (35% del ancho) el
 * disco se llena de tomate y crece: soltar ahí borra. Un toque que no
 * arrastró sigue siendo un toque (marcar, editar); uno que arrastró no
 * dispara nada. Con movimiento reducido la fila sigue al dedo igual (es
 * manipulación directa), pero no vuela al borrar ni rebota al volver.
 * No es la única forma de borrar: la hoja de edición tiene "Borrar".
 */
export function SwipeToRemove({
  label,
  onRemove,
  children,
  disabled = false,
  className,
}: SwipeToRemoveProps) {
  const reduced = useReducedMotion();
  const x = useMotionValue(0);
  const row = React.useRef<HTMLDivElement>(null);
  const dragged = React.useRef(false);
  const [armed, setArmed] = React.useState(false);
  // Clipped only while it is out of place: at rest the check's 44px target
  // reaches past the row's left edge, and a clip would cut it.
  const [moved, setMoved] = React.useState(false);
  const removing = React.useRef(false);

  // What is behind fades in with the first pixels, so a tap shows nothing.
  const reveal = useTransform(x, [-32, -8], [1, 0]);
  const width = () => row.current?.offsetWidth ?? 0;

  useMotionValueEvent(x, "change", (latest) => {
    if ((latest !== 0) !== moved) setMoved(latest !== 0);
    const past = -latest >= width() * SWIPE_THRESHOLD;
    if (past === armed || removing.current) return;
    setArmed(past);
    // A light tick where the phone can: the threshold is felt, not only seen.
    if (past) navigator.vibrate?.(8);
  });

  function handleDragEnd(_event: PointerEvent, info: PanInfo) {
    if (!swipeRemoves(info.offset.x, info.velocity.x, width())) {
      // Back to exactly 0: Motion's own return stops a pixel short.
      void animate(x, 0, reduced ? { duration: 0 } : transitions.fast);
      return;
    }
    removing.current = true;
    const removed = () => {
      onRemove();
      // Normally the row is gone by now. If it stays (nothing was deleted),
      // it comes back instead of staying out of view.
      setTimeout(() => {
        if (!row.current) return;
        removing.current = false;
        void animate(x, 0, reduced ? { duration: 0 } : transitions.base);
      }, 600);
    };
    if (reduced) removed();
    else void animate(x, -width(), transitions.fast).then(removed);
  }

  return (
    <div
      data-slot="swipe-to-remove"
      data-armed={armed || undefined}
      className={cn("relative", moved && "overflow-hidden", className)}
    >
      {disabled ? null : (
        <motion.div
          aria-hidden
          style={{ opacity: reveal }}
          className="bg-danger-bg absolute inset-0 flex items-center justify-end gap-2 pr-4"
        >
          <span className="text-label text-ink">{label}</span>
          <span className="relative flex size-8 items-center justify-center">
            <span className="border-tomato-text absolute inset-0 rounded-full border" />
            <span
              className={cn(
                "bg-tomato duration-instant absolute inset-0 rounded-full transition-[opacity,transform] ease-out",
                armed ? "scale-110 opacity-100" : "scale-75 opacity-0",
              )}
            />
            <Trash2
              strokeWidth={1.5}
              // The color switches with the threshold, without a transition:
              // only the disc's opacity and scale move.
              className={cn(
                "relative size-4",
                armed ? "text-paper" : "text-tomato-text",
              )}
            />
          </span>
        </motion.div>
      )}
      <motion.div
        ref={row}
        drag={disabled ? false : "x"}
        dragDirectionLock
        // Only to the left, following the finger; let go short of the
        // threshold, it goes back.
        dragConstraints={{ left: 0, right: 0 }}
        dragElastic={{ left: 1, right: 0 }}
        dragMomentum={false}
        style={{ x }}
        className="bg-paper relative"
        onPointerDownCapture={() => {
          dragged.current = false;
        }}
        // Motion starts a drag at 3px in any direction, before the lock
        // picks the axis at 10px: only a horizontal one swallows the tap. A
        // tap that drifts a little still checks or opens the sheet.
        onDirectionLock={(axis) => {
          dragged.current = axis === "x";
        }}
        onDragEnd={handleDragEnd}
        // A drag that ends over the name or the circle is not a tap on them.
        onClickCapture={(event) => {
          if (!dragged.current) return;
          event.preventDefault();
          event.stopPropagation();
          dragged.current = false;
        }}
      >
        {children}
      </motion.div>
    </div>
  );
}
