import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Item } from "@/lib/queries";
import { texts } from "@/lib/texts";
import { EditItemSheet } from "./edit-item-sheet";

const t = texts.editItem;

function makeItem(partial: Partial<Item> = {}): Item {
  return {
    id: "milk",
    list_id: "list",
    name: "Leche",
    name_normalized: "leche",
    quantity: 1.5,
    unit: "L",
    note: "La de vidrio",
    category_id: null,
    estimated_price: null,
    currency: "UYU",
    checked: false,
    checked_at: null,
    position: 0,
    created_by: "user",
    created_at: "2026-10-18T00:00:00.000Z",
    updated_at: "2026-10-18T00:00:00.000Z",
    deleted_at: null,
    ...partial,
  };
}

function renderSheet(item: Item | undefined = makeItem()) {
  const props = { onSave: vi.fn(), onRemove: vi.fn(), onClose: vi.fn() };
  const view = render(<EditItemSheet item={item} {...props} />);
  return { ...props, ...view };
}

function input(label: string) {
  return screen.getByLabelText(label) as HTMLInputElement;
}

function change(label: string, value: string) {
  fireEvent.change(input(label), { target: { value } });
}

function save() {
  fireEvent.click(screen.getByRole("button", { name: t.save }));
}

afterEach(() => {
  vi.useRealTimers();
});

describe("EditItemSheet", () => {
  it("prefills the fields, with a comma decimal", () => {
    renderSheet();
    expect(screen.getByRole("dialog")).toHaveAccessibleName(t.title);
    expect(input(t.name).value).toBe("Leche");
    expect(input(t.quantity).value).toBe("1,5");
    expect(input(t.unit).value).toBe("L");
    expect(input(t.note).value).toBe("La de vidrio");
  });

  it("sends only the fields that changed", () => {
    const { onSave, onClose } = renderSheet();
    change(t.note, "  La de cartón ");
    save();
    expect(onSave).toHaveBeenCalledWith(
      expect.objectContaining({ id: "milk" }),
      {
        note: "La de cartón",
      },
    );
    expect(onClose).toHaveBeenCalled();
  });

  it("saves nothing when the edit only adds spaces", () => {
    const { onSave, onClose } = renderSheet();
    change(t.name, "  Leche  ");
    save();
    expect(onSave).not.toHaveBeenCalled();
    expect(onClose).toHaveBeenCalled();
  });

  it("clears quantity, unit and note to null, and stores the canonical unit", () => {
    const { onSave } = renderSheet();
    change(t.quantity, "");
    change(t.note, " ");
    save();
    expect(onSave).toHaveBeenLastCalledWith(expect.anything(), {
      quantity: null,
      note: null,
    });

    const { onSave: onSaveUnit } = renderSheet(makeItem({ id: "rice" }));
    fireEvent.change(screen.getAllByLabelText(t.unit).at(-1)!, {
      target: { value: "Kilos" },
    });
    fireEvent.click(screen.getAllByRole("button", { name: t.save }).at(-1)!);
    expect(onSaveUnit).toHaveBeenCalledWith(expect.anything(), { unit: "kg" });
  });

  it("shows the errors and keeps the sheet open", () => {
    const { onSave, onClose } = renderSheet();
    change(t.name, " ");
    change(t.quantity, "100000");
    save();
    expect(screen.getByText(t.errors.name)).toBeInTheDocument();
    expect(screen.getByText(t.errors.quantity)).toBeInTheDocument();
    expect(input(t.name)).toHaveFocus();
    expect(onSave).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
  });

  it("deletes on the second tap, ignoring an accidental double tap", () => {
    vi.useFakeTimers();
    const { onRemove, onClose } = renderSheet();
    const remove = () => screen.getByRole("button", { name: /Borrar|borrar/ });

    fireEvent.click(remove());
    expect(remove()).toHaveTextContent(t.confirmRemove);
    fireEvent.click(remove());
    expect(onRemove).not.toHaveBeenCalled();

    act(() => vi.advanceTimersByTime(400));
    fireEvent.click(remove());
    expect(onRemove).toHaveBeenCalledWith(
      expect.objectContaining({ id: "milk" }),
    );
    expect(onClose).toHaveBeenCalled();
  });

  it("drops the confirmation after a few seconds", () => {
    vi.useFakeTimers();
    renderSheet();
    const remove = () => screen.getByRole("button", { name: /Borrar|borrar/ });
    fireEvent.click(remove());
    act(() => vi.advanceTimersByTime(4100));
    expect(remove()).toHaveTextContent(t.remove);
  });

  it("starts a fresh form when another item opens", () => {
    const props = { onSave: vi.fn(), onRemove: vi.fn(), onClose: vi.fn() };
    const { rerender } = render(<EditItemSheet item={makeItem()} {...props} />);
    change(t.note, "Cambiada");
    rerender(
      <EditItemSheet
        item={makeItem({ id: "bread", name: "Pan", note: null })}
        {...props}
      />,
    );
    expect(input(t.name).value).toBe("Pan");
    expect(input(t.note).value).toBe("");
  });

  it("is closed without an item", () => {
    // Not renderSheet(undefined): undefined would take its default item.
    render(
      <EditItemSheet
        item={undefined}
        onSave={vi.fn()}
        onRemove={vi.fn()}
        onClose={vi.fn()}
      />,
    );
    expect(screen.queryByRole("dialog")).toBeNull();
  });
});
