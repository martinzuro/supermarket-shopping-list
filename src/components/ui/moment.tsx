import * as React from "react";
import { Stagger, StaggerItem } from "@/components/motion";
import { cn } from "@/lib/utils";

type MomentProps = {
  eyebrow?: string;
  /** Titular en serif: `lead <em>em</em> tail`. */
  lead: string;
  em: string;
  tail?: string;
  body: string;
  illustration?: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
};

/**
 * Momento editorial (DESIGN_DIRECTION.md, sección 8): superficie tinta,
 * titular display en serif con una palabra en cursiva, ilustración y una
 * acción. Entra escalonado. Se usa pocas veces: carro vaciado, invitación.
 */
export function Moment({
  eyebrow,
  lead,
  em,
  tail,
  body,
  illustration,
  action,
  className,
}: MomentProps) {
  return (
    <Stagger
      as="section"
      data-slot="moment"
      className={cn(
        "bg-inverse-bg text-inverse-fg rounded-sheet px-6 py-10 md:px-10 md:py-14",
        className,
      )}
    >
      {illustration ? (
        <StaggerItem
          as="div"
          className="text-inverse-fg mb-8 size-28 [&_svg]:size-full"
        >
          {illustration}
        </StaggerItem>
      ) : null}
      {eyebrow ? (
        <StaggerItem as="p" className="eyebrow text-inverse-fg-2 mb-3">
          {eyebrow}
        </StaggerItem>
      ) : null}
      <StaggerItem as="p" className="text-display font-serif text-balance">
        {lead} <em>{em}</em>
        {tail ? ` ${tail}` : null}
      </StaggerItem>
      <StaggerItem
        as="p"
        className="text-inverse-fg-2 mt-4 max-w-prose text-pretty"
      >
        {body}
      </StaggerItem>
      {action ? (
        <StaggerItem as="div" className="mt-8">
          {action}
        </StaggerItem>
      ) : null}
    </Stagger>
  );
}
