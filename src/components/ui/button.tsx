import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { Slot } from "radix-ui";
import { cn } from "@/lib/utils";

/**
 * Botón píldora del sistema (DESIGN_DIRECTION.md, sección 7). La acción
 * primaria es lima sobre tinta; el resto son superficies de papel. Todos los
 * tamaños cumplen el objetivo táctil de 44px salvo `sm`, reservado a
 * contextos densos de escritorio.
 */
const buttonVariants = cva(
  "group/button text-label duration-instant ease-out inline-flex shrink-0 items-center justify-center gap-2 rounded-full border border-transparent whitespace-nowrap transition-[background-color,color,border-color,transform] select-none active:scale-[0.98] disabled:pointer-events-none disabled:cursor-not-allowed [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-5",
  {
    variants: {
      variant: {
        default:
          "bg-action-bg text-action-fg hover:bg-forest disabled:bg-paper-hover disabled:text-ink-3 dark:hover:bg-lime/85",
        secondary:
          "bg-paper-2 text-ink hover:bg-paper-pressed aria-expanded:bg-paper-pressed disabled:bg-paper-hover disabled:text-ink-3",
        outline:
          "border-field-border bg-paper text-ink hover:bg-paper-hover aria-expanded:bg-paper-hover disabled:border-rule disabled:text-ink-3",
        ghost:
          "text-ink hover:bg-paper-hover aria-expanded:bg-paper-hover disabled:text-ink-3",
        danger: "text-tomato-text hover:bg-danger-bg disabled:text-ink-3",
        link: "text-ink h-auto rounded-none px-0 underline-offset-4 hover:underline disabled:text-ink-3",
      },
      size: {
        sm: "h-9 px-4",
        touch: "h-touch px-5",
        "touch-lg": "h-touch-lg px-6 text-base",
        "icon-touch": "size-touch",
        "icon-touch-lg": "size-touch-lg [&_svg:not([class*='size-'])]:size-6",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "touch",
    },
  },
);

function Button({
  className,
  variant = "default",
  size = "touch",
  asChild = false,
  ...props
}: React.ComponentProps<"button"> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean;
  }) {
  const Comp = asChild ? Slot.Root : "button";

  return (
    <Comp
      data-slot="button"
      data-variant={variant}
      data-size={size}
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  );
}

export { Button, buttonVariants };
