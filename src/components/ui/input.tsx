"use client";

import * as React from "react";
import { useField } from "@/components/ui/field";
import { cn } from "@/lib/utils";

/**
 * Campo de texto del sistema: 44px de alto, radio de campo, borde de tinta
 * secundaria (3:1 sobre papel) que se oscurece al foco. Dentro de <Field>
 * toma id, aria-describedby y aria-invalid solos.
 */
function Input({ className, type, ...props }: React.ComponentProps<"input">) {
  const field = useField();

  return (
    <input
      type={type}
      data-slot="input"
      id={props.id ?? field?.id}
      aria-describedby={props["aria-describedby"] ?? field?.describedBy}
      aria-invalid={props["aria-invalid"] ?? (field?.invalid || undefined)}
      className={cn(
        "border-field-border bg-paper text-ink placeholder:text-ink-2 duration-fast h-touch rounded-field w-full min-w-0 border px-3 text-base transition-colors ease-out",
        "hover:border-ink focus-visible:border-ink",
        "disabled:border-rule disabled:bg-paper-hover disabled:text-ink-3 disabled:cursor-not-allowed",
        "aria-invalid:border-tomato-text",
        className,
      )}
      {...props}
    />
  );
}

export { Input };
