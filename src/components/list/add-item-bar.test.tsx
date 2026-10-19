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
const items = makeTable({
  read: async () => ({ data: [], error: null }),
  write,
});

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

async function renderBar() {
  const queryClient = makeTestQueryClient();
  // The user's list is already known, as after ListView loaded it.
  queryClient.setQueryData(queryKeys.lists(USER), [
    { id: LIST, name: "Mi lista" },
  ]);
  render(<AddItemBar />, { wrapper: makeWrapper(queryClient) });
  const field = screen.getByRole<HTMLInputElement>("textbox", {
    name: texts.addItem.label,
  });
  const submit = screen.getByRole("button", { name: texts.addItem.submit });
  field.focus();
  return { field, submit };
}

beforeEach(() => {
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
});
