import { Menu, ShoppingCart } from "lucide-react";
import { AddItemBar } from "@/components/list/add-item-bar";
import { ListSection } from "@/components/list/list-section";
import { Button } from "@/components/ui/button";
import { texts } from "@/lib/texts";

export default function ListPage() {
  return (
    <>
      <header className="sticky top-0 z-10 border-b bg-background/95 pt-safe backdrop-blur-md">
        <div className="mx-auto flex h-14 w-full max-w-xl items-center justify-between px-safe">
          <h1 className="text-xl font-semibold tracking-tight">
            {texts.app.name}
          </h1>
          <Button
            type="button"
            variant="ghost"
            size="icon-touch"
            aria-label={texts.header.menu}
            className="-mr-2.5"
          >
            <Menu aria-hidden />
          </Button>
        </div>
      </header>

      <main className="mx-auto w-full max-w-xl flex-1 px-safe pt-1 pb-add-bar">
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
      </main>

      <AddItemBar />
    </>
  );
}
