import { isDirection } from "../theme/scheme";
import { DEFAULT_ENVIRONMENT, type PreviewEnvironment } from "./environment";

export interface PreviewUrlState {
  readonly previewId: string | null;
  readonly scenarioId: string | null;
  readonly environment: PreviewEnvironment;
  /** Raw knob values keyed by knob name; parsed per scenario at render time. */
  readonly knobs: ReadonlyMap<string, string>;
}

const KNOB_PREFIX = "k.";

export function readUrlState(search: string): PreviewUrlState {
  const params = new URLSearchParams(search);
  const knobs = new Map<string, string>();
  for (const [key, value] of params) {
    if (key.startsWith(KNOB_PREFIX)) {
      knobs.set(key.slice(KNOB_PREFIX.length), value);
    }
  }
  const dir = params.get("dir");
  const scheme = params.get("scheme");
  const width = Number(params.get("width"));
  return {
    previewId: params.get("preview"),
    scenarioId: params.get("scenario"),
    knobs,
    environment: {
      locale: params.get("locale") ?? DEFAULT_ENVIRONMENT.locale,
      dir: isDirection(dir) ? dir : DEFAULT_ENVIRONMENT.dir,
      scheme: scheme === "dark" || scheme === "light" ? scheme : DEFAULT_ENVIRONMENT.scheme,
      productTheme: params.get("theme") ?? DEFAULT_ENVIRONMENT.productTheme,
      role: params.get("role") ?? DEFAULT_ENVIRONMENT.role,
      width: Number.isFinite(width) ? width : DEFAULT_ENVIRONMENT.width,
      compareDir: params.get("compare") === "1",
    },
  };
}

export function writeUrlState(state: PreviewUrlState): string {
  const params = new URLSearchParams();
  if (state.previewId !== null) {
    params.set("preview", state.previewId);
  }
  if (state.scenarioId !== null) {
    params.set("scenario", state.scenarioId);
  }
  const { environment } = state;
  params.set("locale", environment.locale);
  params.set("dir", environment.dir);
  params.set("scheme", environment.scheme);
  params.set("theme", environment.productTheme);
  params.set("role", environment.role);
  params.set("width", String(environment.width));
  params.set("compare", environment.compareDir ? "1" : "0");
  for (const [name, value] of state.knobs) {
    params.set(`${KNOB_PREFIX}${name}`, value);
  }
  return params.toString();
}
