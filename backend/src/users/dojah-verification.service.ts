import { BadGatewayException, Injectable, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export type DojahNinLookup =
  | { verified: true; phoneNumber: string }
  | { verified: false; reason: string };

@Injectable()
export class DojahVerificationService {
  constructor(private readonly configService: ConfigService) {}

  async verifyNin(nin: string): Promise<DojahNinLookup> {
    const appId = this.configService.get<string>('DOJAH_APP_ID');
    const secretKey = this.configService.get<string>('DOJAH_SECRET_KEY');
    if (!appId || !secretKey) {
      throw new ServiceUnavailableException('Dojah NIN verification is not configured');
    }

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
    if (!entity || !firstName || !lastName || !phoneNumber) {
      throw new BadGatewayException('Dojah returned an incomplete NIN identity record');
    }
    return { verified: true, phoneNumber };
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
}
