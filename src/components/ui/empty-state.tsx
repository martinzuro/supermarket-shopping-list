import * as React from "react";
import { cn } from "@/lib/utils";

type EmptyStateProps = {
  illustration: React.ReactNode;
  title?: string;
  body: string;
  action?: React.ReactNode;
  className?: string;
};

/**
 * Estado vacío de una sección: ilustración a la izquierda en tinta
 * secundaria, texto a la derecha. Es una invitación a actuar, no un error.
 */
export function EmptyState({
  illustration,
  title,
  body,
  action,
  className,
}: EmptyStateProps) {
  return (
    <div
      data-slot="empty-state"
      className={cn("flex items-center gap-5 py-2", className)}
    >
      <div className="text-ink-2 size-20 shrink-0 [&_svg]:size-full">
        {illustration}
      </div>
      <div className="min-w-0 flex-1">
        {title ? <p className="text-ink">{title}</p> : null}
        <p className="text-ink-2 text-pretty">{body}</p>
        {action ? <div className="mt-3">{action}</div> : null}
      </div>
    </div>
  );
}
