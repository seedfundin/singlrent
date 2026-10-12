import { BadGatewayException, Injectable, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export type DojahNinLookup =
  | { verified: true; phoneNumber?: string }
  | { verified: false; reason: string };

export type DojahPublisherMethod = 'NIN' | 'BVN';

export type DojahHostedVerification = {
  referenceId: string;
  providerStatus: string;
  method: DojahPublisherMethod | null;
  livenessVerified: boolean;
  identityVerified: boolean;
  completed: boolean;
  terminal: boolean;
  passed: boolean;
  reason: string | null;
};

@Injectable()
export class DojahVerificationService {
  constructor(private readonly configService: ConfigService) {}

  assertHostedPublisherVerificationConfigured(): void {
    this.requireCredentials('publisher verification');
  }

  async verifyNin(nin: string): Promise<DojahNinLookup> {
    const { appId, secretKey } = this.requireCredentials('NIN verification');

    const url = new URL('/api/v1/kyc/nin', this.configService.getOrThrow<string>('DOJAH_BASE_URL'));
    // Dojah requires the NIN as a query parameter. We never log this URL or the
    // returned identity record, and only retain the encrypted NIN already held by KYC.
    url.searchParams.set('nin', nin);
    const response = await fetch(url, {
      headers: {
        Authorization: secretKey,
        AppId: appId,
      },
    }).catch(() => undefined);

    if (!response) {
      throw new ServiceUnavailableException('Dojah NIN verification is temporarily unavailable');
    }
    if (response.status === 400 || response.status === 404) {
      return { verified: false, reason: 'Dojah could not find a valid NIN record.' };
    }
    if (response.status === 401 || response.status === 402 || response.status === 424 || response.status === 429 || !response.ok) {
      throw new ServiceUnavailableException('Dojah NIN verification is temporarily unavailable');
    }

    const payload = await this.readJson(response);
    const entity = this.asRecord(payload.entity);
    const phoneNumber = entity ? this.readString(entity, 'phone_number') : undefined;
    const firstName = entity ? this.readString(entity, 'first_name') : undefined;
    const lastName = entity ? this.readString(entity, 'last_name') : undefined;
    if (!entity || !firstName || !lastName) {
      throw new BadGatewayException('Dojah returned an incomplete NIN identity record');
    }
    return { verified: true, phoneNumber };
  }

  /**
   * Fetches a hosted EasyOnboard result with the server-only Dojah credential.
   * A browser callback must never be trusted as a verification decision.
   */
  async getHostedVerification(referenceId: string): Promise<DojahHostedVerification> {
    const { appId, secretKey } = this.requireCredentials('publisher verification');
    const url = new URL('/api/v1/kyc/verification', this.configService.getOrThrow<string>('DOJAH_BASE_URL'));
    url.searchParams.set('reference_id', referenceId);
    const response = await fetch(url, {
      headers: {
        Authorization: secretKey,
        AppId: appId,
      },
    }).catch(() => undefined);

    if (!response) {
      throw new ServiceUnavailableException('Dojah publisher verification is temporarily unavailable');
    }
    if (response.status === 404) {
      return {
        referenceId,
        providerStatus: 'Ongoing',
        method: null,
        livenessVerified: false,
        identityVerified: false,
        completed: false,
        terminal: false,
        passed: false,
        reason: null,
      };
    }
    if (response.status === 401 || response.status === 402 || response.status === 424 || response.status === 429 || !response.ok) {
      throw new ServiceUnavailableException('Dojah publisher verification is temporarily unavailable');
    }
    const responseBody = await this.readJson(response);
    // The live endpoint returns the verification record at the top level, while
    // the sandbox can wrap that same record in `entity`. Normalize both shapes
    // before enforcing the server-created reference ID.
    const hostedVerification = this.asRecord(responseBody.entity) ?? responseBody;
    return this.parseHostedVerification(hostedVerification, referenceId);
  }

  /** Parses a signed Dojah webhook event without retaining the sensitive payload. */
  parseHostedVerification(payload: Record<string, unknown>, expectedReferenceId?: string): DojahHostedVerification {
    const referenceId = this.readString(payload, 'reference_id');
    if (!referenceId || (expectedReferenceId && referenceId !== expectedReferenceId)) {
      throw new BadGatewayException('Dojah returned a verification with an unexpected reference');
    }

    const providerStatus = this.readString(payload, 'verification_status') ?? 'Ongoing';
    const normalizedStatus = providerStatus.toLowerCase();
    const completed = normalizedStatus === 'completed';
    const terminal = completed || normalizedStatus === 'failed' || normalizedStatus === 'abandoned';
    const data = this.asRecord(payload.data);
    const governmentData = data ? this.asRecord(data.government_data) : undefined;
    const selfie = data ? this.asRecord(data.selfie) : undefined;
    const verificationMode = this.readString(payload, 'verification_mode')?.toLowerCase() ?? '';
    const selfieMessage = selfie ? this.readString(selfie, 'message')?.toLowerCase() ?? '' : '';
    const livenessVerified = selfie?.status === true
      && (verificationMode.includes('liveness') || selfieMessage.includes('liveness'));
    const identityVerified = governmentData?.status === true;
    const method = this.readPublisherMethod(
      this.readString(payload, 'id_type'),
      this.readString(payload, 'verification_type'),
      governmentData ? Object.keys(this.asRecord(governmentData.data) ?? {}).join(' ') : undefined,
    );
    const overallPassed = payload.status === true;
    const passed = completed && overallPassed && identityVerified && livenessVerified && method !== null;
    const message = this.readString(payload, 'message');
    const reason = terminal && !passed
      ? message ?? 'Dojah could not confirm both the selected identity check and liveness.'
      : null;

    return {
      referenceId,
      providerStatus,
      method,
      livenessVerified,
      identityVerified,
      completed,
      terminal,
      passed,
      reason,
    };
  }

  private requireCredentials(feature: string): { appId: string; secretKey: string } {
    const appId = this.configService.get<string>('DOJAH_APP_ID');
    const secretKey = this.configService.get<string>('DOJAH_SECRET_KEY');
    if (!appId || !secretKey) {
      throw new ServiceUnavailableException(`Dojah ${feature} is not configured`);
    }
    return { appId, secretKey };
  }

  private async readJson(response: Response): Promise<Record<string, unknown>> {
    const body: unknown = await response.json().catch(() => undefined);
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      throw new BadGatewayException('Dojah returned an invalid NIN verification response');
    }
    return body as Record<string, unknown>;
  }

  private asRecord(value: unknown): Record<string, unknown> | undefined {
    return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : undefined;
  }

  private readString(record: Record<string, unknown>, key: string): string | undefined {
    const value = record[key];
    return typeof value === 'string' && value.trim() ? value.trim() : undefined;
  }

  private readPublisherMethod(...candidates: Array<string | undefined>): DojahPublisherMethod | null {
    const normalized = candidates.join(' ').toUpperCase();
    if (/\bBVN\b/.test(normalized)) return 'BVN';
    if (/\bNIN\b/.test(normalized)) return 'NIN';
    return null;
  }
}
