"use client";

import { Smartphone } from "lucide-react";
import { useRef, useState } from "react";
import { InstallSteps } from "@/components/install/install-steps";
import { useInstall } from "@/components/install/use-install";
import { Collapse } from "@/components/motion";
import { useSession } from "@/components/session-provider";
import { Banner } from "@/components/ui/banner";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  currentListOf,
  leftoversOf,
  useCarryOver,
  useLists,
  useMembershipNotice,
} from "@/lib/queries";
import { texts } from "@/lib/texts";

const t = texts.install;

/**
 * La invitación a instalar la app (docs/improvements.md, F-8), arriba de la
 * lista y callada: un aviso, no un momento ni una hoja que se interponga.
 * Cuándo sale (compras en visitas anteriores, descartes, pausa) lo decide
 * lib/install.ts; `blocked` es todo lo que no la deja salir porque ocupa su
 * lugar en la pantalla (el modo compra, el momento "Buena compra"); los otros
 * avisos (sin conexión, lo que pasó con la lista, "traer lo de otra lista")
 * los mira ella misma: nunca van dos a la vez.
 *
 * Android: "Instalar" pide la instalación al navegador. iOS: no hay API, y
 * "Cómo instalarla" abre los pasos de Safari en una hoja (nunca hay otra
 * abierta: el aviso está en la lista, no en el menú). "Ahora no" lo calla
 * por un tiempo, y después de dos no vuelve solo.
 */
export function InstallNotice({ blocked }: { blocked: boolean }) {
  const { mode, due, install, dismiss } = useInstall();
  const [stepsOpen, setStepsOpen] = useState(false);
  const { user, status } = useSession();
  const lists = useLists(user?.id ?? null);
  const membership = useMembershipNotice().notice;
  const carryOver = useCarryOver(user);
  const otherNotice =
    status === "offline" ||
    membership !== null ||
    carryOver !== null ||
    leftoversOf(lists.data, currentListOf(lists.data)).length > 0;
  const show = due && !blocked && !otherNotice;
  // Where the focus goes when the notice leaves with it (a keyboard or a
  // screen reader user pressed one of its buttons): the spot it left, not
  // <body>.
  const anchor = useRef<HTMLDivElement>(null);
  function keepFocus() {
    if (anchor.current?.contains(document.activeElement)) {
      anchor.current.focus({ preventScroll: true });
    }
  }

  return (
    <>
      <div ref={anchor} tabIndex={-1} className="outline-none">
        <Collapse show={show} className="pt-2">
          <Banner
            tone="info"
            icon={Smartphone}
            liveRegion={false}
            title={t.notice.title}
            body={t.notice.body}
            data-testid="install-notice"
            data-mode={mode ?? undefined}
            footer={
              <>
                <Button
                  type="button"
                  onClick={() => {
                    if (mode === "ios") {
                      setStepsOpen(true);
                    } else {
                      keepFocus();
                      void install();
                    }
                  }}
                >
                  {mode === "ios" ? t.notice.how : t.notice.install}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    keepFocus();
                    dismiss();
                  }}
                >
                  {t.notice.later}
                </Button>
              </>
            }
          />
        </Collapse>
      </div>
      <Sheet open={stepsOpen} onOpenChange={setStepsOpen}>
        <SheetContent side="bottom">
          <SheetHeader>
            <SheetTitle>{t.steps.title}</SheetTitle>
            <SheetDescription>{t.steps.description}</SheetDescription>
          </SheetHeader>
          <div className="px-6">
            <InstallSteps />
          </div>
          <SheetFooter>
            <Button type="button" onClick={() => setStepsOpen(false)}>
              {t.steps.close}
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>
    </>
  );
}
