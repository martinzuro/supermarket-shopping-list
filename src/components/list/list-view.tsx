"use client";

import { ShoppingCart } from "lucide-react";
import { ListSection } from "@/components/list/list-section";
import { useSession } from "@/components/session-provider";
import { useCurrentList } from "@/lib/queries";
import { texts } from "@/lib/texts";

/**
 * The list screen body. Reads the session and makes sure the user has a list
 * (first use creates one). Items arrive in Phase 2; for now both sections
 * show their empty state.
 */
export function ListView() {
  const { user } = useSession();
  useCurrentList(user?.id ?? null);

  return (
    <>
      <ListSection
        id="pending"
        title={texts.list.pending.title}
        emptyText={texts.list.pending.empty}
      />
      {/* La línea punteada marca el paso por caja: arriba lo que falta,
          abajo lo que ya está en el carro. */}
      <ListSection
        id="cart"
        title={texts.list.cart.title}
        emptyText={texts.list.cart.empty}
        icon={ShoppingCart}
        className="border-t-2 border-dashed"
      />
    </>
  );
}
