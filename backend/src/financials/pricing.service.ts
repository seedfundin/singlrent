import { Injectable } from '@nestjs/common';
import { ListingSource } from '@prisma/client';
import { AGENT_FEE_BPS, LEGAL_FEE_BPS, PLATFORM_FEE_BPS, percentageOfKobo } from '../common/finance/money';

export interface RentalPricing {
  rentAmountKobo: bigint;
  platformFeeKobo: bigint;
  agentFeeKobo: bigint;
  legalFeeKobo: bigint;
  cautionFeeKobo: bigint;
  totalAmountKobo: bigint;
}

@Injectable()
export class PricingService {
  calculateRental(input: { annualRentKobo: bigint; cautionFeeKobo: bigint; source: ListingSource }): RentalPricing {
    const platformFeeKobo = percentageOfKobo(input.annualRentKobo, PLATFORM_FEE_BPS);
    const agentFeeKobo = input.source === ListingSource.AGENT ? percentageOfKobo(input.annualRentKobo, AGENT_FEE_BPS) : 0n;
    const legalFeeKobo = percentageOfKobo(input.annualRentKobo, LEGAL_FEE_BPS);
    return {
      rentAmountKobo: input.annualRentKobo,
      platformFeeKobo,
      agentFeeKobo,
      legalFeeKobo,
      cautionFeeKobo: input.cautionFeeKobo,
      totalAmountKobo: input.annualRentKobo + platformFeeKobo + agentFeeKobo + legalFeeKobo + input.cautionFeeKobo,
    };
  }
}
