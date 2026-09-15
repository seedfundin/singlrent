import { BadGatewayException, Injectable, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

type PaystackObject = Record<string, unknown>;

function asObject(value: unknown): PaystackObject | undefined {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as PaystackObject) : undefined;
}

function asString(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

function asNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isSafeInteger(value) ? value : undefined;
}

@Injectable()
export class PaystackService {
  constructor(private readonly configService: ConfigService) {}

  async initializeTransaction(input: { email: string; amountKobo: bigint; reference: string; callbackUrl?: string }) {
    const data = await this.request('/transaction/initialize', {
      method: 'POST',
      body: JSON.stringify({
        email: input.email,
        amount: input.amountKobo.toString(),
        reference: input.reference,
        callback_url: input.callbackUrl,
        currency: 'NGN',
      }),
    });
    const authorizationUrl = asString(data.authorization_url);
    const accessCode = asString(data.access_code);
    const reference = asString(data.reference);
    if (!authorizationUrl || !accessCode || !reference) {
      throw new BadGatewayException('Paystack returned an invalid transaction initialization response');
    }
    return { authorizationUrl, accessCode, reference };
  }

  async verifyTransaction(reference: string) {
    const data = await this.request(`/transaction/verify/${encodeURIComponent(reference)}`, { method: 'GET' });
    const amount = asNumber(data.amount);
    const status = asString(data.status);
    const verifiedReference = asString(data.reference);
    const currency = asString(data.currency);
    if (amount === undefined || !status || !verifiedReference || !currency) {
      throw new BadGatewayException('Paystack returned an invalid transaction verification response');
    }
    return { amountKobo: BigInt(amount), status, reference: verifiedReference, currency, payload: data };
  }

  async createTransfer(input: { recipientCode: string; amountKobo: bigint; reference: string; reason: string }) {
    const data = await this.request('/transfer', {
      method: 'POST',
      body: JSON.stringify({
        source: 'balance',
        amount: input.amountKobo.toString(),
        recipient: input.recipientCode,
        reference: input.reference,
        reason: input.reason,
        currency: 'NGN',
      }),
    });
    const transferCode = asString(data.transfer_code);
    const reference = asString(data.reference);
    const status = asString(data.status);
    if (!transferCode || !reference || !status) {
      throw new BadGatewayException('Paystack returned an invalid transfer response');
    }
    return { transferCode, reference, status };
  }

  private async request(path: string, init: RequestInit): Promise<PaystackObject> {
    const secret = this.configService.get<string>('PAYSTACK_SECRET_KEY');
    if (!secret) {
      throw new ServiceUnavailableException('Paystack is not configured');
    }
    const baseUrl = this.configService.getOrThrow<string>('PAYSTACK_BASE_URL').replace(/\/$/, '');
    const response = await fetch(`${baseUrl}${path}`, {
      ...init,
      headers: { authorization: `Bearer ${secret}`, 'content-type': 'application/json', ...init.headers },
    }).catch(() => undefined);
    if (!response) {
      throw new ServiceUnavailableException('Unable to reach Paystack');
    }
    const payload: unknown = await response.json().catch(() => undefined);
    const root = asObject(payload);
    const data = root ? asObject(root.data) : undefined;
    if (!response.ok || !root?.status || !data) {
      throw new BadGatewayException(asString(root?.message) ?? 'Paystack request failed');
    }
    return data;
  }
}
