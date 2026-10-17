"use client";

import { Plus } from "lucide-react";
import { useSyncExternalStore, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { texts } from "@/lib/texts";

const INPUT_ID = "add-item-name";

/*
 * Alto del teclado virtual en iOS, donde el teclado no achica el layout
 * viewport y una barra `fixed; bottom: 0` quedaría tapada. En Android
 * (interactive-widget=resizes-content) y en escritorio vale 0.
 */
function subscribeToViewport(onChange: () => void) {
  const viewport = window.visualViewport;
  viewport?.addEventListener("resize", onChange);
  viewport?.addEventListener("scroll", onChange);
  window.addEventListener("resize", onChange);
  return () => {
    viewport?.removeEventListener("resize", onChange);
    viewport?.removeEventListener("scroll", onChange);
    window.removeEventListener("resize", onChange);
  };
}

function getKeyboardInset() {
  const viewport = window.visualViewport;
  if (!viewport) return 0;
  const inset = window.innerHeight - viewport.height - viewport.offsetTop;
  return Math.max(0, Math.round(inset));
}

function getServerKeyboardInset() {
  return 0;
}

export function AddItemBar() {
  const keyboardInset = useSyncExternalStore(
    subscribeToViewport,
    getKeyboardInset,
    getServerKeyboardInset,
  );
  const keyboardOpen = keyboardInset > 0;

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    // La inserción llega en la fase 2; por ahora el formulario no envía nada.
    event.preventDefault();
  }

  return (
    <div
      data-keyboard-open={keyboardOpen}
      style={{ bottom: keyboardInset }}
      className="fixed inset-x-0 bottom-0 z-20 border-t bg-background/95 backdrop-blur-md"
    >
      <form
        onSubmit={handleSubmit}
        className="mx-auto flex w-full max-w-xl items-center gap-2 px-safe pt-3 pb-safe in-data-[keyboard-open=true]:pb-3"
      >
        <label htmlFor={INPUT_ID} className="sr-only">
          {texts.addItem.label}
        </label>
        <Input
          id={INPUT_ID}
          name="name"
          type="text"
          autoFocus
          autoComplete="off"
          autoCapitalize="sentences"
          enterKeyHint="enter"
          placeholder={texts.addItem.placeholder}
          className="h-touch-lg rounded-xl bg-card px-4 text-base md:text-base dark:bg-card"
        />
        <Button
          type="submit"
          size="icon-touch-lg"
          aria-label={texts.addItem.submit}
        >
          <Plus aria-hidden strokeWidth={2.5} />
        </Button>
      </form>
    </div>
  );
}
