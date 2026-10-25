import { BadGatewayException, Injectable, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { IdentityName } from './identity-name-match';

export type DojahIdentityMethod = 'NIN' | 'BVN';

export type DojahIdentityLookup =
  | { verified: true; method: DojahIdentityMethod; identityName: IdentityName; phoneNumber?: string }
  | { verified: false; reason: string };

export type DojahNinLookup = DojahIdentityLookup;
export type DojahPublisherMethod = DojahIdentityMethod;

export type DojahHostedVerification = {
  referenceId: string;
  providerStatus: string;
  method: DojahPublisherMethod | null;
  livenessVerified: boolean;
  identityVerified: boolean;
  completed: boolean;
  terminal: boolean;
  passed: boolean;
  identityName?: IdentityName;
  reason: string | null;
};

@Injectable()
export class DojahVerificationService {
  constructor(private readonly configService: ConfigService) {}

  assertHostedPublisherVerificationConfigured(): void {
    this.requireCredentials('publisher verification');
  }

  async verifyNin(nin: string): Promise<DojahNinLookup> {
    return this.verifyIdentity('NIN', nin);
  }

  async verifyBvn(bvn: string): Promise<DojahIdentityLookup> {
    return this.verifyIdentity('BVN', bvn);
  }

  async verifyIdentity(method: DojahIdentityMethod, identifier: string): Promise<DojahIdentityLookup> {
    const { appId, secretKey } = this.requireCredentials(`${method} verification`);

    const path = method === 'NIN' ? '/api/v1/kyc/nin' : '/api/v1/kyc/bvn/full';
    const parameter = method.toLowerCase();
    const url = new URL(path, this.configService.getOrThrow<string>('DOJAH_BASE_URL'));
    // Dojah requires the identifier as a query parameter. We never log this URL
    // or the returned identity record, and only retain the encrypted identifier.
    url.searchParams.set(parameter, identifier);
    const response = await fetch(url, {
      headers: {
        Authorization: secretKey,
        AppId: appId,
      },
    }).catch(() => undefined);

    if (!response) {
      throw new ServiceUnavailableException(`Dojah ${method} verification is temporarily unavailable`);
    }
    if (response.status === 400 || response.status === 404) {
      return { verified: false, reason: `Dojah could not find a valid ${method} record.` };
    }
    if (response.status === 401 || response.status === 402 || response.status === 424 || response.status === 429 || !response.ok) {
      throw new ServiceUnavailableException(`Dojah ${method} verification is temporarily unavailable`);
    }

    const payload = await this.readJson(response);
    const entity = this.asRecord(payload.entity);
    const phoneNumber = entity ? this.readString(entity, 'phone_number') : undefined;
    const firstName = entity ? this.readString(entity, 'first_name') : undefined;
    const lastName = entity ? this.readString(entity, 'last_name') : undefined;
    const middleName = entity ? this.readString(entity, 'middle_name') : undefined;
    if (!entity || !firstName || !lastName) {
      throw new BadGatewayException(`Dojah returned an incomplete ${method} identity record`);
    }
    return { verified: true, method, identityName: { firstName, lastName, middleName }, phoneNumber };
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
        identityName: undefined,
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
    const identityName = this.readHostedIdentityName(data, governmentData, method);
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
      identityName,
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

  /**
   * EasyOnboard responses differ slightly between Dojah flow versions. Names
   * are read only while comparing them, then discarded with the provider body.
   */
  private readHostedIdentityName(
    data: Record<string, unknown> | undefined,
    governmentData: Record<string, unknown> | undefined,
    method: DojahPublisherMethod | null,
  ): IdentityName | undefined {
    const id = data ? this.asRecord(data.id) : undefined;
    const idData = id ? this.asRecord(id.data) : undefined;
    const governmentResult = governmentData ? this.asRecord(governmentData.data) : undefined;
    const methodResult = governmentResult && method
      ? this.asRecord(governmentResult[method.toLowerCase()])
        ?? this.asRecord(governmentResult[method])
      : undefined;
    return this.readIdentityName(idData ? this.asRecord(idData.id_data) : undefined)
      ?? this.readIdentityName(methodResult)
      ?? this.readIdentityName(methodResult ? this.asRecord(methodResult.entity) : undefined)
      ?? this.readIdentityName(methodResult ? this.asRecord(methodResult.data) : undefined)
      ?? this.readIdentityName(governmentResult);
  }

  private readIdentityName(record: Record<string, unknown> | undefined): IdentityName | undefined {
    if (!record) return undefined;
    const firstName = this.readString(record, 'first_name');
    const lastName = this.readString(record, 'last_name');
    if (!firstName || !lastName) return undefined;
    const middleName = this.readString(record, 'middle_name');
    return { firstName, lastName, middleName };
  }
}
