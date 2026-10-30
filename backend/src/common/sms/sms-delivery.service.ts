import {
  Injectable,
  Logger,
  ServiceUnavailableException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";

export type SmsOtpPurpose =
  "account verification" | "password reset" | "phone verification";

/**
 * Server-only SMS boundary. OTP values are deliberately never logged or
 * returned from this provider integration.
 */
@Injectable()
export class SmsDeliveryService {
  private readonly logger = new Logger(SmsDeliveryService.name);

  constructor(private readonly configService: ConfigService) {}

  async sendOtp(
    phone: string,
    code: string,
    purpose: SmsOtpPurpose,
  ): Promise<{ delivered: boolean; providerId?: string }> {
    const provider =
      this.configService.get<"disabled" | "termii">("SMS_PROVIDER") ??
      "disabled";
    if (provider === "disabled") {
      if (this.configService.get<string>("NODE_ENV") === "production") {
        throw new ServiceUnavailableException(
          "SMS verification is not configured",
        );
      }
      this.logger.warn(
        `SMS delivery skipped because SMS_PROVIDER is disabled (recipient: ${this.redact(phone)}).`,
      );
      return { delivered: false };
    }

    const apiKey = this.configService.get<string>("TERMII_API_KEY");
    if (!apiKey) {
      throw new ServiceUnavailableException(
        "SMS verification is configured but the Termii API key is missing",
      );
    }

    const baseUrl = this.configService.getOrThrow<string>("TERMII_BASE_URL");
    const response = await fetch(new URL("/api/sms/send", baseUrl), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        to: this.termiiPhone(phone),
        from: this.configService.getOrThrow<string>("TERMII_SENDER_ID"),
        sms: `SingleRent: your ${purpose} code is ${code}. It expires in 10 minutes. Do not share this code.`,
        type: "plain",
        channel: this.configService.getOrThrow<string>("TERMII_CHANNEL"),
        api_key: apiKey,
      }),
    }).catch((cause: unknown) => {
      throw new ServiceUnavailableException(
        cause instanceof Error
          ? `SMS delivery could not reach its provider: ${cause.message}`
          : "SMS delivery could not reach its provider",
      );
    });
    const payload: unknown = await response.json().catch(() => undefined);
    if (!response.ok) {
      this.logger.error(
        `Termii rejected SMS delivery for ${this.redact(phone)} with HTTP ${response.status}.`,
      );
      throw new ServiceUnavailableException(
        "SMS delivery provider rejected the message",
      );
    }
    const providerId =
      payload &&
      typeof payload === "object" &&
      "message_id" in payload &&
      typeof payload.message_id === "string"
        ? payload.message_id
        : undefined;
    return { delivered: true, providerId };
  }

  private termiiPhone(phone: string): string {
    return phone.replace(/^\+/, "");
  }

  private redact(phone: string): string {
    const digits = phone.replace(/\D/g, "");
    return `${digits.slice(0, 4)}***${digits.slice(-2)}`;
  }
}
