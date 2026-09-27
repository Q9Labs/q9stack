"use client";

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
import type { Knob, KnobSpec } from "./knob";
import { parseKnobValue } from "./knob";

export interface KnobControlsProps {
  readonly spec: KnobSpec;
  readonly values: ReadonlyMap<string, string>;
  readonly onChange: (name: string, raw: string) => void;
}

export function KnobControls({ spec, values, onChange }: KnobControlsProps) {
  const entries = Object.entries(spec);
  if (entries.length === 0) {
    return null;
  }
  return (
    <div data-slot="knob-controls" className="flex flex-col gap-4">
      {entries.map(([key, knobSpec]) => (
        <KnobControl
          key={key}
          spec={knobSpec}
          raw={values.get(knobSpec.name) ?? null}
          onChange={(raw) => onChange(knobSpec.name, raw)}
        />
      ))}
    </div>
  );
}

interface KnobControlProps {
  readonly spec: Knob;
  readonly raw: string | null;
  readonly onChange: (raw: string) => void;
}

function KnobControl({ spec, raw, onChange }: KnobControlProps) {
  const value = parseKnobValue(spec, raw);

  if (spec.kind === "boolean") {
    return (
      <div className="flex items-center justify-between gap-3">
        <span className="text-sm font-medium text-foreground">{spec.name}</span>
        <Switch checked={value === true} onCheckedChange={(checked) => onChange(String(checked))} />
      </div>
    );
  }

  if (spec.kind === "select") {
    return (
      <Field>
        <FieldLabel>{spec.name}</FieldLabel>
        <Select
          items={spec.options.map((option) => ({ label: option, value: option }))}
          value={String(value)}
          onValueChange={(next: string | null) => {
            if (next !== null) {
              onChange(next);
            }
          }}
        >
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {spec.options.map((option) => (
              <SelectItem key={option} value={option}>
                {option}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Field>
    );
  }

  if (spec.kind === "number") {
    return (
      <Field>
        <FieldLabel>{spec.name}</FieldLabel>
        <Input
          type="number"
          value={String(value)}
          min={spec.min}
          max={spec.max}
          step={spec.step}
          onValueChange={onChange}
        />
      </Field>
    );
  }

  return (
    <Field>
      <FieldLabel>{spec.name}</FieldLabel>
      <Input value={String(value)} onValueChange={onChange} />
    </Field>
  );
}
