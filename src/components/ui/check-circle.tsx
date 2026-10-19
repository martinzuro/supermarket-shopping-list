import { Check } from "lucide-react";
import { cn } from "@/lib/utils";

type CheckCircleProps = {
  checked: boolean;
  className?: string;
};

/**
 * Indicador visual de "hecho": círculo de 24px que se llena con el par de
 * acción (tinta con check lima en claro, lima con check tinta en oscuro),
 * así el disco contrasta con el papel y la lima nunca queda sobre claro.
 * Es solo presentación; el control accesible lo pone quien lo usa.
 */
export function CheckCircle({ checked, className }: CheckCircleProps) {
  return (
    <span
      aria-hidden
      data-slot="check-circle"
      data-checked={checked}
      className={cn(
        "border-field-border duration-base flex size-6 shrink-0 items-center justify-center rounded-full border-2 transition-[background-color,border-color,transform] ease-out",
        checked && "border-action-bg bg-action-bg",
        className,
      )}
    >
      <Check
        strokeWidth={2.5}
        className={cn(
          "text-action-fg duration-fast size-4 transition-[opacity,transform] ease-out",
          checked ? "scale-100 opacity-100" : "scale-50 opacity-0",
        )}
      />
    </span>
  );
}
