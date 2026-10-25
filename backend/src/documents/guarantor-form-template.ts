export const GUARANTOR_FORM_VERSION = 'single-rent-guarantor-form-v2';

export type RenderedGuarantorForm = {
  version: typeof GUARANTOR_FORM_VERSION;
  title: string;
  reference: string;
  generatedAt: string;
  statements: string[];
  guarantor: {
    name: string;
    homeAddress: string;
    businessAddress: string;
    telephone: string;
    profession: string;
    qualification: string;
    passportPhotograph: string;
  };
  signature: { signerName: string | null; signedAt: string | null; method: string | null };
};

export function createGuarantorFormTerms(input: {
  reference: string;
  generatedAt: Date;
  prospectiveTenantName: string;
  propertyTitle: string;
  propertyAddress?: string | null;
  guarantorName: string;
  knownForYears: number;
  homeAddress: string;
  businessAddress: string;
  telephone: string;
  profession: string;
  qualification: string;
  signature?: { signerName: string; signedAt: Date; method: string } | null;
}): RenderedGuarantorForm {
  const propertyDescription = [input.propertyTitle, input.propertyAddress].filter((value): value is string => Boolean(value?.trim())).join(', ');
  const knownFor = `${input.knownForYears} year${input.knownForYears === 1 ? '' : 's'}`;
  return {
    version: GUARANTOR_FORM_VERSION,
    title: 'SingleRent Guarantor Form',
    reference: input.reference,
    generatedAt: input.generatedAt.toISOString(),
    statements: [
      'Dear Sir,',
      `Name of prospective tenant: ${input.prospectiveTenantName}.`,
      `I understand that the above named person wishes to rent a property at ${propertyDescription || 'the property recorded in the SingleRent booking'} through SingleRent.`,
      `I have known him/her for ${knownFor} and I comment on his/her reputation.`,
      'I therefore stand him/her as a guarantor. In case there is any misconduct, I understand that I may be called upon in line with the final tenancy agreement and applicable law. This form does not remove any legal right or defence available to the guarantor.',
      'Passport photograph: a current passport photograph has been securely submitted with this form.',
      'Caution: It is dangerous to introduce a person who is not well known to you. Independent legal advice may be appropriate before signing.',
    ],
    guarantor: {
      name: input.guarantorName,
      homeAddress: input.homeAddress,
      businessAddress: input.businessAddress,
      telephone: input.telephone,
      profession: input.profession,
      qualification: input.qualification,
      passportPhotograph: 'Securely uploaded to SingleRent',
    },
    signature: input.signature
      ? { signerName: input.signature.signerName, signedAt: input.signature.signedAt.toISOString(), method: input.signature.method }
      : { signerName: null, signedAt: null, method: null },
  };
}

export function guarantorFormPdfLines(terms: RenderedGuarantorForm): string[] {
  return [
    `Guarantor form reference: ${terms.reference}`,
    `Generated: ${terms.generatedAt}`,
    ...terms.statements,
    'PERSONAL DATA OF THE GUARANTOR',
    `Name: ${terms.guarantor.name}`,
    `Home address: ${terms.guarantor.homeAddress}`,
    `Business/office address: ${terms.guarantor.businessAddress}`,
    `Telephone: ${terms.guarantor.telephone}`,
    `Profession: ${terms.guarantor.profession}`,
    `Qualification: ${terms.guarantor.qualification}`,
    `Passport photograph: ${terms.guarantor.passportPhotograph}`,
    `Signature: ${terms.signature.signerName ?? 'Pending'}`,
    `Signature method: ${terms.signature.method ?? 'Pending'}`,
    `Date: ${terms.signature.signedAt ?? 'Pending'}`,
  ];
}
