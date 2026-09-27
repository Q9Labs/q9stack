import { describe, expect, it } from "vitest";

import {
  PasswordResetDeliveryError,
  createPasswordResetDelivery,
} from "../src/password-reset-delivery.js";

const resetInput = {
  email: "Member@Dev.Local",
  resetUrl: "http://api.test/api/auth/reset-password/token?callbackURL=web",
};

describe("password-reset delivery", () => {
  it("keeps development reset links in memory", async () => {
    const delivery = createPasswordResetDelivery({ environment: "dev" });
    await delivery.deliver(resetInput);
    expect(delivery.developmentUrl("member@dev.local")).toBe(resetInput.resetUrl);
  });

  it("posts the production event to the configured HTTPS webhook", async () => {
    let capturedRequest: Request | undefined;
    const transport: typeof fetch = async (input, init) => {
      capturedRequest = new Request(input, init);
      return new Response(undefined, { status: 204 });
    };
    const delivery = createPasswordResetDelivery(
      {
        environment: "prod",
        webhookToken: "test-token",
        webhookUrl: new URL("https://mail.test/password-reset"),
      },
      transport,
    );

    await delivery.deliver(resetInput);

    if (capturedRequest === undefined) {
      throw new Error("The password-reset webhook was not called");
    }
    expect(capturedRequest.headers.get("authorization")).toBe("Bearer test-token");
    const payload: unknown = await capturedRequest.json();
    expect(payload).toEqual({
      event: "password-reset.requested",
      recipient: { email: resetInput.email },
      resetUrl: resetInput.resetUrl,
    });
  });

  it("rejects production delivery without a secure webhook", async () => {
    const delivery = createPasswordResetDelivery({ environment: "prod" });
    await expect(delivery.deliver(resetInput)).rejects.toBeInstanceOf(PasswordResetDeliveryError);
  });
});
