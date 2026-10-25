import { BadRequestException } from '@nestjs/common';

export const PLATFORM_FEE_BPS = 500;
export const AGENT_FEE_BPS = 500;
export const LEGAL_FEE_BPS = 1000;
export const BASIS_POINTS_DIVISOR = 10_000n;

export function percentageOfKobo(amountKobo: bigint, basisPoints: number): bigint {
  if (amountKobo < 0n || !Number.isInteger(basisPoints) || basisPoints < 0) {
    throw new BadRequestException('Invalid monetary percentage');
  }
  return (amountKobo * BigInt(basisPoints)) / BASIS_POINTS_DIVISOR;
}

export function parseKobo(value: string | number | bigint, fieldName: string): bigint {
  const normalized = typeof value === 'bigint' ? value.toString() : String(value).trim();
  if (!/^\d+$/.test(normalized)) {
    throw new BadRequestException(`${fieldName} must be a whole number of kobo`);
  }
  return BigInt(normalized);
}
