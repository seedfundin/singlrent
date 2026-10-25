export type IdentityName = {
  firstName: string;
  lastName: string;
  middleName?: string;
};

export type IdentityNameMatch = {
  status: 'MATCHED' | 'MISMATCHED' | 'UNAVAILABLE';
  reason: string | null;
};

/**
 * Compare legal names without persisting a Dojah response. This deliberately
 * tolerates only presentation differences (case, accents, spaces and ordinary
 * punctuation); it does not use fuzzy matching, initials or partial names.
 */
export function compareIdentityName(
  account: Pick<IdentityName, 'firstName' | 'lastName'>,
  provider: IdentityName | undefined,
): IdentityNameMatch {
  if (!provider?.firstName || !provider.lastName) {
    return {
      status: 'UNAVAILABLE',
      reason: 'Dojah did not return the identity name required to complete automatic verification.',
    };
  }

  const firstNameMatches = normalizeLegalName(account.firstName) === normalizeLegalName(provider.firstName);
  const lastNameMatches = normalizeLegalName(account.lastName) === normalizeLegalName(provider.lastName);
  if (firstNameMatches && lastNameMatches) return { status: 'MATCHED', reason: null };

  return {
    status: 'MISMATCHED',
    reason: 'The name on the SingleRent account does not match the name returned by Dojah.',
  };
}

function normalizeLegalName(value: string): string {
  return value
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\p{L}\p{N}]+/gu, '')
    .trim()
    .toLocaleUpperCase('en-NG');
}
