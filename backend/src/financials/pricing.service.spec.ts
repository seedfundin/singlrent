import { ListingSource } from '@prisma/client';
import { PricingService } from './pricing.service';

describe('PricingService', () => {
  const pricing = new PricingService();
  const oneMillionNairaInKobo = 100_000_000n;

  it('adds only the 5% platform charge to a direct landlord listing', () => {
    expect(
      pricing.calculateRental({
        annualRentKobo: oneMillionNairaInKobo,
        cautionFeeKobo: 0n,
        source: ListingSource.LANDLORD,
      }),
    ).toEqual({
      rentAmountKobo: oneMillionNairaInKobo,
      platformFeeKobo: 5_000_000n,
      agentFeeKobo: 0n,
      cautionFeeKobo: 0n,
      totalAmountKobo: 105_000_000n,
    });
  });

  it('adds separate 5% platform and agent charges for an agent listing', () => {
    expect(
      pricing.calculateRental({
        annualRentKobo: oneMillionNairaInKobo,
        cautionFeeKobo: 0n,
        source: ListingSource.AGENT,
      }),
    ).toEqual({
      rentAmountKobo: oneMillionNairaInKobo,
      platformFeeKobo: 5_000_000n,
      agentFeeKobo: 5_000_000n,
      cautionFeeKobo: 0n,
      totalAmountKobo: 110_000_000n,
    });
  });
});
