import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import Home from "@/app/(app)/page";
import { QueryProvider } from "@/lib/queries";

describe("Home page", () => {
  it("renders a level-1 heading", () => {
    render(
      <QueryProvider>
        <Home />
      </QueryProvider>,
    );
    expect(screen.getByRole("heading", { level: 1 })).toBeInTheDocument();
  });
});
