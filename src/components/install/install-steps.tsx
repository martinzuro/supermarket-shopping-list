import { Check } from "lucide-react";
import { AddToHomeIcon, ShareHintIcon } from "@/components/icons/install-icons";
import { texts } from "@/lib/texts";

const t = texts.install.steps;

const steps = [
  { text: t.share, icon: <ShareHintIcon /> },
  { text: t.add, icon: <AddToHomeIcon /> },
  { text: t.confirm, icon: <Check aria-hidden strokeWidth={1.5} /> },
] as const;

/**
 * Los pasos de Safari para instalar la app (iOS no tiene botón): una lista
 * numerada por el propio navegador (el lector dice "1 de 3"), con el icono
 * de lo que hay que buscar en un recuadro de la tinta del sistema. Los usan
 * la hoja del aviso y la entrada del menú.
 */
export function InstallSteps() {
  return (
    <ol
      aria-label={t.label}
      data-testid="install-steps"
      className="flex flex-col gap-3"
    >
      {steps.map((step, index) => (
        <li key={index} className="flex items-center gap-3">
          <span
            aria-hidden
            className="border-rule text-ink bg-paper-2 flex size-10 shrink-0 items-center justify-center rounded-full border [&_svg]:size-5"
          >
            {step.icon}
          </span>
          <span className="text-ink text-pretty">{step.text}</span>
        </li>
      ))}
    </ol>
  );
}
