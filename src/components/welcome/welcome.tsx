"use client";

import { AnimatePresence, motion } from "motion/react";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { Enter, Stagger, StaggerItem, transitions } from "@/components/motion";
import { Button } from "@/components/ui/button";
import { CheckCircle } from "@/components/ui/check-circle";
import { texts } from "@/lib/texts";
import { WELCOME_PENDING_PROPERTY, WELCOME_SEEN_KEY } from "./welcome-flag";

const t = texts.welcome;

/** Coreografía en segundos desde que aparece la pantalla. */
const timeline = {
  headline: 0.1,
  list: 0.35,
  firstCheck: 0.95,
  betweenChecks: 0.28,
  body: 1.25,
  cta: 1.45,
  autoFinish: 2.6,
} as const;

function readPending() {
  if (
    document.documentElement.style.getPropertyValue(
      WELCOME_PENDING_PROPERTY,
    ) === "hidden"
  ) {
    return true;
  }
  try {
    return !localStorage.getItem(WELCOME_SEEN_KEY);
  } catch {
    return false;
  }
}

// El estado inicial vive fuera de React (variable CSS y localStorage) y se lee
// con useSyncExternalStore para que el servidor renderice "ya visto" y el
// cliente corrija al hidratar. El cierre es estado de React.
const noopSubscribe = () => () => {};
const getServerPending = () => false;

function markSeen() {
  try {
    localStorage.setItem(WELCOME_SEEN_KEY, String(Date.now()));
  } catch {
    // Sin almacenamiento la bienvenida se repetirá; no es grave.
  }
  document.documentElement.style.removeProperty(WELCOME_PENDING_PROPERTY);
}

/**
 * Pantalla de bienvenida del primer uso (ADR 0008, decisión 7): una sola
 * vez por dispositivo, sobre la superficie tinta, con el wordmark, un
 * titular en serif y una lista de muestra que se marca sola. Termina en
 * menos de tres segundos o con un toque, y deja ver la lista debajo.
 *
 * Solo la raíz anima la salida (un fundido): los hijos entran con su
 * coreografía pero llevan `exit={undefined}` para no bloquear la presencia
 * con retrasos heredados.
 */
export function Welcome() {
  const pendingOnLoad = useSyncExternalStore(
    noopSubscribe,
    readPending,
    getServerPending,
  );
  const [dismissed, setDismissed] = useState(false);
  const pending = pendingOnLoad && !dismissed;
  const [checked, setChecked] = useState(0);
  const dialogRef = useRef<HTMLDivElement>(null);

  function finish() {
    markSeen();
    setDismissed(true);
  }

  useEffect(() => {
    if (!pending) return;
    dialogRef.current?.focus();

    const timers = t.items.map((_, index) =>
      window.setTimeout(
        () => setChecked(index + 1),
        (timeline.firstCheck + index * timeline.betweenChecks) * 1000,
      ),
    );
    timers.push(window.setTimeout(finish, timeline.autoFinish * 1000));

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape" || event.key === "Enter") finish();
    }
    window.addEventListener("keydown", onKeyDown);

    return () => {
      timers.forEach((id) => window.clearTimeout(id));
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [pending]);

  return (
    <AnimatePresence>
      {pending ? (
        <motion.div
          key="welcome"
          ref={dialogRef}
          role="dialog"
          aria-modal="true"
          aria-label={t.label}
          tabIndex={-1}
          data-testid="welcome"
          initial={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={transitions.base}
          onClick={finish}
          className="bg-inverse-bg text-inverse-fg px-safe pt-safe pb-safe fixed inset-0 z-40 flex flex-col outline-none"
        >
          <div className="mx-auto flex w-full max-w-xl flex-1 flex-col justify-center gap-10 py-10">
            <Enter as="p" exit={undefined} className="text-title font-serif">
              {texts.app.name}
            </Enter>

            <Enter
              as="p"
              exit={undefined}
              delay={timeline.headline}
              className="text-display font-serif text-balance"
            >
              {t.headline.lead} <em>{t.headline.em}</em>, {t.headline.tail}
            </Enter>

            <Stagger
              aria-hidden
              exit={undefined}
              transition={{ delayChildren: timeline.list }}
              className="border-inverse-fg-2/40 border-t"
            >
              {t.items.map((item, index) => (
                <StaggerItem
                  key={item}
                  className="border-inverse-fg-2/40 text-row h-row flex items-center gap-4 border-b"
                >
                  <CheckCircle
                    checked={index < checked}
                    className="border-inverse-fg-2"
                  />
                  <span className="relative">
                    <span
                      className={[
                        "duration-base transition-colors ease-out",
                        index < checked ? "text-inverse-fg-2" : "",
                      ].join(" ")}
                    >
                      {item}
                    </span>
                    <span
                      aria-hidden
                      className={[
                        "bg-inverse-fg-2 duration-base absolute top-1/2 left-0 h-px w-full origin-left transition-transform ease-out",
                        index < checked ? "scale-x-100" : "scale-x-0",
                      ].join(" ")}
                    />
                  </span>
                </StaggerItem>
              ))}
            </Stagger>

            <Enter
              as="p"
              exit={undefined}
              delay={timeline.body}
              className="text-inverse-fg-2 max-w-prose text-pretty"
            >
              {t.body}
            </Enter>

            <Enter exit={undefined} delay={timeline.cta}>
              <Button
                type="button"
                size="touch-lg"
                onClick={(event) => {
                  event.stopPropagation();
                  finish();
                }}
                className="bg-lime text-on-lime hover:bg-lime/90 dark:hover:bg-lime/90 w-full sm:w-auto"
              >
                {t.cta}
              </Button>
            </Enter>
          </div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}
