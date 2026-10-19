import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  makeTable,
  makeTestQueryClient,
  makeWrapper,
} from "@/lib/queries/test-utils";
import { queryKeys } from "@/lib/queries/keys";
import { texts } from "@/lib/texts";
import { AddItemBar } from "./add-item-bar";

const USER = "00000000-0000-7000-8000-000000000001";
const LIST = "00000000-0000-7000-8000-000000000002";

type Result = { data: unknown; error: unknown };

const write = vi.fn<(row: unknown) => Promise<Result>>();
const lists = makeTable({
  read: async () => ({ data: [{ id: LIST, name: "Mi lista" }], error: null }),
  write: async () => ({ data: null, error: null }),
});
const readItems = vi.fn<() => Promise<Result>>();
const items = makeTable({ read: readItems, write });

vi.mock("@/lib/supabase/client", () => ({
  createClient: () => ({
    from: (table: string) =>
      table === "lists" ? lists.builder() : items.builder(),
  }),
}));

vi.mock("@/components/session-provider", () => ({
  useSession: () => ({ status: "ready", user: { id: USER } }),
}));

const rejection = {
  data: null,
  error: { message: "new row violates row-level security", code: "42501" },
};

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((res) => {
    resolve = res;
  });
  return { promise, resolve };
}

/** Types into the uncontrolled field and, with Enter, submits the form. */
function type(field: HTMLInputElement, text: string) {
  const enter = text.endsWith("{Enter}");
  fireEvent.change(field, {
    target: { value: field.value + text.replace("{Enter}", "") },
  });
  if (enter) fireEvent.submit(field.form!);
}

async function renderBar({ itemsLoaded = true } = {}) {
  const queryClient = makeTestQueryClient();
  // The user's list and its items are already known, as after ListView
  // loaded them.
  queryClient.setQueryData(queryKeys.lists(USER), [
    { id: LIST, name: "Mi lista" },
  ]);
  if (itemsLoaded) queryClient.setQueryData(queryKeys.items(USER, LIST), []);
  render(<AddItemBar />, { wrapper: makeWrapper(queryClient) });
  const field = screen.getByRole<HTMLInputElement>("textbox", {
    name: texts.addItem.label,
  });
  const submit = screen.getByRole("button", { name: texts.addItem.submit });
  field.focus();
  return { field, submit, queryClient };
}

beforeEach(() => {
  readItems.mockReset();
  readItems.mockResolvedValue({ data: [], error: null });
  write.mockReset();
  items.insert.mockClear();
});

describe("AddItemBar", () => {
  it("adds the parsed item, empties the field and keeps the focus", async () => {
    write.mockReturnValue(new Promise(() => {}));
    const { field, submit } = await renderBar();

    type(field, "2 kg de tomates");
    fireEvent.click(submit);

    await waitFor(() =>
      expect(items.insert).toHaveBeenCalledWith(
        expect.objectContaining({
          list_id: LIST,
          name: "tomates",
          quantity: 2,
          unit: "kg",
        }),
      ),
    );
    expect(field.value).toBe("");
    expect(field).toHaveFocus();
  });

  it("adds with Enter, one product after another", async () => {
    write.mockReturnValue(new Promise(() => {}));
    const { field } = await renderBar();

    type(field, "Leche{Enter}");
    type(field, "Pan{Enter}");

    await waitFor(() => expect(items.insert).toHaveBeenCalledTimes(1));
    expect(field.value).toBe("");
    expect(field).toHaveFocus();
  });

  it("does nothing with an empty name", async () => {
    const { field, submit } = await renderBar();

    type(field, "   ");
    fireEvent.click(submit);

    expect(items.insert).not.toHaveBeenCalled();
    expect(field).toHaveFocus();
  });

  it("puts the text back and shows a notice when the server rejects", async () => {
    write.mockResolvedValue(rejection);
    const { field } = await renderBar();

    type(field, "Tomates x3{Enter}");

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent(texts.itemErrors.add("Tomates"));
    expect(alert).toHaveTextContent(texts.itemErrors.addRestored);
    expect(field.value).toBe("Tomates x3");
    expect(field).toHaveFocus();
  });

  it("does not overwrite what the user typed meanwhile", async () => {
    const pending = deferred<Result>();
    write.mockReturnValue(pending.promise);
    const { field } = await renderBar();

    type(field, "Tomates{Enter}");
    type(field, "Arroz");
    await act(async () => pending.resolve(rejection));

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent(texts.itemErrors.addLost);
    expect(field.value).toBe("Arroz");
  });

  it("closes the notice", async () => {
    write.mockResolvedValue(rejection);
    const { field } = await renderBar();

    type(field, "Tomates{Enter}");
    await screen.findByRole("alert");
    fireEvent.click(
      screen.getByRole("button", { name: texts.itemErrors.dismiss }),
    );

    await waitFor(() => expect(screen.queryByRole("alert")).toBeNull());
  });

  it("keeps the focus on the field when the + button is pressed", async () => {
    const { submit } = await renderBar();
    // false: the default (moving the focus to the button) was prevented.
    expect(fireEvent.mouseDown(submit)).toBe(false);
  });

  it("waits for the items before adding, keeping the text", async () => {
    // The items query never answers here.
    readItems.mockReturnValue(new Promise(() => {}));
    const { field } = await renderBar({ itemsLoaded: false });
    type(field, "Tomates{Enter}");
    expect(items.insert).not.toHaveBeenCalled();
    expect(field.value).toBe("Tomates");
  });

  it("shows a rejected check", async () => {
    const { queryClient } = await renderBar();
    const mutation = queryClient.getMutationCache().build(queryClient, {
      mutationKey: [...queryKeys.items(USER, LIST), "toggle"],
      mutationFn: (): Promise<unknown> => Promise.reject(new Error("denied")),
    });
    await act(async () => {
      await mutation
        .execute({ id: "milk", name: "Leche", checked: true })
        .catch(() => {});
    });

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent(texts.itemErrors.check("Leche"));
    expect(alert).toHaveTextContent(texts.itemErrors.toggleBody);
  });

  it("does not bring back a dismissed notice", async () => {
    write.mockResolvedValue(rejection);
    const { field, queryClient } = await renderBar();

    type(field, "Tomates{Enter}");
    await screen.findByRole("alert");
    fireEvent.click(
      screen.getByRole("button", { name: texts.itemErrors.dismiss }),
    );
    await waitFor(() => expect(screen.queryByRole("alert")).toBeNull());

    // A later failure shows, and once it is gone the old one stays gone.
    const mutation = queryClient.getMutationCache().build(queryClient, {
      mutationKey: [...queryKeys.items(USER, LIST), "toggle"],
      mutationFn: (): Promise<unknown> => Promise.reject(new Error("denied")),
    });
    await act(async () => {
      await mutation
        .execute({ id: "milk", name: "Leche", checked: false })
        .catch(() => {});
    });
    await screen.findByRole("alert");
    fireEvent.click(
      screen.getByRole("button", { name: texts.itemErrors.dismiss }),
    );
    act(() => queryClient.getMutationCache().remove(mutation));
    await waitFor(() => expect(screen.queryByRole("alert")).toBeNull());
  });
});
