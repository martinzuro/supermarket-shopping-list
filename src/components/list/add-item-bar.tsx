"use client";

import { useIsMutating, useMutationState } from "@tanstack/react-query";
import { Plus, XIcon } from "lucide-react";
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
  type KeyboardEvent,
  type MouseEvent,
} from "react";
import { FrequentsRow } from "@/components/list/frequents-row";
import {
  SuggestionList,
  optionId,
  type Suggestion,
} from "@/components/list/suggestion-list";
import { useBarHeight } from "@/components/list/use-bar-height";
import { useKeyboardInset } from "@/components/list/use-keyboard-inset";
import { Collapse } from "@/components/motion";
import { useSession } from "@/components/session-provider";
import { Banner } from "@/components/ui/banner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  DEFAULT_CURRENCY,
  categoryKind,
  formatMoney,
  frequentsOf,
  parseItemInput,
  rememberedPrice,
  suggestCategory,
  suggestionsFor,
  usualsOf,
  type ParsedItemInput,
} from "@/lib/domain";
import {
  addItems,
  categoryMutationKeys,
  itemMutationKeys,
  newItem,
  queryKeys,
  useAddItem,
  useAddItems,
  useUndoAdd,
  useCatalog,
  useCategories,
  useItems,
  currentListOf,
  useLists,
  type AddItems,
  type CatalogEntry,
  type EditItem,
  type MoveCategory,
  type RemoveItem,
  type ToggleItem,
  type UndoAdd,
} from "@/lib/queries";
import { texts } from "@/lib/texts";

/** Id del campo de añadir; la bienvenida le pasa el foco al terminar. */
export const ADD_ITEM_INPUT_ID = "add-item-name";
const INPUT_ID = ADD_ITEM_INPUT_ID;

/** El aviso se va solo; para entonces el cambio ya se deshizo a la vista. */
const NOTICE_MS = 8000;

/**
 * Un segundo toque antes de esto y casi en el mismo lugar es un doble toque
 * accidental (el mismo criterio que la confirmación de borrar de la hoja).
 */
const DOUBLE_TAP_MS = 350;
const DOUBLE_TAP_PX = 24;

/** Mismo límite que la columna `items.name`. */
export const MAX_NAME_LENGTH = 200;

/**
 * Un aviso de la barra: un rechazo del servidor (tono error, con su cierre)
 * o, con `undo`, lo que "Lo de siempre" acaba de agregar (tono info, con
 * "Deshacer").
 */
type Notice = {
  key: string;
  at: number;
  title: string;
  body?: string;
  undo?: { ids: readonly string[] };
};

/** Las escrituras sobre ítems que avisan si el servidor las rechaza. */
const FAILURE_KINDS = new Set([
  "toggle",
  "edit",
  "remove",
  "empty-cart",
  "add-many",
  "undo-add",
]);

/**
 * Cambios sobre ítems existentes (marcar, editar, borrar, vaciar el carro) y
 * el alta de varios ("Lo de siempre") o su deshacer, que el servidor
 * rechazó, como avisos. El alta de uno la pone el propio formulario, que
 * además devuelve el texto al campo.
 */
function useWriteFailures(userId: string, listId: string): Notice[] {
  return useMutationState({
    filters: {
      mutationKey: itemMutationKeys.all(userId, listId),
      status: "error",
      predicate: (mutation) =>
        FAILURE_KINDS.has(String(mutation.options.mutationKey?.at(-1))),
    },
    select: (mutation): Notice => {
      const kind = mutation.options.mutationKey?.at(-1);
      const at = mutation.state.submittedAt;
      const key = `${String(kind)}:${mutation.mutationId}`;
      if (kind === "add-many") {
        const { items } = mutation.state.variables as AddItems;
        return {
          key,
          at,
          title: texts.itemErrors.addMany(items.length),
          body: texts.itemErrors.addManyBody,
        };
      }
      if (kind === "undo-add") {
        return {
          key,
          at,
          title: texts.itemErrors.undoAdd,
          body: texts.itemErrors.undoAddBody,
        };
      }
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
 * Movimientos del recorrido que el servidor rechazó. Con la hoja del
 * recorrido abierta el aviso sale ahí; esto cubre cuando ya se cerró (el
 * rechazo llega tarde, o se cerró antes de verlo).
 */
function useRouteFailures(userId: string, listId: string): Notice[] {
  return useMutationState({
    filters: {
      mutationKey: categoryMutationKeys.all(userId, listId),
      status: "error",
    },
    select: (mutation): Notice => {
      const { name } = mutation.state.variables as MoveCategory;
      return {
        key: `move:${mutation.mutationId}`,
        at: mutation.state.submittedAt,
        title: texts.route.error.title(name),
        body: texts.route.error.body,
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

/** Id de la lista de opciones; el campo la declara en `aria-controls`. */
const LISTBOX_ID = "add-item-suggestions";

const NO_ENTRIES: readonly CatalogEntry[] = [];

/** Que el foco no vaya a la píldora ni al botón que se toca. */
const keepFocus = (event: { preventDefault: () => void }) =>
  event.preventDefault();

export function AddItemBar() {
  const keyboardInset = useKeyboardInset();
  const keyboardOpen = keyboardInset > 0;
  const barRef = useRef<HTMLDivElement>(null);
  useBarHeight(barRef, keyboardInset);

  const { user } = useSession();
  const userId = user?.id ?? null;
  // Solo lee la lista: crearla en el primer uso es cosa de ListView.
  const listId = currentListOf(useLists(userId).data)?.id ?? null;
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
    // The category comes from them. If either fails to load, the item goes
    // without category, which the list shows under "Otros".
    (categories.data !== undefined || categories.isError) &&
    (catalog.data !== undefined || catalog.isError) &&
    !creatingList;
  const add = useAddItem(userId ?? "", listId ?? "");
  const addMany = useAddItems(userId ?? "", listId ?? "");
  const undoAdd = useUndoAdd(userId ?? "", listId ?? "");
  const inputRef = useRef<HTMLInputElement>(null);

  // El campo no es controlado (se vacía y se llena a mano al agregar y al
  // rechazar); `query` lo refleja para filtrar las sugerencias.
  const [query, setQuery] = useState("");
  const [activeKey, setActiveKey] = useState<string | null>(null);
  // El texto con el que Escape cerró la lista: vuelve al cambiar el texto.
  const [closedFor, setClosedFor] = useState<string | null>(null);
  // Sin foco en el campo no hay lista abierta que tape la pantalla.
  const [away, setAway] = useState(false);

  const [addFailure, setAddFailure] = useState<Notice | null>(null);
  const [usualsNotice, setUsualsNotice] = useState<Notice | null>(null);
  const writeFailures = useWriteFailures(userId ?? "", listId ?? "");
  const routeFailures = useRouteFailures(userId ?? "", listId ?? "");
  const [dismissedAt, setDismissedAt] = useState(0);
  // Los rechazos van después: si empatan con el aviso de lo agregado, gana
  // el rechazo.
  const notice = latestNotice(
    [usualsNotice, addFailure, ...writeFailures, ...routeFailures],
    dismissedAt,
  );

  function dismiss(at: number) {
    setDismissedAt((current) => Math.max(current, at));
  }

  const noticeAt = notice?.at ?? null;
  useEffect(() => {
    if (noticeAt === null) return;
    const timer = setTimeout(() => dismiss(noticeAt), NOTICE_MS);
    return () => clearTimeout(timer);
  }, [noticeAt]);

  // Lo que se propone sale del catálogo, sin lo que ya está pendiente.
  const entries = ready ? (catalog.data ?? NO_ENTRIES) : NO_ENTRIES;
  const pendingNames = useMemo(
    () =>
      new Set(
        (items.data ?? [])
          .filter((item) => item.deleted_at == null && !item.checked)
          .map((item) => item.name_normalized),
      ),
    [items.data],
  );
  const parsed = useMemo(() => parseItemInput(query), [query]);
  const suggestions = useMemo(
    () => suggestionsFor(parsed.name, entries, pendingNames),
    [parsed.name, entries, pendingNames],
  );
  const typing = query.trim() !== "";
  const frequents = useMemo(
    () => (typing ? [] : frequentsOf(entries, pendingNames)),
    [typing, entries, pendingNames],
  );
  // The clock is read only with a catalog in hand: never while the page is
  // prerendered, where the time would be the build's.
  const usuals = useMemo(
    () =>
      typing || entries.length === 0
        ? []
        : usualsOf(entries, pendingNames, new Date()),
    [typing, entries, pendingNames],
  );
  // Con uno solo no hay nada que agregar "de una vez".
  const usualsCount = usuals.length >= 2 ? usuals.length : 0;

  const open = suggestions.length > 0 && !away && closedFor !== query;
  // La mejor opción queda pegada al campo: arriba, las demás.
  const options = useMemo<Suggestion[]>(
    () =>
      [...suggestions].reverse().map((entry) => {
        const category = categories.data?.find(
          (one) => one.id === entry.last_category_id,
        );
        return {
          key: entry.name_normalized,
          name: entry.display_name,
          category: category ? categoryKind(category) : "otros",
          price:
            entry.last_price == null
              ? null
              : formatMoney(
                  entry.last_price,
                  entry.last_currency || DEFAULT_CURRENCY,
                ),
        };
      }),
    [suggestions, categories.data],
  );
  const activeIndex = open
    ? options.findIndex((option) => option.key === activeKey)
    : -1;
  const showRow = !open && (usualsCount > 0 || frequents.length > 0);

  function setFieldText(value: string) {
    if (inputRef.current) inputRef.current.value = value;
    setQuery(value);
    setActiveKey(null);
  }

  /**
   * Agrega un producto con su categoría y su último precio del catálogo,
   * venga de donde venga. `raw` es lo escrito, que vuelve al campo si el
   * servidor lo rechaza.
   */
  function addNamed(
    name: string,
    details: Pick<ParsedItemInput, "quantity" | "unit">,
    raw: string,
  ) {
    if (notice) dismiss(notice.at);
    const item = newItem(name, {
      ...details,
      categoryId: suggestCategory(
        name,
        catalog.data ?? [],
        categories.data ?? [],
      ),
      price: rememberedPrice(name, catalog.data ?? []),
    });
    const at = Date.now();
    add.mutateAsync(item).catch(() => {
      // El ítem ya salió de la lista (rollback de useAddItem). Lo escrito
      // vuelve al campo, salvo que ya haya otra cosa: no se pisa.
      const current = inputRef.current;
      const restored = raw !== "" && current !== null && current.value === "";
      if (restored) setFieldText(raw);
      setAddFailure({
        key: `add:${item.id}`,
        at,
        title: texts.itemErrors.add(name),
        body: restored
          ? texts.itemErrors.addRestored
          : texts.itemErrors.addLost,
      });
    });
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const field = inputRef.current;
    if (!field) return;
    // El teclado no se cierra entre un producto y el siguiente.
    field.focus();
    const raw = field.value;
    const typed = parseItemInput(raw);
    if (!typed.name || !ready) return;

    setFieldText("");
    addNamed(typed.name, typed, raw);
  }

  // El último toque que agregó algo desde la lista o la fila: un segundo
  // toque casi en el mismo lugar antes de DOUBLE_TAP_MS es un doble toque
  // accidental, no otro pedido (lo que quedó bajo el dedo puede ser otra
  // opción u otra píldora). Con teclado no hay doble toque.
  const lastTap = useRef<{ x: number; y: number; at: number } | null>(null);
  function isDoubleTap(event: MouseEvent<HTMLElement>) {
    if (event.detail === 0) return false;
    const now = Date.now();
    const previous = lastTap.current;
    lastTap.current = { x: event.clientX, y: event.clientY, at: now };
    return (
      previous !== null &&
      now - previous.at < DOUBLE_TAP_MS &&
      Math.hypot(event.clientX - previous.x, event.clientY - previous.y) <
        DOUBLE_TAP_PX
    );
  }

  /** Una opción de la lista: el producto del catálogo con lo escrito. */
  function pick(key: string, event?: MouseEvent<HTMLElement>) {
    // Enter on the active option comes with no event: no double tap there.
    if (event && isDoubleTap(event)) return;
    const entry = suggestions.find((one) => one.name_normalized === key);
    const field = inputRef.current;
    if (!entry || !field || !ready) return;
    field.focus();
    const raw = field.value;
    setFieldText("");
    addNamed(
      entry.display_name,
      { quantity: parsed.quantity, unit: parsed.unit },
      raw,
    );
  }

  /** Un frecuente de la fila: sin cantidad, con lo del catálogo. */
  function pickFrequent(key: string, event: MouseEvent<HTMLButtonElement>) {
    if (isDoubleTap(event)) return;
    const entry = frequents.find((one) => one.name_normalized === key);
    if (!entry || !ready) return;
    // Con teclado, la píldora que se va se lleva el foco: vuelve al campo.
    if (document.activeElement === event.currentTarget) {
      inputRef.current?.focus();
    }
    addNamed(entry.display_name, { quantity: null, unit: null }, "");
  }

  /** "Lo de siempre": todo lo habitual que no está pendiente, en una escritura. */
  function addUsuals(event: MouseEvent<HTMLButtonElement>) {
    if (isDoubleTap(event) || !ready || usualsCount === 0) return;
    if (document.activeElement === event.currentTarget) {
      inputRef.current?.focus();
    }
    if (notice) dismiss(notice.at);
    const created = usuals.map((entry) =>
      newItem(entry.display_name, {
        categoryId: suggestCategory(
          entry.display_name,
          catalog.data ?? [],
          categories.data ?? [],
        ),
        price: rememberedPrice(entry.display_name, catalog.data ?? []),
      }),
    );
    const variables = addItems(created);
    // Antes de escribir: si el servidor rechaza, su aviso (con la hora de
    // envío) es posterior a este y lo reemplaza.
    const at = Date.now();
    const key = `usuals:${variables.ids[0]}`;
    addMany.mutateAsync(variables).catch(() => {
      setUsualsNotice((current) => (current?.key === key ? null : current));
    });
    setUsualsNotice({
      key,
      at,
      title: texts.addItem.usuals.added(created.length),
      undo: { ids: variables.ids },
    });
  }

  function undoUsuals(
    shown: Notice & { undo: NonNullable<Notice["undo"]> },
    event: MouseEvent<HTMLButtonElement>,
  ) {
    if (document.activeElement === event.currentTarget) {
      inputRef.current?.focus();
    }
    const variables: UndoAdd = {
      ids: shown.undo.ids,
      deletedAt: new Date().toISOString(),
    };
    undoAdd.mutate(variables);
    dismiss(shown.at);
  }

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.nativeEvent.isComposing) return;
    const { key } = event;
    if (key === "Escape" && open) {
      event.preventDefault();
      setClosedFor(query);
      setActiveKey(null);
      return;
    }
    if ((key === "ArrowUp" || key === "ArrowDown") && suggestions.length > 0) {
      event.preventDefault();
      if (!open) {
        setClosedFor(null);
        setAway(false);
        return;
      }
      // Las flechas siguen lo que se ve: la lista está sobre el campo, así
      // que "arriba" llega primero a la mejor opción, la pegada al campo.
      const last = options.length - 1;
      const next =
        key === "ArrowUp"
          ? activeIndex === -1
            ? last
            : Math.max(0, activeIndex - 1)
          : activeIndex === -1
            ? 0
            : activeIndex === last
              ? -1
              : activeIndex + 1;
      setActiveKey(next === -1 ? null : options[next].key);
      return;
    }
    if (key === "Enter" && open && activeIndex !== -1) {
      event.preventDefault();
      pick(options[activeIndex].key);
    }
  }

  const undoNotice =
    notice?.undo !== undefined
      ? (notice as Notice & { undo: NonNullable<Notice["undo"]> })
      : null;

  return (
    <div
      ref={barRef}
      data-keyboard-open={keyboardOpen}
      style={{ bottom: keyboardInset }}
      className="bg-paper border-rule fixed inset-x-0 bottom-0 z-20 border-t"
    >
      <Collapse
        show={notice !== null}
        className="px-safe mx-auto max-w-xl pt-3"
      >
        {undoNotice ? (
          <Banner
            tone="info"
            title={undoNotice.title}
            // Lo lee la región de abajo, siempre montada.
            liveRegion={false}
            action={
              <Button
                type="button"
                variant="outline"
                onPointerDown={keepFocus}
                onMouseDown={keepFocus}
                onClick={(event) => undoUsuals(undoNotice, event)}
              >
                {texts.addItem.usuals.undo}
              </Button>
            }
          />
        ) : notice ? (
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
      <div role="status" data-slot="add-announcement" className="sr-only">
        {undoNotice?.title}
      </div>
      <Collapse show={open || showRow} className="mx-auto max-w-xl pt-2">
        {open ? (
          <div className="px-safe">
            <SuggestionList
              id={LISTBOX_ID}
              options={options}
              activeKey={activeKey}
              onPick={pick}
            />
          </div>
        ) : (
          <FrequentsRow
            usualsCount={usualsCount}
            products={frequents.map((entry) => ({
              key: entry.name_normalized,
              name: entry.display_name,
            }))}
            onUsuals={addUsuals}
            onPick={pickFrequent}
          />
        )}
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
          role="combobox"
          aria-autocomplete="list"
          aria-expanded={open}
          aria-controls={LISTBOX_ID}
          aria-activedescendant={
            activeIndex === -1 ? undefined : optionId(LISTBOX_ID, activeIndex)
          }
          autoFocus
          autoComplete="off"
          autoCapitalize="sentences"
          enterKeyHint="enter"
          maxLength={MAX_NAME_LENGTH}
          placeholder={texts.addItem.placeholder}
          className="h-touch-lg rounded-full px-5"
          onChange={(event) => {
            setQuery(event.target.value);
            setActiveKey(null);
            // Escape cerró la lista para ese texto; cualquier cambio la abre.
            setClosedFor(null);
            // Escribir entre dos toques es otro pedido, no un doble toque.
            lastTap.current = null;
          }}
          onKeyDown={handleKeyDown}
          onFocus={() => setAway(false)}
          onBlur={() => setAway(true)}
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
