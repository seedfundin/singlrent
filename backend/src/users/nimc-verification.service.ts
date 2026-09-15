import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash, randomUUID } from 'crypto';

@Injectable()
export class NimcVerificationService {
  constructor(private readonly configService: ConfigService) {}

  async submit(nin: string, phone: string): Promise<{ providerReference: string; submittedToProvider: boolean }> {
    const url = this.configService.get<string>('NIMC_VERIFICATION_URL');
    const apiKey = this.configService.get<string>('NIMC_VERIFICATION_API_KEY');
    const providerReference = `nimc_${randomUUID()}`;

    if (!url || !apiKey) {
      return { providerReference, submittedToProvider: false };
    }

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${apiKey}`,
        'content-type': 'application/json',
        'idempotency-key': providerReference,
      },
      body: JSON.stringify({ nin, phone, reference: providerReference }),
    }).catch(() => undefined);

    if (!response?.ok) {
      throw new ServiceUnavailableException('NIN verification service is temporarily unavailable');
    }
    return { providerReference, submittedToProvider: true };
  }

  fingerprint(nin: string): string {
    return createHash('sha256').update(nin).digest('hex');
  }
}
