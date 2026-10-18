import * as React from "react";
import { cn } from "@/lib/utils";

/**
 * Ilustraciones monolínea del sistema (ADR 0008, decisión 4): grilla de
 * 120, trazo de 1.5px que no escala con el tamaño (vector-effect), tinta en
 * currentColor y, como mucho, un relleno en lima para el momento editorial.
 * Estilo cercano a los dibujos lineales del pie de Floema, aplicado a la
 * compra.
 */
function Frame({ className, children, ...props }: React.ComponentProps<"svg">) {
  return (
    <svg
      viewBox="0 0 120 120"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      data-slot="illustration"
      className={cn(
        "size-24 shrink-0 [&_*]:[vector-effect:non-scaling-stroke]",
        className,
      )}
      {...props}
    >
      {children}
    </svg>
  );
}

/** Bolsa de papel vacía y abierta: nada pendiente todavía. */
export function EmptyBagIllustration(props: React.ComponentProps<"svg">) {
  return (
    <Frame {...props}>
      <path className="text-ink-3" d="M14 104h92" />
      <path d="M30 46h60l-5 58H35z" />
      <path d="M30 46c8-3 52-3 60 0" />
      <path d="M46 46V36a14 14 0 0 1 28 0v10" />
      <path className="text-ink-3" d="M42 72c10 3 26 3 36 0" />
    </Frame>
  );
}

/** Changuito vacío: nada comprado todavía. */
export function CartIllustration(props: React.ComponentProps<"svg">) {
  return (
    <Frame {...props}>
      <path className="text-ink-3" d="M14 104h92" />
      <path d="M16 30h12l5 14" />
      <path d="M33 44h68l-8 30H40z" />
      <path d="M55 44l-2 30M78 44l2 30" />
      <path d="M40 74l-4 12h58" />
      <circle cx="44" cy="96" r="5" />
      <circle cx="86" cy="96" r="5" />
    </Frame>
  );
}

/** Bolsa llena: compra terminada. Lleva el único relleno en lima. */
export function FullBagIllustration(props: React.ComponentProps<"svg">) {
  return (
    <Frame {...props}>
      <path className="text-ink-3" d="M14 104h92" />
      <path d="M60 46c4-12 12-24 22-32 4-3 10 2 7 7-7 8-13 17-16 25" />
      <path d="M80 24l4 3M74 32l4 3M69 40l3 2" />
      <path d="M46 46V24" />
      <path d="M46 32c-6-2-10-7-10-12 5 0 9 4 10 12zM46 32c6-2 10-7 10-12-5 0-9 4-10 12z" />
      <circle cx="60" cy="40" r="8" fill="var(--lime)" />
      <path d="M30 46h60l-5 58H35z" />
      <path d="M30 46c8-3 52-3 60 0" />
      <path d="M46 46V36a14 14 0 0 1 28 0v10" />
      <path className="text-ink-3" d="M42 72c10 3 26 3 36 0" />
    </Frame>
  );
}
