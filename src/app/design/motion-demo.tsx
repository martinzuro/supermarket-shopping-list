"use client";

import { Check } from "lucide-react";
import { useState } from "react";
import { texts } from "@/lib/texts";

const t = texts.design.motion;

/**
 * Demostración interactiva de los tokens de motion: entrada escalonada,
 * marcado con tachado y pulso de cambio remoto. Solo anima transform y
 * opacity; con movimiento reducido el desplazamiento y el escalonado son 0
 * por los propios tokens.
 */
export function MotionDemo() {
  const [run, setRun] = useState(0);
  const [checked, setChecked] = useState(false);
  const [pulse, setPulse] = useState(false);

  function triggerPulse() {
    setPulse(true);
    window.setTimeout(() => setPulse(false), 1000);
  }

  return (
    <div className="grid gap-8">
      <div>
        <ul key={run} className="border-rule border-t">
          {t.demoItems.map((item, index) => (
            <li
              key={item}
              className="animate-enter border-rule text-row h-row flex items-center border-b"
              style={{
                animationDelay: `calc(var(--motion-stagger) * ${index})`,
              }}
            >
              {item}
            </li>
          ))}
        </ul>
        <button
          type="button"
          onClick={() => setRun((n) => n + 1)}
          className="bg-paper-2 text-ink text-label hover:bg-paper-pressed h-touch duration-instant mt-4 inline-flex items-center rounded-full px-5 transition-[background-color,transform] ease-out active:scale-[0.98]"
        >
          {t.replay}
        </button>
      </div>

      <div className="grid gap-3">
        <button
          type="button"
          role="checkbox"
          aria-checked={checked}
          onClick={() => setChecked((c) => !c)}
          className="border-rule h-row text-row group flex w-full items-center gap-4 border-y text-left"
        >
          <span
            aria-hidden
            className={[
              "border-field-border duration-base flex size-6 shrink-0 items-center justify-center rounded-full border-2 transition-[background-color,border-color,transform] ease-out group-active:scale-90",
              checked ? "bg-lime border-lime" : "",
            ].join(" ")}
          >
            <Check
              className={[
                "text-on-lime duration-fast size-4 transition-[opacity,transform] ease-out",
                checked ? "scale-100 opacity-100" : "scale-50 opacity-0",
              ].join(" ")}
              strokeWidth={2.5}
            />
          </span>
          <span className="relative">
            <span
              className={[
                "duration-base transition-colors ease-out",
                checked ? "text-ink-2" : "text-ink",
              ].join(" ")}
            >
              {t.demoItems[0]}
            </span>
            <span
              aria-hidden
              className={[
                "bg-ink-2 duration-base absolute top-1/2 left-0 h-px w-full origin-left transition-transform ease-out",
                checked ? "scale-x-100" : "scale-x-0",
              ].join(" ")}
            />
          </span>
          <span className="eyebrow ml-auto">{t.check}</span>
        </button>

        <div
          className={[
            "border-rule h-row text-row flex items-center gap-4 border-b transition-colors",
            pulse
              ? "bg-remote-pulse duration-instant"
              : "duration-slow ease-out",
          ].join(" ")}
        >
          <span>{t.demoItems[2]}</span>
          <button
            type="button"
            onClick={triggerPulse}
            className="text-ink-2 text-label hover:text-ink duration-fast h-touch ml-auto px-2 underline-offset-4 transition-colors ease-out hover:underline"
          >
            {t.pulse}
          </button>
        </div>
      </div>

      <p className="text-ink-2 max-w-prose text-pretty">{t.reducedNote}</p>
    </div>
  );
}
