import { ArrowRight01Icon } from "@hugeicons/core-free-icons";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { Icon } from "../../src/index";

function iconElement(): SVGSVGElement {
  const svg = document.querySelector("svg[data-slot=icon]");
  if (!(svg instanceof SVGSVGElement)) {
    throw new Error("no icon rendered");
  }
  return svg;
}

describe("Icon", () => {
  it("is decorative by default", () => {
    render(<Icon icon={ArrowRight01Icon} />);
    const svg = iconElement();
    expect(svg.getAttribute("aria-hidden")).toBe("true");
    expect(svg.getAttribute("role")).toBeNull();
    expect(svg.getAttribute("aria-label")).toBeNull();
  });

  it("becomes a labelled image when a label is given", () => {
    render(<Icon icon={ArrowRight01Icon} label="Next page" />);
    const svg = screen.getByRole("img", { name: "Next page" });
    expect(svg.getAttribute("aria-hidden")).toBeNull();
  });

  it("maps the size scale onto pixel dimensions", () => {
    render(<Icon icon={ArrowRight01Icon} size="lg" />);
    expect(iconElement().getAttribute("width")).toBe("24");
  });

  it("mirrors directional icons only when asked", () => {
    render(<Icon icon={ArrowRight01Icon} flipInRtl />);
    expect(iconElement().getAttribute("class")).toContain("rtl:-scale-x-100");
  });
});
