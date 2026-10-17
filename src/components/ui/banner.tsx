import type { LucideIcon } from "lucide-react";
import * as React from "react";
import { cn } from "@/lib/utils";

type BannerProps = {
  /** info: pistacho. attention: cítrico. error: tomate. */
  tone?: "info" | "attention" | "error";
  icon?: LucideIcon;
  title: string;
  body?: string;
  action?: React.ReactNode;
  className?: string;
} & Omit<React.ComponentProps<"div">, "title">;

const tones = {
  info: {
    surface: "bg-paper-2",
    thread: "border-forest",
    icon: "text-forest",
  },
  attention: {
    surface: "bg-attention-bg",
    thread: "border-citrus-text",
    icon: "text-citrus-text",
  },
  error: {
    surface: "bg-danger-bg",
    thread: "border-tomato-text",
    icon: "text-tomato-text",
  },
} as const;

/**
 * Aviso persistente (sin conexión, cambios de otros, errores). El texto va
 * siempre en tinta; el color está en el icono y en el hilo izquierdo.
 */
export function Banner({
  tone = "info",
  icon: Icon,
  title,
  body,
  action,
  className,
  ...props
}: BannerProps) {
  const t = tones[tone];
  return (
    <div
      role={tone === "error" ? "alert" : "status"}
      data-slot="banner"
      data-tone={tone}
      className={cn(
        "rounded-r-sheet flex items-center gap-3 border-l-2 py-3 pr-3 pl-4",
        t.surface,
        t.thread,
        className,
      )}
      {...props}
    >
      {Icon ? (
        <Icon
          aria-hidden
          strokeWidth={1.5}
          className={cn("size-5 shrink-0", t.icon)}
        />
      ) : null}
      <p className="text-label min-w-0 flex-1">
        <span className="text-ink block font-medium">{title}</span>
        {body ? (
          <span className="text-ink-2 block font-normal">{body}</span>
        ) : null}
      </p>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  );
}
