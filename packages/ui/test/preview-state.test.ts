import { describe, expect, it } from "vitest";

import { DEFAULT_ENVIRONMENT, directionForLocale } from "../src/preview/environment";
import { knob, parseKnobValue } from "../src/preview/knob";
import { readUrlState, writeUrlState } from "../src/preview/url-state";

describe("preview url state", () => {
  it("falls back to the default environment for an empty query", () => {
    const state = readUrlState("");
    expect(state.previewId).toBeNull();
    expect(state.scenarioId).toBeNull();
    expect(state.environment).toEqual(DEFAULT_ENVIRONMENT);
    expect([...state.knobs]).toEqual([]);
  });

  it("reads scenario selection, environment and knobs", () => {
    const state = readUrlState(
      "?preview=forms&scenario=select&locale=ar&dir=rtl&scheme=dark&theme=kaadr&role=admin&width=768&compare=1&k.open=true",
    );
    expect(state.previewId).toBe("forms");
    expect(state.scenarioId).toBe("select");
    expect(state.environment).toEqual({
      locale: "ar",
      dir: "rtl",
      scheme: "dark",
      productTheme: "kaadr",
      role: "admin",
      width: 768,
      compareDir: true,
    });
    expect(state.knobs.get("open")).toBe("true");
  });

  it("ignores unknown direction and scheme values", () => {
    const state = readUrlState("?dir=sideways&scheme=sepia");
    expect(state.environment.dir).toBe(DEFAULT_ENVIRONMENT.dir);
    expect(state.environment.scheme).toBe(DEFAULT_ENVIRONMENT.scheme);
  });

  it("round-trips through the query string", () => {
    const state = readUrlState(
      "?preview=overlays&scenario=dialog&locale=fr&dir=ltr&scheme=light&theme=q9&role=owner&width=0&compare=0&k.size=lg",
    );
    expect(readUrlState(`?${writeUrlState(state)}`)).toEqual(state);
  });
});

describe("knobs", () => {
  it("parses each knob kind out of its string form", () => {
    expect(parseKnobValue(knob.select("size", ["sm", "lg"], "sm"), "lg")).toBe("lg");
    expect(parseKnobValue(knob.select("size", ["sm", "lg"], "sm"), "xl")).toBe("sm");
    expect(parseKnobValue(knob.boolean("open", false), "true")).toBe(true);
    expect(parseKnobValue(knob.boolean("open", true), "false")).toBe(false);
    expect(parseKnobValue(knob.number("count", 3, { min: 0 }), "12")).toBe(12);
    expect(parseKnobValue(knob.number("count", 3), "many")).toBe(3);
    expect(parseKnobValue(knob.text("label", "Save"), "Send")).toBe("Send");
  });

  it("falls back to the default when the query has nothing", () => {
    expect(parseKnobValue(knob.text("label", "Save"), null)).toBe("Save");
    expect(parseKnobValue(knob.number("count", 3), null)).toBe(3);
  });
});

describe("directionForLocale", () => {
  it("maps right-to-left languages, including regional tags", () => {
    expect(directionForLocale("ar")).toBe("rtl");
    expect(directionForLocale("ar-EG")).toBe("rtl");
    expect(directionForLocale("ur-PK")).toBe("rtl");
    expect(directionForLocale("en-GB")).toBe("ltr");
    expect(directionForLocale("fr")).toBe("ltr");
  });
});
