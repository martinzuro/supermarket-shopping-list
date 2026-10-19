"use client";

import { useIsMutating, useMutationState } from "@tanstack/react-query";
import { Plus, XIcon } from "lucide-react";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { Collapse } from "@/components/motion";
import { useKeyboardInset } from "@/components/list/use-keyboard-inset";
import { useSession } from "@/components/session-provider";
import { Banner } from "@/components/ui/banner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { parseItemInput, suggestCategory } from "@/lib/domain";
import {
  itemMutationKeys,
  newItem,
  queryKeys,
  useAddItem,
  useCatalog,
  useCategories,
  useItems,
  useLists,
  type EditItem,
  type RemoveItem,
  type ToggleItem,
} from "@/lib/queries";
import { texts } from "@/lib/texts";

/** Id del campo de añadir; la bienvenida le pasa el foco al terminar. */
export const ADD_ITEM_INPUT_ID = "add-item-name";
const INPUT_ID = ADD_ITEM_INPUT_ID;

/** El aviso se va solo; para entonces el cambio ya se deshizo a la vista. */
const NOTICE_MS = 8000;

/** Mismo límite que la columna `items.name`. */
export const MAX_NAME_LENGTH = 200;

type Notice = { key: string; at: number; title: string; body: string };

/**
 * Cambios sobre ítems existentes (marcar, editar, borrar, vaciar el carro)
 * que el servidor
 * rechazó, como avisos. Los del alta los pone el propio formulario, que
 * además devuelve el texto al campo.
 */
function useWriteFailures(userId: string, listId: string): Notice[] {
  return useMutationState({
    filters: {
      mutationKey: itemMutationKeys.all(userId, listId),
      status: "error",
      predicate: (mutation) => mutation.options.mutationKey?.at(-1) !== "add",
    },
    select: (mutation): Notice => {
      const kind = mutation.options.mutationKey?.at(-1);
      const at = mutation.state.submittedAt;
      const key = `${String(kind)}:${mutation.mutationId}`;
      if (kind === "toggle") {
        const { name, checked } = mutation.state.variables as ToggleItem;
        return {
          key,
          at,
          title: checked
            ? texts.itemErrors.check(name)
            : texts.itemErrors.uncheck(name),
          body: texts.itemErrors.toggleBody,
        };
      }
      if (kind === "empty-cart") {
        return {
          key,
          at,
          title: texts.itemErrors.emptyCart,
          body: texts.itemErrors.emptyCartBody,
        };
      }
      const { name } = mutation.state.variables as EditItem | RemoveItem;
      return kind === "remove"
        ? {
            key,
            at,
            title: texts.itemErrors.remove(name),
            body: texts.itemErrors.removeBody,
          }
        : {
            key,
            at,
            title: texts.itemErrors.edit(name),
            body: texts.itemErrors.editBody,
          };
    },
  });
}

/**
 * El aviso más reciente, si es posterior al último cerrado. Cerrar uno cierra
 * también los anteriores que tapaba: las escrituras de la lista van en cola,
 * así que un fallo nunca llega antes que otro enviado después.
 */
function latestNotice(
  notices: readonly (Notice | null)[],
  dismissedAt: number,
): Notice | null {
  let latest: Notice | null = null;
  for (const notice of notices) {
    if (!notice || notice.at <= dismissedAt) continue;
    if (!latest || notice.at >= latest.at) latest = notice;
  }
  return latest;
}

export function AddItemBar() {
  const keyboardInset = useKeyboardInset();
  const keyboardOpen = keyboardInset > 0;

  const { user } = useSession();
  const userId = user?.id ?? null;
  // Solo lee la lista: crearla en el primer uso es cosa de ListView.
  const listId = useLists(userId).data?.[0]?.id ?? null;
  const items = useItems(userId, listId);
  const categories = useCategories(userId, listId);
  const catalog = useCatalog(userId, listId);
  // Mientras la lista se crea, el servidor todavía no la conoce: un ítem
  // agregado en ese momento lo rechazaría la RLS.
  const creatingList =
    useIsMutating({ mutationKey: queryKeys.lists(userId ?? "") }) > 0;
  // Antes de que lleguen los ítems, la posición del nuevo chocaría con la de
  // uno existente y la lista mostraría solo el nuevo.
  // "Has data": a failed background refetch keeps it and must not block.
  const ready =
    userId !== null &&
    listId !== null &&
    items.data !== undefined &&
    // The category comes from them: without the categories there is no
    // "Otros"; without the catalog (if it fails) everything goes to "Otros".
    categories.data !== undefined &&
    (catalog.data !== undefined || catalog.isError) &&
    !creatingList;
  const add = useAddItem(userId ?? "", listId ?? "");
  const inputRef = useRef<HTMLInputElement>(null);

  const [addFailure, setAddFailure] = useState<Notice | null>(null);
  const writeFailures = useWriteFailures(userId ?? "", listId ?? "");
  const [dismissedAt, setDismissedAt] = useState(0);
  const notice = latestNotice([addFailure, ...writeFailures], dismissedAt);

  function dismiss(at: number) {
    setDismissedAt((current) => Math.max(current, at));
  }

  const noticeAt = notice?.at ?? null;
  useEffect(() => {
    if (noticeAt === null) return;
    const timer = setTimeout(() => dismiss(noticeAt), NOTICE_MS);
    return () => clearTimeout(timer);
  }, [noticeAt]);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const field = inputRef.current;
    if (!field) return;
    // El teclado no se cierra entre un producto y el siguiente.
    field.focus();
    const raw = field.value;
    const parsed = parseItemInput(raw);
    if (!parsed.name || !ready) return;

    field.value = "";
    if (notice) dismiss(notice.at);
    const item = newItem(parsed.name, {
      ...parsed,
      categoryId: suggestCategory(
        parsed.name,
        catalog.data ?? [],
        categories.data ?? [],
      ),
    });
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
                onClick={() => dismiss(notice.at)}
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
