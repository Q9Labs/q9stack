import { act, fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { DevAccountSwitcher, SignInForm, VerifyEmailNotice } from "../../src/auth/index";

const ACCOUNTS = [
  { email: "owner@example.com", name: "Dana Ito", role: "owner" },
  { email: "member@example.com", name: "Omar Haddad", role: "member" },
];

describe("SignInForm", () => {
  it("hands the typed credentials to onSubmit", () => {
    const onSubmit = vi.fn();
    render(<SignInForm onSubmit={onSubmit} />);

    fireEvent.change(screen.getByLabelText("Email"), {
      target: { value: "dana@example.com" },
    });
    fireEvent.change(screen.getByLabelText("Password"), { target: { value: "hunter2hunter2" } });
    fireEvent.submit(screen.getByRole("button", { name: "Sign in" }).closest("form") ?? document);

    expect(onSubmit).toHaveBeenCalledWith({
      email: "dana@example.com",
      password: "hunter2hunter2",
    });
  });

  it("renders the supplied error and locks the form while submitting", () => {
    render(<SignInForm onSubmit={vi.fn()} error="Those credentials did not match." submitting />);

    expect(screen.getByRole("alert").textContent).toBe("Those credentials did not match.");
    expect(screen.getByRole("button", { name: /Sign in/ }).hasAttribute("disabled")).toBe(true);
  });

  it("takes translated labels", () => {
    render(<SignInForm onSubmit={vi.fn()} labels={{ submit: "Se connecter" }} />);
    expect(screen.getByRole("button", { name: "Se connecter" })).toBeDefined();
  });

  it("only offers the optional links that have handlers", () => {
    const { rerender } = render(<SignInForm onSubmit={vi.fn()} />);
    expect(screen.queryByRole("button", { name: "Forgot password?" })).toBeNull();

    rerender(<SignInForm onSubmit={vi.fn()} onForgotPassword={vi.fn()} />);
    expect(screen.getByRole("button", { name: "Forgot password?" })).toBeDefined();
  });
});

describe("VerifyEmailNotice", () => {
  it("shows the address and resends on demand", () => {
    const onResend = vi.fn();
    render(<VerifyEmailNotice email="dana@example.com" onResend={onResend} />);

    expect(screen.getByText(/dana@example\.com/)).toBeDefined();
    act(() => screen.getByRole("button", { name: "Resend email" }).click());
    expect(onResend).toHaveBeenCalledOnce();
  });
});

describe("DevAccountSwitcher", () => {
  it("expands into the seeded accounts and switches", () => {
    const onSwitch = vi.fn();
    render(
      <DevAccountSwitcher
        accounts={ACCOUNTS}
        current="owner@example.com"
        defaultOpen
        onSwitch={onSwitch}
        onSignOut={vi.fn()}
      />,
    );

    act(() => screen.getByRole("button", { name: /Omar Haddad/ }).click());
    expect(onSwitch).toHaveBeenCalledWith("member@example.com");
  });
});
