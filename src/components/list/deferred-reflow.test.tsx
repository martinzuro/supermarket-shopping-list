import { act, fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  REFLOW_IDLE_MS,
  TAP_SLOP_PX,
  placeRows,
  placesOf,
  useDeferredReflow,
  type Place,
} from "./deferred-reflow";

type Row = { id: string; checked: boolean; position: number };

const rows = (...specs: [string, boolean][]): Row[] =>
  specs.map(([id, checked], position) => ({ id, checked, position }));

describe("placeRows", () => {
  it("puts each row where its data says, in list order", () => {
    const items = rows(["c", true], ["a", false], ["b", false]).reverse();
    const { pending, cart } = placeRows(items, new Map());
    expect(pending.map((item) => item.id)).toEqual(["a", "b"]);
    expect(cart.map((item) => item.id)).toEqual(["c"]);
  });

  it("keeps a held row in the section it was shown in, checked or not", () => {
    const items = rows(["a", true], ["b", false], ["c", true], ["d", false]);
    const held = new Map<string, Place>([
      ["a", "pending"],
      ["b", "cart"],
    ]);
    const { pending, cart } = placeRows(items, held);
    expect(pending.map((item) => item.id)).toEqual(["a", "d"]);
    expect(cart.map((item) => item.id)).toEqual(["b", "c"]);
  });

  it("freezes where every row is shown, the held ones where they are held", () => {
    const items = rows(["a", true], ["b", false], ["c", true]);
    const places = placesOf(items, new Map([["a", "pending"]]));
    expect([...places]).toEqual([
      ["a", "pending"],
      ["b", "pending"],
      ["c", "cart"],
    ]);
  });
});

/**
 * The write lands in the cache a moment after the tap (the optimistic
 * update awaits the cancelled reads), as in useToggleItem: an instant fake
 * would hide the render where the row is held but its data is not checked
 * yet.
 */
const WRITE_MS = 120;

/**
 * The list in small: two sections, a checkbox per row, the own checks
 * going through `hold` and the other members' changes (`remote`) straight
 * to the data.
 */
function Harness({ initial }: { initial: Row[] }) {
  const [items, setItems] = useState(initial);
  const { held, hold } = useDeferredReflow();
  const { pending, cart } = placeRows(items, held);

  function write(id: string, checked: boolean) {
    setItems((current) =>
      current.map((item) => (item.id === id ? { ...item, checked } : item)),
    );
  }

  function check(item: Row) {
    hold(placesOf(items, held));
    setTimeout(() => write(item.id, !item.checked), WRITE_MS);
  }

  const section = (name: string, list: Row[]) => (
    <ul aria-label={name}>
      {list.map((item) => (
        <li key={item.id} data-slot="list-row">
          <button
            type="button"
            role="checkbox"
            aria-checked={item.checked}
            aria-label={item.id}
            onClick={() => check(item)}
          />
        </li>
      ))}
    </ul>
  );

  return (
    <>
      {section("pending", pending)}
      {section("cart", cart)}
      <button type="button" onClick={() => write("c", true)}>
        remote
      </button>
      <input aria-label="add" />
    </>
  );
}

const inSection = (name: string) =>
  Array.from(
    screen.getByRole("list", { name }).querySelectorAll('[role="checkbox"]'),
    (box) => box.getAttribute("aria-label"),
  );

const tap = (id: string) =>
  fireEvent.click(screen.getByRole("checkbox", { name: id }));

const wait = (ms: number) => act(() => vi.advanceTimersByTime(ms));

describe("useDeferredReflow", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("keeps a burst of checks in place and moves them together after the idle wait", () => {
    render(
      <Harness
        initial={rows(["a", false], ["b", false], ["c", false], ["d", false])}
      />,
    );

    tap("a");
    wait(WRITE_MS);
    // Checked (the data moved), still where the finger left it.
    expect(screen.getByRole("checkbox", { name: "a" })).toBeChecked();
    expect(inSection("pending")).toEqual(["a", "b", "c", "d"]);

    // The next check comes before the wait is over, and restarts it.
    wait(REFLOW_IDLE_MS - WRITE_MS - 1);
    tap("b");
    wait(WRITE_MS);
    tap("c");
    wait(REFLOW_IDLE_MS - 1);
    expect(screen.getByRole("checkbox", { name: "c" })).toBeChecked();
    expect(inSection("pending")).toEqual(["a", "b", "c", "d"]);
    expect(inSection("cart")).toEqual([]);

    // The checks stop: the three go down at once.
    wait(1);
    expect(inSection("pending")).toEqual(["d"]);
    expect(inSection("cart")).toEqual(["a", "b", "c"]);
  });

  it("unchecks a held row in its place when it is tapped again", () => {
    render(<Harness initial={rows(["a", false], ["b", false])} />);

    tap("a");
    wait(500);
    tap("a");
    wait(WRITE_MS);
    expect(screen.getByRole("checkbox", { name: "a" })).not.toBeChecked();
    expect(inSection("pending")).toEqual(["a", "b"]);

    wait(REFLOW_IDLE_MS);
    expect(inSection("pending")).toEqual(["a", "b"]);
    expect(inSection("cart")).toEqual([]);
  });

  it("holds another member's change too, and does not restart the wait for it", () => {
    render(
      <Harness initial={rows(["a", false], ["b", false], ["c", false])} />,
    );

    tap("a");
    wait(1000);
    fireEvent.click(screen.getByRole("button", { name: "remote" }));
    // Checked by someone else during the burst: it waits with the rest.
    expect(screen.getByRole("checkbox", { name: "c" })).toBeChecked();
    expect(inSection("pending")).toEqual(["a", "b", "c"]);

    // The wait still counts from the own check.
    wait(REFLOW_IDLE_MS - 1000);
    expect(inSection("pending")).toEqual(["b"]);
    expect(inSection("cart")).toEqual(["a", "c"]);
  });

  it("moves another member's change at once when nothing is held", () => {
    render(<Harness initial={rows(["a", false], ["c", false])} />);

    fireEvent.click(screen.getByRole("button", { name: "remote" }));
    expect(inSection("cart")).toEqual(["c"]);
  });

  it("lets the rows go at once when the user scrolls, not when the page does", () => {
    render(<Harness initial={rows(["a", false], ["b", false])} />);

    tap("a");
    wait(WRITE_MS);
    // The add bar following the end of the page is not the user.
    fireEvent.scroll(window);
    // A finger that drifts a little is still a tap.
    fireEvent.touchStart(window, { touches: [{ clientX: 40, clientY: 200 }] });
    fireEvent.touchMove(window, {
      touches: [{ clientX: 40, clientY: 200 - TAP_SLOP_PX }],
    });
    expect(inSection("pending")).toEqual(["a", "b"]);

    fireEvent.touchMove(window, {
      touches: [{ clientX: 40, clientY: 200 - TAP_SLOP_PX - 1 }],
    });
    expect(inSection("pending")).toEqual(["b"]);
    expect(inSection("cart")).toEqual(["a"]);
  });

  it("lets the rows go with the wheel or a scroll key, not with Space", () => {
    render(
      <Harness initial={rows(["a", false], ["b", false], ["c", false])} />,
    );

    tap("a");
    wait(WRITE_MS);
    fireEvent.keyDown(window, { key: " " });
    expect(inSection("pending")).toEqual(["a", "b", "c"]);
    fireEvent.wheel(window, { deltaY: 40 });
    expect(inSection("cart")).toEqual(["a"]);

    tap("b");
    wait(WRITE_MS);
    expect(inSection("pending")).toEqual(["b", "c"]);
    fireEvent.keyDown(window, { key: "PageDown" });
    expect(inSection("cart")).toEqual(["a", "b"]);
  });

  it("lets the rows go when the focus moves to something else, not to a row's checkbox", () => {
    render(<Harness initial={rows(["a", false], ["b", false])} />);

    tap("a");
    wait(WRITE_MS);
    act(() => screen.getByRole("checkbox", { name: "b" }).focus());
    expect(inSection("pending")).toEqual(["a", "b"]);

    act(() => screen.getByRole("textbox", { name: "add" }).focus());
    expect(inSection("pending")).toEqual(["b"]);
    expect(inSection("cart")).toEqual(["a"]);
  });
});
