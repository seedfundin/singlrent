import { Injectable } from '@nestjs/common';
import { ListingSource } from '@prisma/client';
import { AGENT_FEE_BPS, PLATFORM_FEE_BPS, percentageOfKobo } from '../common/finance/money';

export interface RentalPricing {
  rentAmountKobo: bigint;
  platformFeeKobo: bigint;
  agentFeeKobo: bigint;
  cautionFeeKobo: bigint;
  totalAmountKobo: bigint;
}

@Injectable()
export class PricingService {
  calculateRental(input: { annualRentKobo: bigint; cautionFeeKobo: bigint; source: ListingSource }): RentalPricing {
    const platformFeeKobo = percentageOfKobo(input.annualRentKobo, PLATFORM_FEE_BPS);
    const agentFeeKobo = input.source === ListingSource.AGENT ? percentageOfKobo(input.annualRentKobo, AGENT_FEE_BPS) : 0n;
    return {
      rentAmountKobo: input.annualRentKobo,
      platformFeeKobo,
      agentFeeKobo,
      cautionFeeKobo: input.cautionFeeKobo,
      totalAmountKobo: input.annualRentKobo + platformFeeKobo + agentFeeKobo + input.cautionFeeKobo,
    };
  }
}
