import { createHash } from "crypto";
import { AuthService } from "./auth.service";

describe("password-reset OTP protection", () => {
  it("uses a keyed OTP hash while retaining short-lived legacy challenges", () => {
    const config = {
      getOrThrow: () => "test-secret-at-least-thirty-two-characters",
    };
    const service = new AuthService(
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      config as never,
      {} as never,
      {} as never,
    );
    const stored = service["hashVerificationCode"]("123456");
    const legacy = createHash("sha256").update("123456").digest("hex");
    expect(stored).toHaveLength(64);
    expect(stored).not.toEqual(legacy);
    expect(service["matchesVerificationCode"]("123456", stored)).toBe(true);
    expect(service["matchesVerificationCode"]("123456", legacy)).toBe(true);
    expect(service["matchesVerificationCode"]("000000", stored)).toBe(false);
  });
  it("creates six-digit codes for SMS password resets", () => {
    const service = new AuthService(
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {
        getOrThrow: () => "test-secret-at-least-thirty-two-characters",
      } as never,
      {} as never,
      {} as never,
    );
    expect(service["createOtp"]()).toMatch(/^\d{6}$/);
  });
});
