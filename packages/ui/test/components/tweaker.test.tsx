import { act, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { DEFAULT_ENVIRONMENT, Tweaker } from "../../src/preview/index";

describe("Tweaker", () => {
  it("offers the default viewport presets and reports the picked width", () => {
    const onChange = vi.fn();
    render(<Tweaker environment={DEFAULT_ENVIRONMENT} onChange={onChange} />);

    act(() => screen.getByRole("button", { name: "768" }).click());

    expect(onChange).toHaveBeenCalledWith({ ...DEFAULT_ENVIRONMENT, width: 768 });
  });

  it("takes the option lists from the config", () => {
    render(
      <Tweaker
        environment={DEFAULT_ENVIRONMENT}
        onChange={vi.fn()}
        config={{ viewports: [{ label: "Phone", width: 390 }] }}
      />,
    );

    expect(screen.getByRole("button", { name: "Phone" })).toBeDefined();
    expect(screen.queryByRole("button", { name: "768" })).toBeNull();
  });

  it("toggles the direction comparison", () => {
    const onChange = vi.fn();
    render(<Tweaker environment={DEFAULT_ENVIRONMENT} onChange={onChange} />);

    act(() => screen.getByRole("switch").click());

    expect(onChange).toHaveBeenCalledWith({ ...DEFAULT_ENVIRONMENT, compareDir: true });
  });

  it("shows the knobs panel only when knobs are supplied", () => {
    const { rerender } = render(<Tweaker environment={DEFAULT_ENVIRONMENT} onChange={vi.fn()} />);
    expect(screen.queryByText("Knobs")).toBeNull();

    rerender(
      <Tweaker
        environment={DEFAULT_ENVIRONMENT}
        onChange={vi.fn()}
        knobs={<span>size knob</span>}
      />,
    );
    expect(screen.getByText("Knobs")).toBeDefined();
    expect(screen.getByText("size knob")).toBeDefined();
  });
});
