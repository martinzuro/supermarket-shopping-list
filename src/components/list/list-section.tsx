import type { ReactNode } from "react";
import {
  CartIllustration,
  EmptyBagIllustration,
} from "@/components/illustrations";
import { EmptyState } from "@/components/ui/empty-state";
import { Section } from "@/components/ui/section";
import { cn } from "@/lib/utils";

type ListSectionProps = {
  id: string;
  title: string;
  emptyText: string;
  /** Cantidad de filas. Con 0 se muestra el estado vacío. */
  count?: number;
  /**
   * Mientras las filas no llegaron no se muestra nada debajo del título: el
   * estado vacío diría "nada pendiente" antes de saberlo.
   */
  loading?: boolean;
  /** El carro va sobre pistacho: es la superficie secundaria del sistema. */
  surface?: "paper" | "cart";
  /** Acción del encabezado (por ejemplo "Vaciar el carro"). */
  action?: ReactNode;
  /**
   * Con `grouped` los hijos son agrupaciones (`Section` de nivel 3), cada una
   * con su propia lista, en lugar de las filas directamente.
   */
  grouped?: boolean;
  className?: string;
  /**
   * Las filas (`ListRow`), cada una dentro de su propio `li`; con `grouped`,
   * las agrupaciones.
   */
  children?: ReactNode;
};

export function ListSection({
  id,
  title,
  emptyText,
  count = 0,
  loading = false,
  surface = "paper",
  action,
  grouped = false,
  className,
  children,
}: ListSectionProps) {
  const hasItems = count > 0;

  return (
    <div
      className={cn(
        surface === "cart" && "bg-paper-2 rounded-sheet mt-6 px-4 pb-2",
        className,
      )}
    >
      <Section
        id={id}
        title={title}
        count={hasItems ? count : undefined}
        action={action}
      >
        {loading ? null : hasItems ? (
          grouped ? (
            <div>{children}</div>
          ) : (
            <ul className="border-rule border-t">{children}</ul>
          )
        ) : (
          <EmptyState
            illustration={
              surface === "cart" ? (
                <CartIllustration />
              ) : (
                <EmptyBagIllustration />
              )
            }
            body={emptyText}
          />
        )}
      </Section>
    </div>
  );
}
