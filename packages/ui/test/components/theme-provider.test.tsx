import { act, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { ThemeProvider, ThemeProviderMissingError, useTheme } from "../../src/index";

function SchemeProbe() {
  const { scheme, resolvedScheme, setScheme, setProductTheme } = useTheme();
  return (
    <>
      <output data-testid="scheme">{`${scheme}/${resolvedScheme}`}</output>
      <button type="button" onClick={() => setScheme("dark")}>
        dark
      </button>
      <button type="button" onClick={() => setProductTheme("kaadr")}>
        kaadr
      </button>
    </>
  );
}

afterEach(() => {
  window.localStorage.clear();
  document.documentElement.className = "";
  document.documentElement.removeAttribute("data-theme");
  document.documentElement.removeAttribute("dir");
});

describe("ThemeProvider", () => {
  it("writes the scheme, palette and direction onto <html>", () => {
    render(
      <ThemeProvider defaultScheme="dark" defaultProductTheme="recruiter" dir="rtl">
        <SchemeProbe />
      </ThemeProvider>,
    );
    const root = document.documentElement;
    expect(root.classList.contains("dark")).toBe(true);
    expect(root.style.colorScheme).toBe("dark");
    expect(root.getAttribute("data-theme")).toBe("recruiter");
    expect(root.dir).toBe("rtl");
  });

  it("toggles the dark class when the scheme changes", () => {
    render(
      <ThemeProvider defaultScheme="light" enableSystemListener={false}>
        <SchemeProbe />
      </ThemeProvider>,
    );
    expect(document.documentElement.classList.contains("dark")).toBe(false);

    act(() => screen.getByRole("button", { name: "dark" }).click());

    expect(document.documentElement.classList.contains("dark")).toBe(true);
    expect(screen.getByTestId("scheme").textContent).toBe("dark/dark");
    expect(window.localStorage.getItem("q9-color-scheme")).toBe("dark");
  });

  it("swaps the product palette without touching the scheme", () => {
    render(
      <ThemeProvider defaultScheme="light" enableSystemListener={false}>
        <SchemeProbe />
      </ThemeProvider>,
    );

    act(() => screen.getByRole("button", { name: "kaadr" }).click());

    expect(document.documentElement.getAttribute("data-theme")).toBe("kaadr");
    expect(document.documentElement.classList.contains("dark")).toBe(false);
  });

  it("throws a tagged error when useTheme is called with no provider", () => {
    expect(() => render(<SchemeProbe />)).toThrowError(/outside of <ThemeProvider>/);
    expect(new ThemeProviderMissingError()._tag).toBe("ThemeProviderMissingError");
  });
});
