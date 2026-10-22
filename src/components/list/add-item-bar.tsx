"use client";

import {
  useIsMutating,
  useMutationState,
  useQueryClient,
  type QueryClient,
} from "@tanstack/react-query";
import { Plus, XIcon } from "lucide-react";
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type ClipboardEvent,
  type FormEvent,
  type KeyboardEvent,
  type MouseEvent,
} from "react";
import {
  lastAddedAt,
  showAdded,
  useAddSeveral,
  useAddedNotice,
  type SeveralAdded,
} from "@/components/list/add-several";
import { FrequentsRow } from "@/components/list/frequents-row";
import { lastCopyAt, useLastCopy } from "@/components/list/send-pending";
import {
  SuggestionList,
  optionId,
  type Suggestion,
} from "@/components/list/suggestion-list";
import { useBarHeight } from "@/components/list/use-bar-height";
import { useDoubleTap } from "@/components/list/use-double-tap";
import { useKeyboardInset } from "@/components/list/use-keyboard-inset";
import {
  ReviewSheet,
  type ReviewProduct,
} from "@/components/list/review-sheet";
import { Collapse } from "@/components/motion";
import { useSession } from "@/components/session-provider";
import { Banner } from "@/components/ui/banner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  PASTE_LIMIT,
  SUGGESTION_LIMIT,
  addedQuantity,
  categoryKind,
  findPending,
  formatMoney,
  formatQuantity,
  frequentsOf,
  inRouteOrder,
  normalizeName,
  parseItemInput,
  pendingMatchesFor,
  rememberedAmount,
  rememberedPrice,
  suggestCategory,
  pastedList,
  suggestionsFor,
  unitForQuantity,
  usualsOf,
  type ParsedItemInput,
} from "@/lib/domain";
import {
  categoryMutationKeys,
  itemMutationKeys,
  newItem,
  type NewItem,
  queryKeys,
  useAddItem,
  useEditItem,
  useToggleItem,
  useUndoAdd,
  useCatalog,
  useCategories,
  useItems,
  currentListOf,
  useLists,
  type AddItems,
  type Category,
  type CatalogEntry,
  type EditItem,
  type Item,
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

/** Mismo límite que la columna `items.name`. */
export const MAX_NAME_LENGTH = 200;

type Amount = Pick<ParsedItemInput, "quantity" | "unit">;

/**
 * What the review sheet shows: "Lo de siempre" (A-3), or a list pasted in the
 * field (F-2), each product as it would be typed. A paste of one line (a list
 * with commas) keeps where it went, so closing the sheet without adding
 * leaves the text in the field, as a plain paste would.
 */
type Review =
  | { kind: "usuals" }
  | {
      kind: "paste";
      pasted: { key: string; parsed: ParsedItemInput }[];
      /** More than PASTE_LIMIT were pasted: only the first ones are here. */
      cut: boolean;
      fallback: { text: string; start: number; end: number } | null;
    };

/**
 * Lo que "Deshacer" deshace: lo que "Lo de siempre" acaba de agregar, o el
 * último producto que se marcó (A-4), que vuelve a pendientes. `label` es el
 * nombre accesible del botón cuando "Deshacer" solo no alcanza.
 */
type Undo =
  | { kind: "add"; ids: readonly string[] }
  | { kind: "check"; id: string; name: string; label: string };

/**
 * Un aviso de la barra: un rechazo del servidor (tono error, con su cierre)
 * o, en tono info, algo que se puede deshacer (`undo`), un producto que ya
 * estaba pendiente (`duplicate`) o lo que falta, copiado (`copied`, F-3).
 */
type Notice = {
  key: string;
  at: number;
  title: string;
  body?: string;
  undo?: Undo;
  /**
   * Lo escrito ya estaba pendiente y no se agregó (A-2). `add` es el botón
   * que le suma lo escrito ("Sumar 2", con su nombre accesible); sin él las
   * cantidades no se suman y el aviso solo se cierra.
   */
  duplicate?: {
    name: string;
    added: Amount;
    add?: { label: string; aria: string };
  };
  /** Se copió lo que falta para pegarlo en un chat (F-3); solo se cierra. */
  copied?: true;
};

/** Las escrituras sobre ítems que avisan si el servidor las rechaza. */
const FAILURE_KINDS = new Set([
  "toggle",
  "edit",
  "remove",
  "empty-cart",
  "add-many",
  "undo-add",
  "restore-cart",
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
      if (kind === "restore-cart") {
        return {
          key,
          at,
          title: texts.itemErrors.restoreCart,
          body: texts.itemErrors.restoreCartBody,
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
 * El último producto que este dispositivo marcó, mientras su marca va al
 * servidor o ya llegó (docs/improvements.md, A-4): la fila se fue al carro,
 * fuera de la vista, y la barra ofrece devolverla sin ir a buscarla. Un
 * marcado rechazado tiene su propio aviso.
 */
function useLastCheck(userId: string, listId: string): Notice | null {
  const checks = useMutationState({
    filters: {
      mutationKey: itemMutationKeys.toggle(userId, listId),
      predicate: (mutation) =>
        mutation.state.status !== "error" &&
        (mutation.state.variables as ToggleItem | undefined)?.checked === true,
    },
    select: (mutation): Notice => {
      const { id, name } = mutation.state.variables as ToggleItem;
      return {
        key: `check:${mutation.mutationId}`,
        at: mutation.state.submittedAt,
        title: texts.list.cart.checked(name),
        undo: {
          kind: "check",
          id,
          name,
          label: texts.list.cart.undoAria(name),
        },
      };
    },
  });
  return latestNotice(checks, 0);
}

/**
 * When the last check already in the cache was made: the checks a bar finds
 * when it mounts (back from another page) are old news. Not the clock: the
 * page is prerendered, and a time read while rendering would be the build's.
 */
function lastCheckAt(
  queryClient: QueryClient,
  userId: string,
  listId: string,
): number {
  return queryClient
    .getMutationCache()
    .findAll({ mutationKey: itemMutationKeys.toggle(userId, listId) })
    .reduce(
      (latest, mutation) => Math.max(latest, mutation.state.submittedAt),
      0,
    );
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

/** Tinte e icono de la categoría de ese id, o los de "Otros". */
function kindOf(
  categories: readonly Category[] | undefined,
  id: string | null,
) {
  const category = categories?.find((one) => one.id === id);
  return category ? categoryKind(category) : "otros";
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
  const addMany = useAddSeveral(userId ?? "", listId ?? "");
  const undoAdd = useUndoAdd(userId ?? "", listId ?? "");
  const edit = useEditItem(userId ?? "", listId ?? "");
  const toggle = useToggleItem(userId ?? "", listId ?? "");
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
  const [duplicateNotice, setDuplicateNotice] = useState<Notice | null>(null);
  const writeFailures = useWriteFailures(userId ?? "", listId ?? "");
  const routeFailures = useRouteFailures(userId ?? "", listId ?? "");
  const [dismissedAt, setDismissedAt] = useState(0);

  // The last check (A-4), shown while its product is in the cart, and once:
  // closed (its timer, Deshacer, something newer in its place) or out of the
  // cart after it was there (unchecked here or by another member, deleted,
  // emptied), it does not come back, not even with the product. Checks from
  // before this bar mounted (back from another page) are old news.
  const queryClient = useQueryClient();
  const lastCheck = useLastCheck(userId ?? "", listId ?? "");
  const [checksClosedAt, setChecksClosedAt] = useState(() =>
    lastCheckAt(queryClient, userId ?? "", listId ?? ""),
  );
  const checkedId =
    lastCheck?.undo?.kind === "check" ? lastCheck.undo.id : null;
  const checkInCart =
    checkedId !== null &&
    (items.data?.some(
      (item) =>
        item.id === checkedId && item.checked && item.deleted_at == null,
    ) ??
      false);
  // Adjusted during render: the check that was seen in the cart, until it
  // leaves it (the optimistic check lands a moment after the tap, so "not in
  // the cart yet" is not "out of it").
  const [checkSeen, setCheckSeen] = useState<string | null>(null);
  if (lastCheck && checkInCart && checkSeen !== lastCheck.key) {
    setCheckSeen(lastCheck.key);
  }
  if (lastCheck && !checkInCart && checkSeen === lastCheck.key) {
    setCheckSeen(null);
    setChecksClosedAt((current) => Math.max(current, lastCheck.at));
  }
  const checkNotice =
    lastCheck && checkInCart && lastCheck.at > checksClosedAt
      ? lastCheck
      : null;

  // What an add of several put on the list: "Lo de siempre" or a paste, from
  // this bar's review sheet, or a past trip, from the menu's (F-4). They
  // share it through add-several.ts. Adds from before this bar mounted (back
  // from another page) are old news.
  const severalAdded = useAddedNotice();
  const [addsSeenAt] = useState(() => lastAddedAt(queryClient));
  const addedNotice: Notice | null =
    severalAdded && severalAdded.at > addsSeenAt
      ? {
          key: severalAdded.key,
          at: severalAdded.at,
          title: texts.addItem.usuals.added(severalAdded.ids.length),
          undo: { kind: "add", ids: severalAdded.ids },
        }
      : null;

  // The pending list was copied from the header of Pendientes (F-3): the
  // button is up there, the place for news is here. Once, like the check;
  // copies from before this bar mounted are old news.
  const lastCopy = useLastCopy();
  const [copiesClosedAt, setCopiesClosedAt] = useState(() =>
    lastCopyAt(queryClient),
  );
  const copyNotice: Notice | null =
    lastCopy && lastCopy.at > copiesClosedAt
      ? {
          key: lastCopy.key,
          at: lastCopy.at,
          title: texts.sendPending.copied,
          body: texts.sendPending.copiedBody,
          copied: true,
        }
      : null;

  // Los rechazos van después: si empatan con el aviso de lo agregado, gana
  // el rechazo.
  const written = latestNotice(
    [addedNotice, addFailure, ...writeFailures, ...routeFailures],
    dismissedAt,
  );
  // Three notices stand outside the order of the queue's writes: "ya está en
  // la lista" (A-2), the last check (A-4) and the copy of what is pending
  // (F-3). A rejection outranks them (it is news, and must not hide behind a
  // check made after it), and closing them closes nothing else: the
  // rejection of something sent before them is still to be shown. Against
  // "Lo de siempre" and each other, the newest.
  const shownOf = (aside: Notice | null) =>
    aside && (!written || (written.undo !== undefined && written.at < aside.at))
      ? aside
      : written;
  const notice = shownOf(
    latestNotice([duplicateNotice, checkNotice, copyNotice], 0),
  );

  function dismiss(at: number) {
    setDismissedAt((current) => Math.max(current, at));
  }

  /**
   * Cierra el aviso que se ve; el de "ya está", el del marcado y el de lo
   * copiado, solos.
   */
  function close(shown: Notice) {
    if (shown.duplicate) {
      setDuplicateNotice((current) =>
        current?.key === shown.key ? null : current,
      );
    } else if (shown.undo?.kind === "check") {
      setChecksClosedAt((current) => Math.max(current, shown.at));
    } else if (shown.copied) {
      setCopiesClosedAt((current) => Math.max(current, shown.at));
    } else {
      dismiss(shown.at);
    }
  }
  // A copy takes the place of the info notice it covers, as a notice of the
  // bar's own does (close(notice) when it adds): once it closes, that one
  // does not come back. Once per copy, adjusted during render. A rejection
  // is never covered: it outranks the copy.
  const [copyTook, setCopyTook] = useState<string | null>(null);
  if (copyNotice && notice === copyNotice && copyTook !== copyNotice.key) {
    setCopyTook(copyNotice.key);
    const covered = shownOf(latestNotice([duplicateNotice, checkNotice], 0));
    if (covered) close(covered);
  }
  // So does an add of several: this bar's own close the notice they cover
  // when they add (addSeveral), but a past trip's comes from the menu (F-4),
  // which cannot. Once per add, adjusted during render.
  const [addedTook, setAddedTook] = useState<string | null>(null);
  if (addedNotice && notice === addedNotice && addedTook !== addedNotice.key) {
    setAddedTook(addedNotice.key);
    const covered = latestNotice([duplicateNotice, checkNotice, copyNotice], 0);
    if (covered && covered.at < addedNotice.at) close(covered);
  }

  const noticeAt = notice?.at ?? null;
  const noticeKey = notice?.key ?? null;
  const noticeKind = notice?.duplicate
    ? "duplicate"
    : notice?.undo?.kind === "check"
      ? "check"
      : notice?.copied
        ? "copied"
        : "written";
  useEffect(() => {
    if (noticeAt === null) return;
    const timer = setTimeout(() => {
      if (noticeKind === "duplicate") {
        setDuplicateNotice((current) =>
          current?.key === noticeKey ? null : current,
        );
      } else if (noticeKind === "check") {
        setChecksClosedAt((current) => Math.max(current, noticeAt));
      } else if (noticeKind === "copied") {
        setCopiesClosedAt((current) => Math.max(current, noticeAt));
      } else {
        dismiss(noticeAt);
      }
    }, NOTICE_MS);
    return () => clearTimeout(timer);
  }, [noticeAt, noticeKey, noticeKind]);

  // Lo que se propone sale del catálogo, sin lo que ya está pendiente: eso
  // se ofrece aparte, como lo que ya está en la lista.
  const entries = ready ? (catalog.data ?? NO_ENTRIES) : NO_ENTRIES;
  const pendingItems = useMemo(
    () =>
      ready
        ? (items.data ?? []).filter(
            (item) => item.deleted_at == null && !item.checked,
          )
        : [],
    [ready, items.data],
  );
  const pendingNames = useMemo(
    () => new Set(pendingItems.map((item) => item.name_normalized)),
    [pendingItems],
  );
  const parsed = useMemo(() => parseItemInput(query), [query]);
  // Lo pendiente que coincide va primero: es lo que más importa saber antes
  // de agregar algo que ya está. El catálogo completa hasta el límite.
  const inList = useMemo(
    () => pendingMatchesFor(parsed.name, pendingItems),
    [parsed.name, pendingItems],
  );
  const suggestions = useMemo(
    () =>
      suggestionsFor(
        parsed.name,
        entries,
        pendingNames,
        SUGGESTION_LIMIT - inList.length,
      ),
    [parsed.name, entries, pendingNames, inList.length],
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
  // The review sheet, of the usuals or of a paste.
  const [review, setReview] = useState<Review | null>(null);
  // The review on screen, kept for when its sheet is gone (the state is
  // cleared as it starts to close).
  const shownReview = useRef<Review | null>(null);
  // Whether the focus goes back to the field when the review closes: only if
  // it was there (or on the pill, from a keyboard) when it opened. A touch on
  // the pill leaves the focus where it was, and a closed phone keyboard must
  // not pop up after adding.
  const reviewRefocus = useRef(false);
  // The notice of what the review added waits for the sheet to be gone:
  // while it closes, Radix hides the rest of the page from screen readers,
  // and the status region would change unheard.
  const reviewAdded = useRef<SeveralAdded | null>(null);
  // The review was answered ("Agregar"): a second tap on the sheet while it
  // leaves (it stays on screen for its exit) is not a second add, and a
  // one-line paste is not put back in the field.
  const reviewAnswered = useRef(false);
  // "Lo de siempre" in route order, each with the quantity it comes back with.
  const usualProducts = useMemo<ReviewProduct[]>(
    () =>
      inRouteOrder(usuals, categories.data ?? []).map((entry) => {
        const amount = rememberedAmount(entry);
        return {
          key: entry.name_normalized,
          name: entry.display_name,
          category: kindOf(categories.data, entry.last_category_id),
          amount: formatQuantity(amount.quantity, amount.unit),
        };
      }),
    [usuals, categories.data],
  );

  // A paste, as pasted, each with the category it would land in; what is
  // already pending is shown as such and not added again (A-2).
  const pastedProducts = useMemo<ReviewProduct[]>(
    () =>
      review?.kind !== "paste"
        ? []
        : review.pasted.map(({ key, parsed }) => ({
            key,
            name: parsed.name,
            category: kindOf(
              categories.data,
              suggestCategory(
                parsed.name,
                catalog.data ?? [],
                categories.data ?? [],
              ),
            ),
            amount: formatQuantity(parsed.quantity, parsed.unit),
            inList: findPending(parsed.name, pendingItems) !== undefined,
          })),
    [review, categories.data, catalog.data, pendingItems],
  );

  // La mejor opción queda pegada al campo: arriba, las demás.
  const options = useMemo<Suggestion[]>(() => {
    const pendingOptions = inList.map((item): Suggestion => ({
      key: item.name_normalized,
      name: item.name,
      category: kindOf(categories.data, item.category_id),
      price: null,
      inList: texts.addItem.duplicate.inList(
        formatQuantity(item.quantity, item.unit),
      ),
    }));
    const catalogOptions = suggestions.map((entry): Suggestion => {
      // The price the add would bring, in the unit typed: none when the
      // remembered one is in another basis (a price per kilo for a bare
      // "tom"), rather than a price the row would not show.
      const price = rememberedPrice(
        entry.name_normalized,
        [entry],
        parsed.unit,
      );
      return {
        key: entry.name_normalized,
        name: entry.display_name,
        category: kindOf(categories.data, entry.last_category_id),
        price: price && formatMoney(price.price, price.currency),
      };
    });
    return [...pendingOptions, ...catalogOptions].reverse();
  }, [inList, suggestions, categories.data, parsed.unit]);
  const open = options.length > 0 && !away && closedFor !== query;
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
    if (notice) close(notice);
    const item = newItem(name, {
      ...details,
      categoryId: suggestCategory(
        name,
        catalog.data ?? [],
        categories.data ?? [],
      ),
      price: rememberedPrice(name, catalog.data ?? [], details.unit),
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
        title: texts.itemErrors.add(item.name),
        body: restored
          ? texts.itemErrors.addRestored
          : texts.itemErrors.addLost,
      });
    });
  }

  /**
   * Lo escrito ya está pendiente (docs/improvements.md, A-2): no se agrega
   * otra fila. El aviso lo dice y, si las cantidades se suman, ofrece sumar
   * lo escrito (o uno, sin cantidad).
   */
  function remindPending(item: Item, added: Amount) {
    if (notice) close(notice);
    const quantity = formatQuantity(item.quantity, item.unit);
    const count = added.quantity ?? 1;
    const amount =
      formatQuantity(count, unitForQuantity(added.unit, count)) ?? "";
    const at = Date.now();
    setDuplicateNotice({
      key: `duplicate:${item.id}:${at}`,
      at,
      title: texts.addItem.duplicate.title(item.name),
      body: quantity && texts.addItem.duplicate.quantity(quantity),
      duplicate: {
        name: item.name,
        added,
        add: addedQuantity(item, added)
          ? {
              label: texts.addItem.duplicate.add(amount),
              aria: texts.addItem.duplicate.addAria(amount, item.name),
            }
          : undefined,
      },
    });
  }

  /**
   * "Sumar": lo escrito va al pendiente de ese producto, el que esté ahora
   * (otro miembro pudo cambiarlo). Si ya no hay ninguno (se marcó o se
   * borró mientras tanto), se agrega como nuevo.
   */
  function addToPending(
    shown: Notice & { duplicate: NonNullable<Notice["duplicate"]> },
    event: MouseEvent<HTMLButtonElement>,
  ) {
    if (isDoubleTap(event)) return;
    if (document.activeElement === event.currentTarget) {
      inputRef.current?.focus();
    }
    close(shown);
    const { name, added } = shown.duplicate;
    const current = findPending(name, pendingItems);
    if (!current) {
      addNamed(name, added, "");
      return;
    }
    const merged = addedQuantity(current, added);
    if (!merged) return;
    const changes: EditItem["changes"] = { quantity: merged.quantity };
    if (merged.unit !== current.unit) changes.unit = merged.unit;
    edit.mutate({ id: current.id, name: current.name, changes });
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
    const existing = findPending(typed.name, pendingItems);
    if (existing) {
      remindPending(existing, { quantity: typed.quantity, unit: typed.unit });
    } else {
      addNamed(typed.name, typed, raw);
    }
  }

  // El último toque que agregó algo desde la lista o la fila: un segundo
  // toque casi en el mismo lugar enseguida es un doble toque accidental, no
  // otro pedido (lo que quedó bajo el dedo puede ser otra opción u otra
  // píldora).
  const doubleTap = useDoubleTap();
  const isDoubleTap = doubleTap.isDoubleTap;

  /**
   * Una opción de la lista: el producto del catálogo con lo escrito, o lo
   * que ya está pendiente, que no se agrega de nuevo.
   */
  function pick(key: string, event?: MouseEvent<HTMLElement>) {
    // Enter on the active option comes with no event: no double tap there.
    if (event && isDoubleTap(event)) return;
    const pendingItem = inList.find((one) => one.name_normalized === key);
    const entry = suggestions.find((one) => one.name_normalized === key);
    const field = inputRef.current;
    if ((!pendingItem && !entry) || !field || !ready) return;
    field.focus();
    const raw = field.value;
    setFieldText("");
    const details = { quantity: parsed.quantity, unit: parsed.unit };
    if (pendingItem) remindPending(pendingItem, details);
    else if (entry) addNamed(entry.display_name, details, raw);
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
    // Con la cantidad con que se compra (A-3), y su precio en esa base.
    addNamed(entry.display_name, rememberedAmount(entry), "");
  }

  /** Opens the review sheet, remembering whether the focus comes back. */
  function openReview(next: Review, trigger: Element | null) {
    const active = document.activeElement;
    reviewRefocus.current =
      active === inputRef.current || (trigger !== null && active === trigger);
    shownReview.current = next;
    reviewAnswered.current = false;
    setReview(next);
  }

  /** "Lo de siempre": abre el repaso de lo habitual que no está pendiente. */
  function openUsuals(event: MouseEvent<HTMLButtonElement>) {
    if (isDoubleTap(event) || !ready || usualsCount === 0) return;
    openReview({ kind: "usuals" }, event.currentTarget);
  }

  /**
   * Una lista pegada en el campo (F-2): varias líneas, o una con comas, se
   * repasan antes de agregarlas. Un solo producto se pega como siempre.
   */
  function handlePaste(event: ClipboardEvent<HTMLInputElement>) {
    if (!ready) return;
    const text = event.clipboardData.getData("text");
    const list = pastedList(text);
    if (!list) return;
    event.preventDefault();
    const { products, oneLine } = list;
    const field = event.currentTarget;
    openReview(
      {
        kind: "paste",
        pasted: products.slice(0, PASTE_LIMIT).map((product) => {
          const parsed = parseItemInput(product);
          return { key: normalizeName(parsed.name), parsed };
        }),
        cut: products.length > PASTE_LIMIT,
        fallback: oneLine
          ? {
              text,
              start: field.selectionStart ?? field.value.length,
              end: field.selectionEnd ?? field.value.length,
            }
          : null,
      },
      null,
    );
  }

  /**
   * La hoja ya se fue: el foco vuelve si estaba en la barra, y el aviso sale.
   * Una lista de una línea que se cerró sin agregar queda en el campo.
   */
  function afterReviewClose(event: Event) {
    // The pill that opened it may be gone (what it offered is pending now):
    // never back to it.
    event.preventDefault();
    const closed = shownReview.current;
    shownReview.current = null;
    if (reviewRefocus.current) {
      inputRef.current?.focus({ preventScroll: true });
    }
    const added = reviewAdded.current;
    reviewAdded.current = null;
    if (added) {
      showAdded(queryClient, added);
    } else if (
      closed?.kind === "paste" &&
      closed.fallback &&
      !reviewAnswered.current
    ) {
      const field = inputRef.current;
      if (!field) return;
      const { start, end } = closed.fallback;
      // As a plain paste: no more than the field takes.
      const room = MAX_NAME_LENGTH - (field.value.length - (end - start));
      const text = closed.fallback.text.slice(0, Math.max(0, room));
      setFieldText(field.value.slice(0, start) + text + field.value.slice(end));
      field.setSelectionRange(start + text.length, start + text.length);
    }
  }

  /** Lo tildado en el repaso, según de dónde venga. */
  function addReviewed(keys: readonly string[]) {
    if (reviewAnswered.current) return;
    reviewAnswered.current = true;
    const current = review;
    setReview(null);
    if (!ready || !current) return;
    addSeveral(
      current.kind === "usuals" ? usualItems(keys) : pastedItems(current, keys),
    );
  }

  /**
   * Lo de siempre tildado, en el orden de la hoja (el del recorrido): cada
   * producto con la cantidad con que vuelve, su categoría y su precio en esa
   * base. Lo que entretanto pasó a estar pendiente (lo agregó otro miembro)
   * ya no está entre los habituales y no se agrega dos veces.
   */
  function usualItems(keys: readonly string[]): NewItem[] {
    const byKey = new Map(
      usuals.map((entry) => [entry.name_normalized, entry]),
    );
    return keys
      .flatMap((key) => byKey.get(key) ?? [])
      .map((entry) => {
        const amount = rememberedAmount(entry);
        return newItem(entry.display_name, {
          ...amount,
          categoryId: suggestCategory(
            entry.display_name,
            catalog.data ?? [],
            categories.data ?? [],
          ),
          price: rememberedPrice(
            entry.display_name,
            catalog.data ?? [],
            amount.unit,
          ),
        });
      });
  }

  /**
   * Lo pegado y tildado, en el orden en que se pegó, como si se hubiera
   * escrito cada uno: su cantidad, la categoría y el precio del catálogo.
   * Nunca lo que ya está pendiente (A-2).
   */
  function pastedItems(
    current: Extract<Review, { kind: "paste" }>,
    keys: readonly string[],
  ): NewItem[] {
    const chosen = new Set(keys);
    return current.pasted
      .filter(({ key }) => chosen.has(key))
      .filter(({ parsed }) => !findPending(parsed.name, pendingItems))
      .map(({ parsed }) =>
        newItem(parsed.name, {
          quantity: parsed.quantity,
          unit: parsed.unit,
          categoryId: suggestCategory(
            parsed.name,
            catalog.data ?? [],
            categories.data ?? [],
          ),
          price: rememberedPrice(parsed.name, catalog.data ?? [], parsed.unit),
        }),
      );
  }

  /**
   * Several at once, in one write (add-several.ts), with "Deshacer" once the
   * sheet is gone.
   */
  function addSeveral(created: NewItem[]) {
    if (created.length === 0) return;
    if (notice) close(notice);
    // Shown once the sheet is gone (afterReviewClose). If the server rejects
    // the add, its notice outranks this one (see showAdded).
    reviewAdded.current = addMany(created);
  }

  /** "Deshacer": lo agregado de una vez sale; lo marcado vuelve a pendientes. */
  function undo(
    shown: Notice & { undo: Undo },
    event: MouseEvent<HTMLButtonElement>,
  ) {
    if (document.activeElement === event.currentTarget) {
      inputRef.current?.focus();
    }
    if (shown.undo.kind === "add") {
      const variables: UndoAdd = {
        ids: shown.undo.ids,
        deletedAt: new Date().toISOString(),
      };
      undoAdd.mutate(variables);
    } else {
      toggle.mutate({
        id: shown.undo.id,
        name: shown.undo.name,
        checked: false,
      });
    }
    close(shown);
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
    if ((key === "ArrowUp" || key === "ArrowDown") && options.length > 0) {
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
    notice?.undo !== undefined ? (notice as Notice & { undo: Undo }) : null;
  const duplicateShown =
    notice?.duplicate !== undefined
      ? (notice as Notice & { duplicate: NonNullable<Notice["duplicate"]> })
      : null;
  const copiedShown = notice?.copied ? notice : null;
  // Los avisos info los lee la región de abajo; los de error se anuncian
  // solos (role="alert").
  // A check is already said by its checkbox, which keeps the focus.
  const infoNotice =
    (undoNotice?.undo.kind === "add" ? undoNotice : null) ??
    duplicateShown ??
    copiedShown;

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
                aria-label={
                  undoNotice.undo.kind === "check"
                    ? undoNotice.undo.label
                    : undefined
                }
                onPointerDown={keepFocus}
                onMouseDown={keepFocus}
                onClick={(event) => undo(undoNotice, event)}
              >
                {texts.addItem.usuals.undo}
              </Button>
            }
          />
        ) : duplicateShown ? (
          <Banner
            tone="info"
            title={duplicateShown.title}
            body={duplicateShown.body}
            liveRegion={false}
            action={
              duplicateShown.duplicate.add ? (
                <Button
                  type="button"
                  variant="outline"
                  aria-label={duplicateShown.duplicate.add.aria}
                  onPointerDown={keepFocus}
                  onMouseDown={keepFocus}
                  onClick={(event) => addToPending(duplicateShown, event)}
                >
                  {duplicateShown.duplicate.add.label}
                </Button>
              ) : (
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-touch"
                  aria-label={texts.itemErrors.dismiss}
                  onPointerDown={keepFocus}
                  onMouseDown={keepFocus}
                  onClick={() => close(duplicateShown)}
                >
                  <XIcon aria-hidden strokeWidth={1.5} />
                </Button>
              )
            }
          />
        ) : copiedShown ? (
          <Banner
            tone="info"
            title={copiedShown.title}
            body={copiedShown.body}
            liveRegion={false}
            action={
              <Button
                type="button"
                variant="ghost"
                size="icon-touch"
                aria-label={texts.itemErrors.dismiss}
                onPointerDown={keepFocus}
                onMouseDown={keepFocus}
                onClick={() => close(copiedShown)}
              >
                <XIcon aria-hidden strokeWidth={1.5} />
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
        {/* Keyed by the notice: the same sentence twice is read twice. */}
        {infoNotice ? (
          <span key={infoNotice.key}>
            {infoNotice.title}
            {infoNotice.body ? ` ${infoNotice.body}` : null}
          </span>
        ) : null}
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
            onUsuals={openUsuals}
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
          // Only while the list is there to point to.
          aria-controls={open ? LISTBOX_ID : undefined}
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
            doubleTap.reset();
          }}
          onKeyDown={handleKeyDown}
          onPaste={handlePaste}
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
      <ReviewSheet
        open={review !== null}
        onOpenChange={(open) => {
          if (!open) setReview(null);
        }}
        title={
          review?.kind === "paste"
            ? texts.addItem.paste.title
            : texts.addItem.usuals.title
        }
        description={
          review?.kind === "paste"
            ? texts.addItem.paste.description
            : texts.addItem.usuals.description
        }
        listLabel={
          review?.kind === "paste"
            ? texts.addItem.paste.listLabel
            : texts.addItem.usuals.listLabel
        }
        note={
          review?.kind === "paste" && review.cut
            ? texts.addItem.paste.limit(PASTE_LIMIT)
            : undefined
        }
        products={review?.kind === "paste" ? pastedProducts : usualProducts}
        onAdd={addReviewed}
        onCloseAutoFocus={afterReviewClose}
      />
    </div>
  );
}
