import { ListingSource } from '@prisma/client';
import { PricingService } from './pricing.service';

describe('PricingService', () => {
  const pricing = new PricingService();
  const oneMillionNairaInKobo = 100_000_000n;

  it('adds the 5% platform charge and 10% legal fee to a direct landlord listing', () => {
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
      legalFeeKobo: 10_000_000n,
      cautionFeeKobo: 0n,
      totalAmountKobo: 115_000_000n,
    });
  });

  it('adds 5% platform and agent charges plus the 10% legal fee for an agent listing', () => {
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
      legalFeeKobo: 10_000_000n,
      cautionFeeKobo: 0n,
      totalAmountKobo: 120_000_000n,
    });
  });
});
