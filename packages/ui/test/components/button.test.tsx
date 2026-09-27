import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { Button } from "../../src/index";

describe("Button", () => {
  it("applies the default variant and size classes", () => {
    render(<Button>Save</Button>);
    const button = screen.getByRole("button", { name: "Save" });
    expect(button.getAttribute("data-variant")).toBe("default");
    expect(button.getAttribute("data-size")).toBe("md");
    expect(button.className).toContain("bg-primary");
    expect(button.className).toContain("h-9");
  });

  it("applies the requested variant and size classes", () => {
    render(
      <Button variant="destructive" size="lg">
        Delete
      </Button>,
    );
    const button = screen.getByRole("button", { name: "Delete" });
    expect(button.getAttribute("data-variant")).toBe("destructive");
    expect(button.className).toContain("bg-destructive");
    expect(button.className).toContain("h-11");
    expect(button.className).not.toContain("bg-primary ");
  });

  it("lets a caller override a conflicting utility", () => {
    render(<Button className="h-16">Tall</Button>);
    const button = screen.getByRole("button", { name: "Tall" });
    expect(button.className).toContain("h-16");
    expect(button.className).not.toContain("h-9");
  });

  it("blocks interaction and announces busy while loading", async () => {
    const onClick = vi.fn();
    render(
      <Button loading onClick={onClick}>
        Saving
      </Button>,
    );
    const button = screen.getByRole("button", { name: /Saving/ });
    expect(button.hasAttribute("disabled")).toBe(true);
    expect(button.getAttribute("aria-busy")).toBe("true");
    button.click();
    expect(onClick).not.toHaveBeenCalled();
  });
});
