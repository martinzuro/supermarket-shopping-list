"use client";

import { useState } from "react";
import { InstallSteps } from "@/components/install/install-steps";
import { useInstall } from "@/components/install/use-install";
import { Button } from "@/components/ui/button";
import { texts } from "@/lib/texts";

const t = texts.install.menu;

/**
 * "Instalar la app" en el menú (F-8): está siempre mientras se pueda instalar
 * desde acá y no lo esté ya, haya o no salido el aviso. Android pide la
 * instalación; en iOS los pasos se despliegan en el mismo lugar (el menú ya
 * es una hoja: no se abre otra encima).
 */
export function InstallEntry() {
  const { mode, available, install } = useInstall();
  const [stepsOpen, setStepsOpen] = useState(false);
  if (!available) return null;

  return (
    <section
      aria-labelledby="install-heading"
      data-testid="install-entry"
      className="border-rule flex flex-col gap-4 border-t pt-6 pb-6"
    >
      <h2 id="install-heading" className="text-heading">
        {t.title}
      </h2>
      <p className="text-ink-2 text-pretty">{t.description}</p>
      {mode === "ios" ? (
        <>
          <Button
            type="button"
            variant="outline"
            className="self-start"
            aria-expanded={stepsOpen}
            aria-controls="install-entry-steps"
            onClick={() => setStepsOpen((open) => !open)}
          >
            {stepsOpen ? t.hide : t.how}
          </Button>
          <div id="install-entry-steps" hidden={!stepsOpen}>
            {stepsOpen ? <InstallSteps /> : null}
          </div>
        </>
      ) : (
        <Button
          type="button"
          variant="outline"
          className="self-start"
          onClick={() => {
            // The entry goes once the browser answers: the focus stays in the
            // menu, on the title above it, not on <body>.
            document
              .getElementById("products-heading")
              ?.focus({ preventScroll: true });
            void install();
          }}
        >
          {t.install}
        </Button>
      )}
    </section>
  );
}
