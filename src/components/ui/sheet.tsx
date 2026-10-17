"use client";

import * as React from "react";
import { XIcon } from "lucide-react";
import { Dialog as SheetPrimitive } from "radix-ui";
import { Button } from "@/components/ui/button";
import { texts } from "@/lib/texts";
import { cn } from "@/lib/utils";

/**
 * Hoja: panel que flota sobre la lista con la única sombra del sistema.
 * En móvil entra desde abajo o desde la derecha; en escritorio se limita a
 * 24rem. Con movimiento reducido solo se funde.
 */
function Sheet({ ...props }: React.ComponentProps<typeof SheetPrimitive.Root>) {
  return <SheetPrimitive.Root data-slot="sheet" {...props} />;
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

function SheetPortal({
  ...props
}: React.ComponentProps<typeof SheetPrimitive.Portal>) {
  return <SheetPrimitive.Portal data-slot="sheet-portal" {...props} />;
}

function SheetOverlay({
  className,
  ...props
}: React.ComponentProps<typeof SheetPrimitive.Overlay>) {
  return (
    <SheetPrimitive.Overlay
      data-slot="sheet-overlay"
      className={cn(
        "bg-scrim data-open:animate-in data-open:fade-in-0 data-closed:animate-out data-closed:fade-out-0 duration-base fixed inset-0 z-50 ease-out",
        className,
      )}
      {...props}
    />
  );
}

const sides = {
  right:
    "inset-y-0 right-0 h-full w-[88vw] max-w-sm rounded-l-sheet data-open:slide-in-from-right-10 data-closed:slide-out-to-right-10 motion-reduce:data-open:slide-in-from-right-0 motion-reduce:data-closed:slide-out-to-right-0",
  left: "inset-y-0 left-0 h-full w-[88vw] max-w-sm rounded-r-sheet data-open:slide-in-from-left-10 data-closed:slide-out-to-left-10 motion-reduce:data-open:slide-in-from-left-0 motion-reduce:data-closed:slide-out-to-left-0",
  bottom:
    "inset-x-0 bottom-0 max-h-[92dvh] rounded-t-sheet data-open:slide-in-from-bottom-10 data-closed:slide-out-to-bottom-10 motion-reduce:data-open:slide-in-from-bottom-0 motion-reduce:data-closed:slide-out-to-bottom-0",
  top: "inset-x-0 top-0 max-h-[92dvh] rounded-b-sheet data-open:slide-in-from-top-10 data-closed:slide-out-to-top-10 motion-reduce:data-open:slide-in-from-top-0 motion-reduce:data-closed:slide-out-to-top-0",
} as const;

function SheetContent({
  className,
  children,
  side = "right",
  showCloseButton = true,
  ...props
}: React.ComponentProps<typeof SheetPrimitive.Content> & {
  side?: keyof typeof sides;
  showCloseButton?: boolean;
}) {
  return (
    <SheetPortal>
      <SheetOverlay />
      <SheetPrimitive.Content
        data-slot="sheet-content"
        data-side={side}
        className={cn(
          "bg-paper text-ink shadow-sheet data-open:animate-in data-open:fade-in-0 data-closed:animate-out data-closed:fade-out-0 duration-base fixed z-50 flex flex-col overflow-y-auto ease-out outline-none",
          sides[side],
          className,
        )}
        {...props}
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
      </SheetPrimitive.Content>
    </SheetPortal>
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
