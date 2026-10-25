import { agreementPdfLines, createTenancyAgreementTerms, TENANCY_AGREEMENT_VERSION } from './tenancy-agreement-template';

describe('tenancy agreement template', () => {
  const terms = createTenancyAgreementTerms({
    reference: 'SRA-TEST',
    generatedAt: new Date('2026-10-22T00:00:00.000Z'),
    premises: {
      title: 'Quiet flat',
      address: '1 Example Close',
      area: 'Surulere',
      state: 'Lagos',
      propertyType: 'SELF_CONTAINED',
      annualRentKobo: 25000000n,
      cautionFeeKobo: 5000000n,
      amenities: ['Water', 'Security'],
    },
    tenancy: { startsAt: new Date('2026-11-01T00:00:00.000Z'), endsAt: new Date('2027-10-31T00:00:00.000Z') },
    parties: {
      tenant: { name: 'Test Tenant', email: 'tenant@example.test' },
      landlord: { name: 'Test Landlord', email: 'landlord@example.test' },
      agent: null,
    },
    occupantsCount: 2,
  });

  it('records the supplied agreement as a tenant-specific versioned document', () => {
    expect(terms.version).toBe(TENANCY_AGREEMENT_VERSION);
    expect(terms.introductoryParagraphs.join(' ')).toContain('Test Tenant');
    expect(terms.sections.find((section) => section.heading.startsWith('2. TERM'))?.clauses.join(' ')).toContain('N250,000');
    expect(terms.schedules.find((section) => section.heading.startsWith('SCHEDULE 2'))?.clauses.join(' ')).toContain('becomes active');
  });

  it('includes every rendered clause in a downloadable PDF record', () => {
    const lines = agreementPdfLines(terms, ['TENANT: Test Tenant']);
    expect(lines.join(' ')).toContain('10. DEFAULT AND DISPUTE RESOLUTION');
    expect(lines.join(' ')).toContain('TENANT: Test Tenant');
  });
});
