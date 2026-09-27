"use client";

import type { ReactNode } from "react";

import { Button } from "../primitives/button";
import { Field, FieldLabel } from "../primitives/field";
import { Input } from "../primitives/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../primitives/select";
import { Switch } from "../primitives/switch";
import { TEXT_DIRECTIONS } from "../theme/scheme";
import {
  directionForLocale,
  type PreviewEnvironment,
  type TweakerConfig,
  type ViewportPreset,
  VIEWPORT_PRESETS,
} from "./environment";

export interface TweakerProps {
  readonly environment: PreviewEnvironment;
  readonly onChange: (environment: PreviewEnvironment) => void;
  readonly config?: TweakerConfig | undefined;
  /** The active scenario's knob controls. */
  readonly knobs?: ReactNode;
}

const SCHEMES = ["light", "dark"] as const;

interface TweakerOptions {
  readonly locales: readonly string[];
  readonly roles: readonly string[];
  readonly productThemes: readonly string[];
  readonly viewports: readonly ViewportPreset[];
}

function tweakerOptions(config: TweakerConfig | undefined): TweakerOptions {
  return {
    locales: config?.locales ?? ["en", "ar"],
    roles: config?.roles ?? ["user", "admin"],
    productThemes: config?.productThemes ?? ["q9", "recruiter", "kaadr"],
    viewports: config?.viewports ?? VIEWPORT_PRESETS,
  };
}

export function Tweaker({ environment, onChange, config, knobs }: TweakerProps) {
  const options = tweakerOptions(config);

  return (
    <aside
      data-slot="tweaker"
      className="flex w-72 shrink-0 flex-col gap-5 overflow-y-auto border-s border-border bg-card p-4"
    >
      <TweakerSelect
        label="Locale"
        value={environment.locale}
        options={options.locales}
        onChange={(locale) => onChange({ ...environment, locale, dir: directionForLocale(locale) })}
      />
      <TweakerSelect
        label="Direction"
        value={environment.dir}
        options={TEXT_DIRECTIONS}
        onChange={(dir) => onChange({ ...environment, dir })}
      />
      <div className="flex items-center justify-between gap-3">
        <span className="text-sm font-medium text-foreground">Compare LTR / RTL</span>
        <Switch
          checked={environment.compareDir}
          onCheckedChange={(compareDir) => onChange({ ...environment, compareDir })}
        />
      </div>
      <TweakerSelect
        label="Scheme"
        value={environment.scheme}
        options={SCHEMES}
        onChange={(scheme) => onChange({ ...environment, scheme })}
      />
      <TweakerSelect
        label="Product theme"
        value={environment.productTheme}
        options={options.productThemes}
        onChange={(productTheme) => onChange({ ...environment, productTheme })}
      />
      <TweakerSelect
        label="Role"
        value={environment.role}
        options={options.roles}
        onChange={(role) => onChange({ ...environment, role })}
      />
      <TweakerViewport
        width={environment.width}
        presets={options.viewports}
        onWidthChange={(width) => onChange({ ...environment, width })}
      />
      <TweakerKnobs>{knobs}</TweakerKnobs>
    </aside>
  );
}

interface TweakerViewportProps {
  readonly width: number;
  readonly presets: readonly ViewportPreset[];
  readonly onWidthChange: (width: number) => void;
}

function TweakerViewport({ width, presets, onWidthChange }: TweakerViewportProps) {
  return (
    <div className="flex flex-col gap-2">
      <span className="text-sm font-medium text-foreground">Viewport</span>
      <div className="flex flex-wrap gap-1">
        {presets.map((preset) => (
          <Button
            key={preset.label}
            size="sm"
            variant={width === preset.width ? "default" : "outline"}
            onClick={() => onWidthChange(preset.width)}
          >
            {preset.label}
          </Button>
        ))}
      </div>
      <Input
        type="number"
        min={240}
        step={10}
        placeholder="fill"
        aria-label="Custom stage width"
        value={width === 0 ? "" : String(width)}
        onValueChange={(raw) => {
          const parsed = Number(raw);
          onWidthChange(Number.isFinite(parsed) ? parsed : 0);
        }}
      />
    </div>
  );
}

interface TweakerKnobsProps {
  readonly children: ReactNode;
}

function TweakerKnobs({ children }: TweakerKnobsProps) {
  if (children === undefined) {
    return null;
  }
  return (
    <div className="flex flex-col gap-4 border-t border-border pt-4">
      <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">Knobs</p>
      {children}
    </div>
  );
}

interface TweakerSelectProps<Option extends string> {
  readonly label: string;
  readonly value: Option;
  readonly options: readonly Option[];
  readonly onChange: (value: Option) => void;
}

function TweakerSelect<Option extends string>({
  label,
  value,
  options,
  onChange,
}: TweakerSelectProps<Option>) {
  const isOption = (candidate: string): candidate is Option =>
    options.some((option) => option === candidate);

  return (
    <Field>
      <FieldLabel>{label}</FieldLabel>
      <Select
        items={options.map((option) => ({ label: option, value: option }))}
        value={value}
        onValueChange={(next: string | null) => {
          if (next !== null && isOption(next)) {
            onChange(next);
          }
        }}
      >
        <SelectTrigger>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {options.map((option) => (
            <SelectItem key={option} value={option}>
              {option}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </Field>
  );
}
