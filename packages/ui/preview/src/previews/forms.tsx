import { Search01Icon } from "@hugeicons/core-free-icons";
import { useState } from "react";

import {
  Checkbox,
  Field,
  FieldControl,
  FieldDescription,
  FieldError,
  FieldLabel,
  Icon,
  Input,
  Label,
  RadioGroup,
  RadioGroupItem,
  Select,
  SelectContent,
  SelectGroup,
  SelectGroupLabel,
  SelectItem,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
  Switch,
  Textarea,
} from "../../../src/index";
import { definePreview, knob } from "../../../src/preview/index";
import { Section, Stack } from "./_row";

const PLANS = [
  { label: "Starter", value: "starter" },
  { label: "Growth", value: "growth" },
  { label: "Enterprise", value: "enterprise" },
];

function SelectDemo({ open }: { readonly open: boolean }) {
  const [value, setValue] = useState("growth");
  return (
    <Field>
      <FieldLabel>Plan</FieldLabel>
      <Select
        items={PLANS}
        value={value}
        onValueChange={(next) => setValue(next ?? "growth")}
        defaultOpen={open}
      >
        <SelectTrigger className="max-w-64">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectGroup>
            <SelectGroupLabel>Self serve</SelectGroupLabel>
            <SelectItem value="starter">Starter</SelectItem>
            <SelectItem value="growth">Growth</SelectItem>
          </SelectGroup>
          <SelectSeparator />
          <SelectItem value="enterprise">Enterprise</SelectItem>
        </SelectContent>
      </Select>
      <FieldDescription>Changing plan takes effect at the next billing cycle.</FieldDescription>
    </Field>
  );
}

export const formsPreview = definePreview({
  title: "Forms",
  scenarios: [
    {
      name: "Text fields",
      knobs: {
        invalid: knob.boolean("invalid", false),
        disabled: knob.boolean("disabled", false),
        placeholder: knob.text("placeholder", "jane@example.com"),
      },
      render: ({ invalid, disabled, placeholder }) => (
        <Stack>
          <Field className="max-w-80" invalid={invalid} disabled={disabled}>
            <FieldLabel>Work email</FieldLabel>
            <FieldControl
              render={<Input type="email" placeholder={placeholder} defaultValue="" />}
              required
            />
            <FieldDescription>We only use this to send sign-in links.</FieldDescription>
            <FieldError match="valueMissing">Enter your work email.</FieldError>
          </Field>
          <Field className="max-w-80" disabled={disabled}>
            <FieldLabel>Notes</FieldLabel>
            <FieldControl render={<Textarea rows={4} placeholder="Anything we should know?" />} />
          </Field>
          <Section title="Bare input">
            <div className="flex max-w-80 flex-col gap-2">
              <Label htmlFor="preview-search">Search</Label>
              <Input id="preview-search" type="search" placeholder="Search projects" />
            </div>
          </Section>
        </Stack>
      ),
    },
    {
      name: "Choice controls",
      knobs: { disabled: knob.boolean("disabled", false) },
      render: ({ disabled }) => (
        <Stack>
          <Section title="Checkbox">
            <div className="flex items-center gap-3">
              <Checkbox id="preview-terms" defaultChecked disabled={disabled} />
              <Label htmlFor="preview-terms">Email me about product updates</Label>
            </div>
          </Section>
          <Section title="Switch">
            <div className="flex items-center gap-3">
              <Switch id="preview-switch" defaultChecked disabled={disabled} />
              <Label htmlFor="preview-switch">Two-factor authentication</Label>
            </div>
          </Section>
          <Section title="Radio group">
            <RadioGroup defaultValue="monthly" disabled={disabled} className="flex flex-col gap-3">
              {["monthly", "yearly"].map((value) => (
                <div key={value} className="flex items-center gap-3">
                  <RadioGroupItem id={`preview-${value}`} value={value} />
                  <Label htmlFor={`preview-${value}`}>Billed {value}</Label>
                </div>
              ))}
            </RadioGroup>
          </Section>
        </Stack>
      ),
    },
    {
      name: "Select",
      knobs: { open: knob.boolean("open", true) },
      render: ({ open }) => (
        <div className="max-w-80">
          <SelectDemo key={String(open)} open={open} />
        </div>
      ),
    },
    {
      name: "Search field",
      knobs: { value: knob.text("value", "onboarding") },
      render: ({ value }) => (
        <div className="relative max-w-80">
          <Input defaultValue={value} className="ps-9" placeholder="Search" />
          <span className="pointer-events-none absolute inset-y-0 start-3 flex items-center text-muted-foreground">
            <Icon icon={Search01Icon} size="sm" />
          </span>
        </div>
      ),
    },
  ],
});
