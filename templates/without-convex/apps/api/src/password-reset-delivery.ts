import type { AppEnvironment } from "./config.js";

export interface PasswordResetDeliveryInput {
  readonly email: string;
  readonly resetUrl: string;
}

export interface PasswordResetDeliveryConfig {
  readonly environment: AppEnvironment;
  readonly webhookToken?: string;
  readonly webhookUrl?: URL;
}

export interface PasswordResetDelivery {
  readonly deliver: (input: PasswordResetDeliveryInput) => Promise<void>;
  readonly developmentUrl: (email: string) => string | undefined;
}

export class PasswordResetDeliveryError extends Error {
  override readonly cause: unknown;

  constructor(message: string, cause?: unknown) {
    super(message);
    this.name = "PasswordResetDeliveryError";
    this.cause = cause;
  }
}

const normalizeEmail = (email: string): string => email.trim().toLowerCase();

export const createPasswordResetDelivery = (
  config: PasswordResetDeliveryConfig,
  transport: typeof fetch = fetch,
): PasswordResetDelivery => {
  const developmentUrls = new Map<string, string>();

  const deliver = async (input: PasswordResetDeliveryInput): Promise<void> => {
    if (config.environment === "dev") {
      developmentUrls.set(normalizeEmail(input.email), input.resetUrl);
      return;
    }

    if (
      config.webhookUrl === undefined ||
      config.webhookToken === undefined ||
      config.webhookToken.length === 0
    ) {
      throw new PasswordResetDeliveryError(
        "PASSWORD_RESET_WEBHOOK_URL and PASSWORD_RESET_WEBHOOK_TOKEN are required in production",
      );
    }
    if (config.webhookUrl.protocol !== "https:") {
      throw new PasswordResetDeliveryError(
        "PASSWORD_RESET_WEBHOOK_URL must use HTTPS in production",
      );
    }

    let response: Response;
    try {
      response = await transport(config.webhookUrl, {
        body: JSON.stringify({
          event: "password-reset.requested",
          recipient: { email: input.email },
          resetUrl: input.resetUrl,
        }),
        headers: {
          authorization: `Bearer ${config.webhookToken}`,
          "content-type": "application/json",
        },
        method: "POST",
        signal: AbortSignal.timeout(10_000),
      });
    } catch (cause: unknown) {
      throw new PasswordResetDeliveryError(
        "The password-reset webhook could not be reached",
        cause,
      );
    }

    if (!response.ok) {
      throw new PasswordResetDeliveryError(
        `The password-reset webhook returned HTTP ${response.status}`,
      );
    }
  };

  return {
    deliver,
    developmentUrl: (email) => developmentUrls.get(normalizeEmail(email)),
  };
};
