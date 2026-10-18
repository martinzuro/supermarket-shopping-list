import { Section, SectionEmpty } from "@/components/ui/section";
import { cn } from "@/lib/utils";

type ListSectionProps = {
  id: string;
  title: string;
  emptyText: string;
  /** El carro va sobre pistacho: es la superficie secundaria del sistema. */
  surface?: "paper" | "cart";
  className?: string;
};

export function ListSection({
  id,
  title,
  emptyText,
  surface = "paper",
  className,
}: ListSectionProps) {
  return (
    <div
      className={cn(
        surface === "cart" && "bg-paper-2 rounded-sheet mt-6 px-4 pb-2",
        className,
      )}
    >
      <Section id={id} title={title}>
        <SectionEmpty>{emptyText}</SectionEmpty>
      </Section>
    </div>
  );
}
