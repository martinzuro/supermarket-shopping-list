"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

type FieldContextValue = {
  id: string;
  describedBy: string | undefined;
  invalid: boolean;
};

const FieldContext = React.createContext<FieldContextValue | null>(null);

/** Ids y estado del campo, para que Input los tome sin repetirlos. */
export function useField() {
  return React.useContext(FieldContext);
}

type FieldProps = {
  /** Id del control; si falta se genera uno. */
  id?: string;
  label: string;
  /** Ayuda breve debajo del control (puede llevar un monto en mono). */
  help?: React.ReactNode;
  /** Error: reemplaza la ayuda y marca el control como inválido. */
  error?: string;
  className?: string;
  children: React.ReactNode;
};

/**
 * Etiqueta, control y mensaje. La etiqueta va siempre visible, encima; el
 * error sustituye a la ayuda y se anuncia con role="alert".
 */
export function Field({
  id,
  label,
  help,
  error,
  className,
  children,
}: FieldProps) {
  const generatedId = React.useId();
  const fieldId = id ?? generatedId;
  const helpId = `${fieldId}-help`;
  const message = error ?? help;
  const hasMessage =
    Boolean(error) ||
    (help !== undefined && help !== null && help !== false && help !== "");

  return (
    <FieldContext.Provider
      value={{
        id: fieldId,
        describedBy: hasMessage ? helpId : undefined,
        invalid: Boolean(error),
      }}
    >
      <div data-slot="field" className={cn("grid gap-2", className)}>
        <label htmlFor={fieldId} className="text-label text-ink">
          {label}
        </label>
        {children}
        {hasMessage ? (
          <p
            id={helpId}
            role={error ? "alert" : undefined}
            className={cn(
              "text-label",
              error ? "text-tomato-text" : "text-ink-2",
            )}
          >
            {message}
          </p>
        ) : null}
      </div>
    </FieldContext.Provider>
  );
}
