"use client";

import { XIcon } from "lucide-react";
import { AnimatePresence, motion, type Variants } from "motion/react";
import { Dialog as SheetPrimitive } from "radix-ui";
import * as React from "react";
import { transitions } from "@/components/motion";
import { Button } from "@/components/ui/button";
import { texts } from "@/lib/texts";
import { cn } from "@/lib/utils";

/**
 * Hoja: panel que flota sobre la lista con la única sombra del sistema.
 * Entra desde un lado con Motion (solo transform y opacity); con movimiento
 * reducido, MotionConfig deja únicamente el fundido. La salida se anima
 * gracias a AnimatePresence y forceMount, por eso Sheet guarda el estado
 * abierto y lo comparte con SheetContent.
 */

const SheetContext = React.createContext(false);

function Sheet({
  open: openProp,
  defaultOpen = false,
  onOpenChange,
  ...props
}: React.ComponentProps<typeof SheetPrimitive.Root>) {
  const [uncontrolled, setUncontrolled] = React.useState(defaultOpen);
  const open = openProp ?? uncontrolled;

  function handleOpenChange(next: boolean) {
    setUncontrolled(next);
    onOpenChange?.(next);
  }

  return (
    <SheetContext.Provider value={open}>
      <SheetPrimitive.Root
        data-slot="sheet"
        open={open}
        onOpenChange={handleOpenChange}
        {...props}
      />
    </SheetContext.Provider>
  );
}

function SheetTrigger({
  ...props
}: React.ComponentProps<typeof SheetPrimitive.Trigger>) {
  return <SheetPrimitive.Trigger data-slot="sheet-trigger" {...props} />;
}

function SheetClose({
  ...props
}: React.ComponentProps<typeof SheetPrimitive.Close>) {
  return <SheetPrimitive.Close data-slot="sheet-close" {...props} />;
}

const sideClasses = {
  right: "inset-y-0 right-0 h-full w-[88vw] max-w-sm rounded-l-sheet",
  left: "inset-y-0 left-0 h-full w-[88vw] max-w-sm rounded-r-sheet",
  bottom: "inset-x-0 bottom-0 max-h-[92dvh] rounded-t-sheet",
  top: "inset-x-0 top-0 max-h-[92dvh] rounded-b-sheet",
} as const;

const sideVariants: Record<keyof typeof sideClasses, Variants> = {
  right: { hidden: { x: "100%", opacity: 0 }, show: { x: 0, opacity: 1 } },
  left: { hidden: { x: "-100%", opacity: 0 }, show: { x: 0, opacity: 1 } },
  bottom: { hidden: { y: "100%", opacity: 0 }, show: { y: 0, opacity: 1 } },
  top: { hidden: { y: "-100%", opacity: 0 }, show: { y: 0, opacity: 1 } },
};

const fade: Variants = { hidden: { opacity: 0 }, show: { opacity: 1 } };

function SheetContent({
  className,
  children,
  side = "right",
  showCloseButton = true,
  ...props
}: Omit<
  React.ComponentProps<typeof SheetPrimitive.Content>,
  "asChild" | "forceMount"
> & {
  side?: keyof typeof sideClasses;
  showCloseButton?: boolean;
}) {
  const open = React.useContext(SheetContext);

  return (
    <AnimatePresence>
      {open ? (
        <SheetPrimitive.Portal key="sheet" forceMount data-slot="sheet-portal">
          <SheetPrimitive.Overlay asChild forceMount>
            <motion.div
              data-slot="sheet-overlay"
              variants={fade}
              initial="hidden"
              animate="show"
              exit="hidden"
              transition={transitions.base}
              className="bg-scrim fixed inset-0 z-50"
            />
          </SheetPrimitive.Overlay>
          <SheetPrimitive.Content asChild forceMount {...props}>
            <motion.div
              data-slot="sheet-content"
              data-side={side}
              variants={sideVariants[side]}
              initial="hidden"
              animate="show"
              exit="hidden"
              transition={transitions.base}
              className={cn(
                "bg-paper text-ink shadow-sheet fixed z-50 flex flex-col overflow-y-auto outline-none",
                sideClasses[side],
                className,
              )}
            >
              {children}
              {showCloseButton && (
                <SheetPrimitive.Close data-slot="sheet-close" asChild>
                  <Button
                    variant="ghost"
                    size="icon-touch"
                    className="absolute top-[calc(env(safe-area-inset-top,0px)_+_0.5rem)] right-2"
                  >
                    <XIcon aria-hidden strokeWidth={1.5} />
                    <span className="sr-only">{texts.sheet.close}</span>
                  </Button>
                </SheetPrimitive.Close>
              )}
            </motion.div>
          </SheetPrimitive.Content>
        </SheetPrimitive.Portal>
      ) : null}
    </AnimatePresence>
  );
}

function SheetHeader({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="sheet-header"
      className={cn("flex flex-col gap-1 px-6 pt-6 pb-4", className)}
      {...props}
    />
  );
}

function SheetBody({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="sheet-body"
      className={cn("flex flex-col gap-4 px-6", className)}
      {...props}
    />
  );
}

function SheetFooter({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="sheet-footer"
      className={cn("pb-safe mt-auto flex flex-col gap-2 px-6 pt-6", className)}
      {...props}
    />
  );
}

function SheetTitle({
  className,
  ...props
}: React.ComponentProps<typeof SheetPrimitive.Title>) {
  return (
    <SheetPrimitive.Title
      data-slot="sheet-title"
      className={cn("text-heading text-ink pr-12", className)}
      {...props}
    />
  );
}

function SheetDescription({
  className,
  ...props
}: React.ComponentProps<typeof SheetPrimitive.Description>) {
  return (
    <SheetPrimitive.Description
      data-slot="sheet-description"
      className={cn("text-ink-2 text-pretty", className)}
      {...props}
    />
  );
}

export {
  Sheet,
  SheetTrigger,
  SheetClose,
  SheetContent,
  SheetHeader,
  SheetBody,
  SheetFooter,
  SheetTitle,
  SheetDescription,
};
