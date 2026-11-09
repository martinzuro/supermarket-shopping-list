import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import {
  SWIPE_FLING_DISTANCE,
  SWIPE_FLING_VELOCITY,
  SWIPE_THRESHOLD,
  SwipeToRemove,
  swipeRemoves,
} from "./swipe-to-remove";

/**
 * The drag itself runs in the browser (e2e/m9-remove-undo.spec.ts);
 * here, the decision and what the wrapper leaves alone.
 */
describe("swipeRemoves", () => {
  const width = 375;
  const threshold = width * SWIPE_THRESHOLD;

  it("deletes once the row went past the threshold, to the left", () => {
    expect(swipeRemoves(-threshold, 0, width)).toBe(true);
    expect(swipeRemoves(-threshold + 1, 0, width)).toBe(false);
    expect(swipeRemoves(-width, 0, width)).toBe(true);
  });

  it("never deletes to the right or with no width", () => {
    expect(swipeRemoves(threshold, -5000, width)).toBe(false);
    expect(swipeRemoves(0, -5000, width)).toBe(false);
    expect(swipeRemoves(-200, 0, 0)).toBe(false);
  });

  it("a quick flick deletes before the threshold, but not a twitch", () => {
    expect(
      swipeRemoves(-SWIPE_FLING_DISTANCE, -SWIPE_FLING_VELOCITY, width),
    ).toBe(true);
    // Fast but barely moved: a tap that slipped.
    expect(
      swipeRemoves(-SWIPE_FLING_DISTANCE + 1, -SWIPE_FLING_VELOCITY * 3, width),
    ).toBe(false);
    // Far enough but slow, and short of the threshold: it goes back.
    expect(
      swipeRemoves(-SWIPE_FLING_DISTANCE, -SWIPE_FLING_VELOCITY + 1, width),
    ).toBe(false);
  });
});

describe("SwipeToRemove", () => {
  it("leaves a tap on the row alone", () => {
    const onPress = vi.fn();
    const onRemove = vi.fn();
    render(
      <SwipeToRemove label="Borrar" onRemove={onRemove}>
        <button type="button" onClick={onPress}>
          Leche
        </button>
      </SwipeToRemove>,
    );
    fireEvent.pointerDown(screen.getByRole("button", { name: "Leche" }));
    fireEvent.click(screen.getByRole("button", { name: "Leche" }));
    expect(onPress).toHaveBeenCalledTimes(1);
    expect(onRemove).not.toHaveBeenCalled();
  });

  it("keeps what is behind out of the accessibility tree", () => {
    render(
      <SwipeToRemove label="Borrar" onRemove={() => {}}>
        <span>Leche</span>
      </SwipeToRemove>,
    );
    // The way to delete for everyone is the sheet's button.
    expect(screen.queryByText("Borrar")).not.toBeNull();
    expect(screen.queryByRole("button", { name: "Borrar" })).toBeNull();
    expect(screen.getByText("Borrar").closest("[aria-hidden]")).not.toBeNull();
  });

  it("disabled, shows nothing behind and does not drag", () => {
    const { container } = render(
      <SwipeToRemove label="Borrar" onRemove={() => {}} disabled>
        <span>Leche</span>
      </SwipeToRemove>,
    );
    expect(screen.queryByText("Borrar")).toBeNull();
    const row = screen.getByText("Leche").parentElement!;
    expect(row.style.touchAction).toBe("");
    expect(
      container.querySelector('[data-slot="swipe-to-remove"]'),
    ).not.toBeNull();
  });

  it("lets the page scroll vertically over the row", () => {
    render(
      <SwipeToRemove label="Borrar" onRemove={() => {}}>
        <span>Leche</span>
      </SwipeToRemove>,
    );
    expect(screen.getByText("Leche").parentElement!.style.touchAction).toBe(
      "pan-y",
    );
  });
});
