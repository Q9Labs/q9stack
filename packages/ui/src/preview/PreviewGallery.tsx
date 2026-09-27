"use client";

import {
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";

import { cn } from "../cn";
import { Separator } from "../primitives/separator";
import { ThemeProvider } from "../theme/ThemeProvider";
import { type Preview, type PreviewScenario, previewId, scenarioId } from "./define-preview";
import type { PreviewEnvironment, TweakerConfig } from "./environment";
import { type KnobSpec, type KnobValue, type KnobValues, parseKnobValue } from "./knob";
import { KnobControls } from "./KnobControls";
import { PreviewNav } from "./PreviewNav";
import { PreviewStage } from "./PreviewStage";
import { Tweaker } from "./Tweaker";
import { type PreviewUrlState, readUrlState, writeUrlState } from "./url-state";

export interface PreviewGalleryProps {
  readonly previews: readonly Preview[];
  readonly tweaker?: TweakerConfig | undefined;
}

const MIN_STAGE_WIDTH = 240;

/**
 * The whole preview app: nav on the inline start, stage in the middle, Tweaker
 * on the inline end. Every control writes to the URL so a view is shareable.
 */
export function PreviewGallery({ previews, tweaker }: PreviewGalleryProps) {
  const [state, setState] = useState<PreviewUrlState>(() =>
    readUrlState(typeof window === "undefined" ? "" : window.location.search),
  );

  const selection = useMemo(
    () => selectScenario(previews, state.previewId, state.scenarioId),
    [previews, state.previewId, state.scenarioId],
  );

  useEffect(() => {
    if (selection === null) {
      return;
    }
    const query = writeUrlState({
      ...state,
      previewId: selection.previewId,
      scenarioId: selection.scenarioId,
    });
    window.history.replaceState(null, "", `?${query}`);
  }, [state, selection]);

  const setEnvironment = useCallback((environment: PreviewEnvironment) => {
    setState((current) => ({ ...current, environment }));
  }, []);

  const setKnob = useCallback((name: string, raw: string) => {
    setState((current) => {
      const knobs = new Map(current.knobs);
      knobs.set(name, raw);
      return { ...current, knobs };
    });
  }, []);

  const select = useCallback((nextPreview: string, nextScenario: string) => {
    setState((current) => ({
      ...current,
      previewId: nextPreview,
      scenarioId: nextScenario,
      knobs: new Map(),
    }));
  }, []);

  if (selection === null) {
    return <p className="p-6 text-sm text-muted-foreground">No previews registered.</p>;
  }

  const { environment } = state;
  const { scenario } = selection;
  const knobValues = resolveKnobs(scenario, state.knobs);

  return (
    <ThemeProvider
      defaultScheme={environment.scheme}
      defaultProductTheme={environment.productTheme}
      dir={environment.dir}
      enableSystemListener={false}
    >
      <div className="flex h-dvh bg-background text-foreground">
        <PreviewNav
          previews={previews}
          activePreviewId={selection.previewId}
          activeScenarioId={selection.scenarioId}
          onSelect={select}
        />
        <main className="flex min-w-0 flex-1 flex-col gap-4 overflow-auto p-6">
          <header className="flex items-baseline gap-2">
            <h1 className="text-sm font-medium">{selection.previewTitle}</h1>
            <span className="text-sm text-muted-foreground">{scenario.name}</span>
          </header>
          <ResizableFrame
            width={environment.width}
            onWidthChange={(width) => setEnvironment({ ...environment, width })}
          >
            <div className="flex min-h-0 flex-1 gap-4">
              <PreviewStage
                environment={environment}
                dir={environment.compareDir ? "ltr" : environment.dir}
                label={environment.compareDir ? "ltr" : undefined}
              >
                {scenario.render(knobValues)}
              </PreviewStage>
              {environment.compareDir ? (
                <PreviewStage environment={environment} dir="rtl" label="rtl">
                  {scenario.render(knobValues)}
                </PreviewStage>
              ) : null}
            </div>
          </ResizableFrame>
        </main>
        <Tweaker
          environment={environment}
          onChange={setEnvironment}
          config={tweaker}
          knobs={<KnobControls spec={scenario.knobs} values={state.knobs} onChange={setKnob} />}
        />
      </div>
    </ThemeProvider>
  );
}

interface ResizableFrameProps {
  readonly width: number;
  readonly onWidthChange: (width: number) => void;
  readonly children: ReactNode;
}

function ResizableFrame({ width, onWidthChange, children }: ResizableFrameProps) {
  const onPointerDown = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      const frame = event.currentTarget.parentElement;
      if (frame === null) {
        return;
      }
      event.currentTarget.setPointerCapture(event.pointerId);
      const startX = event.clientX;
      const startWidth = frame.getBoundingClientRect().width;
      const handle = event.currentTarget;
      const onMove = (move: PointerEvent): void => {
        onWidthChange(Math.max(MIN_STAGE_WIDTH, Math.round(startWidth + (move.clientX - startX))));
      };
      const onUp = (): void => {
        handle.removeEventListener("pointermove", onMove);
        handle.removeEventListener("pointerup", onUp);
      };
      handle.addEventListener("pointermove", onMove);
      handle.addEventListener("pointerup", onUp);
    },
    [onWidthChange],
  );

  return (
    <div
      data-slot="preview-frame"
      className={cn("relative flex min-h-0 flex-1 flex-col", width === 0 && "w-full")}
      style={width === 0 ? undefined : { width: `${width}px`, maxWidth: "100%" }}
    >
      {children}
      <Separator
        orientation="vertical"
        aria-label="Resize preview"
        onPointerDown={onPointerDown}
        className="absolute inset-y-0 -end-2 w-2 cursor-col-resize rounded-full bg-border/60 hover:bg-border"
      />
    </div>
  );
}

interface Selection {
  readonly previewId: string;
  readonly previewTitle: string;
  readonly scenarioId: string;
  readonly scenario: PreviewScenario;
}

function selectScenario(
  previews: readonly Preview[],
  wantedPreview: string | null,
  wantedScenario: string | null,
): Selection | null {
  const preview = previews.find((entry) => previewId(entry) === wantedPreview) ?? previews[0];
  if (preview === undefined) {
    return null;
  }
  const scenario =
    preview.scenarios.find((entry) => scenarioId(entry) === wantedScenario) ?? preview.scenarios[0];
  if (scenario === undefined) {
    return null;
  }
  return {
    previewId: previewId(preview),
    previewTitle: preview.title,
    scenarioId: scenarioId(scenario),
    scenario,
  };
}

function resolveKnobs(
  scenario: PreviewScenario,
  raw: ReadonlyMap<string, string>,
): KnobValues<KnobSpec> {
  const values: Record<string, KnobValue> = {};
  for (const [key, spec] of Object.entries(scenario.knobs)) {
    values[key] = parseKnobValue(spec, raw.get(spec.name) ?? null);
  }
  return values;
}
