import { act, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
  DialogTrigger,
} from "../../src/index";

function InviteDialog() {
  return (
    <Dialog>
      <DialogTrigger render={<Button>Invite</Button>} />
      <DialogContent>
        <DialogTitle>Invite teammate</DialogTitle>
        <DialogDescription>They get read access until you promote them.</DialogDescription>
      </DialogContent>
    </Dialog>
  );
}

describe("Dialog", () => {
  it("stays closed until the trigger is used", () => {
    render(<InviteDialog />);
    expect(screen.queryByRole("dialog")).toBeNull();

    act(() => screen.getByRole("button", { name: "Invite" }).click());

    const dialog = screen.getByRole("dialog");
    expect(dialog.getAttribute("aria-labelledby")).toBe(screen.getByText("Invite teammate").id);
    expect(dialog.getAttribute("aria-describedby")).toBe(
      screen.getByText("They get read access until you promote them.").id,
    );
  });

  it("closes from the close button", async () => {
    render(<InviteDialog />);
    act(() => screen.getByRole("button", { name: "Invite" }).click());
    act(() => screen.getByRole("button", { name: "Close" }).click());

    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 250));
    });

    expect(screen.queryByRole("dialog")).toBeNull();
  });
});
