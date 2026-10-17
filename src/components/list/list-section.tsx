import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

type ListSectionProps = {
  id: string;
  title: string;
  emptyText: string;
  icon?: LucideIcon;
  className?: string;
};

export function ListSection({
  id,
  title,
  emptyText,
  icon: Icon,
  className,
}: ListSectionProps) {
  const headingId = `${id}-heading`;

  return (
    <section aria-labelledby={headingId} className={cn("py-5", className)}>
      <h2
        id={headingId}
        className="flex items-center gap-2 text-sm font-semibold text-foreground"
      >
        {Icon ? (
          <Icon aria-hidden className="size-4 text-muted-foreground" />
        ) : null}
        {title}
      </h2>
      <p className="mt-3 text-sm text-pretty text-muted-foreground">
        {emptyText}
      </p>
    </section>
  );
}
