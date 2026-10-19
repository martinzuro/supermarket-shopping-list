import * as React from "react";
import { cn } from "@/lib/utils";

type InvitationCardProps = {
  eyebrow: string;
  /** Nombre de la lista a la que invita: el titular del objeto. */
  title: string;
  linkLabel: string;
  /** El enlace; `null` mientras se prepara. */
  link: string | null;
  /** Lo que ocupa el lugar del enlace mientras se prepara. */
  pending: string;
  /** Pie de la invitación: para cuántas personas sirve y cuánto dura. */
  note: string;
  /** Para seleccionar el enlace cuando el portapapeles falla. */
  linkRef?: React.Ref<HTMLParagraphElement>;
  className?: string;
};

/**
 * La invitación como objeto (DESIGN_DIRECTION.md, principio 4: las tarjetas
 * se reservan para objetos reales). Pistacho, con el nombre de la lista en
 * serif y una línea de corte que la parte en dos, como una entrada: arriba
 * a quién invita, abajo el enlace legible y seleccionable de un toque. Las
 * muescas de la línea de corte toman el color del papel que la rodea.
 */
export function InvitationCard({
  eyebrow,
  title,
  linkLabel,
  link,
  pending,
  note,
  linkRef,
  className,
}: InvitationCardProps) {
  return (
    <article
      data-slot="invitation-card"
      data-ready={link !== null}
      aria-label={eyebrow}
      className={cn("bg-paper-2 rounded-sheet text-ink", className)}
    >
      <div className="px-5 pt-5 pb-6">
        <p className="eyebrow">{eyebrow}</p>
        <p className="text-title mt-2 font-serif break-words">{title}</p>
      </div>

      <div className="relative" aria-hidden>
        <div className="border-rule-strong border-t border-dashed" />
        <span className="bg-paper absolute -top-2 -left-2 size-4 rounded-full" />
        <span className="bg-paper absolute -top-2 -right-2 size-4 rounded-full" />
      </div>

      <div className="px-5 pt-5 pb-5">
        <p className="eyebrow">{linkLabel}</p>
        {link ? (
          <p
            ref={linkRef}
            data-testid="invite-link"
            className="text-label mt-2 font-mono break-all select-all"
          >
            {link}
          </p>
        ) : (
          <p aria-busy className="text-label text-ink-2 mt-2">
            {pending}
          </p>
        )}
        <p className="text-label text-ink-2 mt-3">{note}</p>
      </div>
    </article>
  );
}
