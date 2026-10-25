export type ListingSource = 'landlord' | 'agent';

export const PLATFORM_FEE_RATE = 0.05;
export const AGENT_FEE_RATE = 0.05;
export const LEGAL_FEE_RATE = 0.1;

export type RentalCheckout = {
  annualRent: number;
  platformFee: number;
  agentFee: number;
  legalFee: number;
  cautionFee: number;
  total: number;
  listingSource: ListingSource;
};

export function calculateRentalCheckout({
  annualRent,
  cautionFee = 0,
  listingSource,
}: {
  annualRent: number;
  cautionFee?: number;
  listingSource: ListingSource;
}): RentalCheckout {
  const platformFee = annualRent * PLATFORM_FEE_RATE;
  const agentFee = listingSource === 'agent' ? annualRent * AGENT_FEE_RATE : 0;
  const legalFee = annualRent * LEGAL_FEE_RATE;

  return {
    annualRent,
    platformFee,
    agentFee,
    legalFee,
    cautionFee,
    total: annualRent + platformFee + agentFee + legalFee + cautionFee,
    listingSource,
  };
}

export function formatNaira(value: number) {
  return `₦${new Intl.NumberFormat('en-NG', { maximumFractionDigits: 0 }).format(value)}`;
}
