import type { ReactNode } from "react";

import type { KnobSpec, KnobValues } from "./knob";

export interface PreviewScenario<Spec extends KnobSpec = KnobSpec> {
  readonly name: string;
  /** Declare knobs with `knob.*`; use `{}` for a scenario with no controls. */
  readonly knobs: Spec;
  /** Declared as a method so a scenario with concrete knobs stays assignable to the erased `Preview`. */
  render(knobs: KnobValues<Spec>): ReactNode;
}

export interface Preview {
  readonly title: string;
  readonly scenarios: readonly PreviewScenario[];
}

export interface PreviewConfig<Specs extends readonly KnobSpec[]> {
  readonly title: string;
  readonly scenarios: { readonly [Index in keyof Specs]: PreviewScenario<Specs[Index]> };
}

/**
 * Groups scenarios under one title. Each scenario's `render` receives values
 * typed by its own `knobs` declaration.
 */
export function definePreview<const Specs extends readonly KnobSpec[]>(
  config: PreviewConfig<Specs>,
): Preview {
  return { title: config.title, scenarios: config.scenarios };
}

export function previewId(preview: Preview): string {
  return slug(preview.title);
}

export function scenarioId(scenario: PreviewScenario): string {
  return slug(scenario.name);
}

const NON_SLUG = /[^a-z0-9]+/g;
const EDGE_DASHES = /^-|-$/g;

function slug(value: string): string {
  return value.toLowerCase().replace(NON_SLUG, "-").replace(EDGE_DASHES, "");
}
