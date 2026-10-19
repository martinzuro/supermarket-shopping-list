"use client";

import { useMutationState } from "@tanstack/react-query";
import { Plus, XIcon } from "lucide-react";
import {
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type FormEvent,
} from "react";
import { Collapse } from "@/components/motion";
import { useSession } from "@/components/session-provider";
import { Banner } from "@/components/ui/banner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { parseItemInput } from "@/lib/domain";
import {
  itemMutationKeys,
  newItem,
  useAddItem,
  useLists,
  type ToggleItem,
} from "@/lib/queries";
import { texts } from "@/lib/texts";

/** Id del campo de añadir; la bienvenida le pasa el foco al terminar. */
export const ADD_ITEM_INPUT_ID = "add-item-name";
const INPUT_ID = ADD_ITEM_INPUT_ID;

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

/** El aviso se va solo; para entonces el cambio ya se deshizo a la vista. */
const NOTICE_MS = 8000;

/** Mismo límite que la columna `items.name`. */
const MAX_NAME_LENGTH = 200;

type Notice = { key: string; at: number; title: string; body: string };

/** Último toque de marcar que el servidor rechazó, como aviso. */
function useToggleFailure(userId: string, listId: string): Notice | null {
  const failures = useMutationState({
    filters: {
      mutationKey: itemMutationKeys.toggle(userId, listId),
      status: "error",
    },
    select: (mutation): Notice => {
      const { name, checked } = mutation.state.variables as ToggleItem;
      return {
        key: `toggle:${mutation.mutationId}`,
        at: mutation.state.submittedAt,
        title: checked
          ? texts.itemErrors.check(name)
          : texts.itemErrors.uncheck(name),
        body: texts.itemErrors.toggleBody,
      };
    },
  });
  return failures.reduce<Notice | null>(
    (latest, notice) => (!latest || notice.at >= latest.at ? notice : latest),
    null,
  );
}

export function AddItemBar() {
  const keyboardInset = useSyncExternalStore(
    subscribeToViewport,
    getKeyboardInset,
    getServerKeyboardInset,
  );
  const keyboardOpen = keyboardInset > 0;

  const { user } = useSession();
  const userId = user?.id ?? null;
  // Solo lee la lista: crearla en el primer uso es cosa de ListView.
  const listId = useLists(userId).data?.[0]?.id ?? null;
  const add = useAddItem(userId ?? "", listId ?? "");
  const inputRef = useRef<HTMLInputElement>(null);

  const [addFailure, setAddFailure] = useState<Notice | null>(null);
  const toggleFailure = useToggleFailure(userId ?? "", listId ?? "");
  const [dismissed, setDismissed] = useState<string | null>(null);
  const latest =
    addFailure && (!toggleFailure || addFailure.at >= toggleFailure.at)
      ? addFailure
      : toggleFailure;
  const notice = latest && latest.key !== dismissed ? latest : null;

  const noticeKey = notice?.key ?? null;
  useEffect(() => {
    if (noticeKey === null) return;
    const timer = setTimeout(() => setDismissed(noticeKey), NOTICE_MS);
    return () => clearTimeout(timer);
  }, [noticeKey]);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const field = inputRef.current;
    if (!field) return;
    // El teclado no se cierra entre un producto y el siguiente.
    field.focus();
    const raw = field.value;
    const parsed = parseItemInput(raw);
    if (!parsed.name || userId === null || listId === null) return;

    field.value = "";
    if (notice) setDismissed(notice.key);
    const item = newItem(parsed.name, parsed);
    const at = Date.now();
    add.mutateAsync(item).catch(() => {
      // El ítem ya salió de la lista (rollback de useAddItem). Lo escrito
      // vuelve al campo, salvo que ya haya otra cosa: no se pisa.
      const current = inputRef.current;
      const restored = current !== null && current.value === "";
      if (restored) current.value = raw;
      setAddFailure({
        key: `add:${item.id}`,
        at,
        title: texts.itemErrors.add(parsed.name),
        body: restored
          ? texts.itemErrors.addRestored
          : texts.itemErrors.addLost,
      });
    });
  }

  return (
    <div
      data-keyboard-open={keyboardOpen}
      style={{ bottom: keyboardInset }}
      className="bg-paper border-rule fixed inset-x-0 bottom-0 z-20 border-t"
    >
      <Collapse
        show={notice !== null}
        className="px-safe mx-auto max-w-xl pt-3"
      >
        {notice ? (
          <Banner
            tone="error"
            title={notice.title}
            body={notice.body}
            action={
              <Button
                type="button"
                variant="ghost"
                size="icon-touch"
                aria-label={texts.itemErrors.dismiss}
                onClick={() => setDismissed(notice.key)}
              >
                <XIcon aria-hidden strokeWidth={1.5} />
              </Button>
            }
          />
        ) : null}
      </Collapse>
      <form
        onSubmit={handleSubmit}
        className="px-safe pb-safe mx-auto flex w-full max-w-xl items-center gap-2 pt-3 in-data-[keyboard-open=true]:pb-3"
      >
        <label htmlFor={INPUT_ID} className="sr-only">
          {texts.addItem.label}
        </label>
        <Input
          ref={inputRef}
          id={INPUT_ID}
          name="name"
          type="text"
          autoFocus
          autoComplete="off"
          autoCapitalize="sentences"
          enterKeyHint="enter"
          maxLength={MAX_NAME_LENGTH}
          placeholder={texts.addItem.placeholder}
          className="h-touch-lg rounded-full px-5"
        />
        <Button
          type="submit"
          size="icon-touch-lg"
          aria-label={texts.addItem.submit}
          // Tocar el botón no le saca el foco al campo.
          onMouseDown={(event) => event.preventDefault()}
        >
          <Plus aria-hidden strokeWidth={2} />
        </Button>
      </form>
    </div>
  );
}
