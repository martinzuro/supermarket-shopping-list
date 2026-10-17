import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import Home from "@/app/(app)/page";

describe("Home page", () => {
  it("renders a level-1 heading", () => {
    render(<Home />);
    expect(screen.getByRole("heading", { level: 1 })).toBeInTheDocument();
  });
});
