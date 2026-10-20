import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ListRow } from "./list-row";

function row(props: Partial<Parameters<typeof ListRow>[0]> = {}) {
  render(
    <ul>
      <ListRow name="Tomates" checked={false} {...props} />
    </ul>,
  );
  return screen.getByRole("listitem");
}

describe("ListRow figures", () => {
  it("shows the line total in mono under the quantity", () => {
    const listItem = row({ quantity: "2 kg", total: "$ 178" });
    const figures = listItem.querySelector('[data-slot="list-row-figures"]');
    expect(figures).toHaveClass("font-mono", "text-label", "text-ink-2");
    expect(
      Array.from(figures!.children).map((child) => child.textContent),
    ).toEqual(["2 kg", "$ 178"]);
  });

  it("shows the total alone when there is no quantity", () => {
    const listItem = row({ total: "US$ 12" });
    expect(within(listItem).getByText("US$ 12")).toHaveAttribute(
      "data-slot",
      "list-row-total",
    );
    expect(listItem.querySelectorAll("[data-numeric]")).toHaveLength(1);
  });

  it("shows only the quantity without a total", () => {
    const listItem = row({ quantity: "2 kg" });
    expect(listItem.querySelector('[data-slot="list-row-total"]')).toBeNull();
    expect(within(listItem).getByText("2 kg")).toBeInTheDocument();
  });

  it("shows no figures at all with neither", () => {
    const listItem = row();
    expect(listItem.querySelector('[data-slot="list-row-figures"]')).toBeNull();
  });

  it("keeps the name a truncating column and the figures from shrinking", () => {
    const listItem = row({
      name: "Un nombre larguísimo de producto que no entra",
      quantity: "2 kg",
      total: "$ 178",
      onPress: () => {},
    });
    expect(listItem.querySelector('[data-slot="list-row-name"]')).toHaveClass(
      "min-w-0",
      "flex-1",
    );
    expect(
      listItem.querySelector('[data-slot="list-row-figures"]'),
    ).toHaveClass("shrink-0");
    // The check target stays the 44px one.
    expect(screen.getByRole("checkbox")).toHaveClass("size-touch", "shrink-0");
  });
});
