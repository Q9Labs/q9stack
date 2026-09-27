import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import {
  Field,
  FieldControl,
  FieldDescription,
  FieldError,
  FieldLabel,
  Input,
} from "../../src/index";

describe("Field", () => {
  it("labels the control and points aria-describedby at the description", () => {
    render(
      <Field name="email">
        <FieldLabel>Work email</FieldLabel>
        <FieldControl render={<Input />} />
        <FieldDescription>We only use this to send sign-in links.</FieldDescription>
      </Field>,
    );

    const control = screen.getByLabelText("Work email");
    const description = screen.getByText("We only use this to send sign-in links.");
    expect(control.getAttribute("aria-describedby")).toBe(description.id);
    expect(description.id).not.toBe("");
  });

  it("reports a validation message through the error slot", () => {
    render(
      <Field name="email" invalid>
        <FieldLabel>Work email</FieldLabel>
        <FieldControl render={<Input />} />
        <FieldError match>Enter a work email.</FieldError>
      </Field>,
    );

    const control = screen.getByLabelText("Work email");
    const error = screen.getByText("Enter a work email.");
    expect(control.getAttribute("aria-invalid")).toBe("true");
    expect(control.getAttribute("aria-describedby")).toContain(error.id);
  });
});
