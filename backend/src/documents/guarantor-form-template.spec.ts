import { createGuarantorFormTerms, guarantorFormPdfLines, GUARANTOR_FORM_VERSION } from './guarantor-form-template';

describe('SingleRent guarantor form template', () => {
  const terms = createGuarantorFormTerms({
    reference: 'SRG-TEST',
    generatedAt: new Date('2026-10-22T00:00:00.000Z'),
    prospectiveTenantName: 'Test Tenant',
    propertyTitle: 'Test Apartment',
    propertyAddress: '1 Test Close, Lagos',
    guarantorName: 'Test Guarantor',
    knownForYears: 4,
    homeAddress: '1 Home Address',
    businessAddress: '2 Office Address',
    telephone: '08000000000',
    profession: 'Teacher',
    qualification: 'B.Ed',
  });

  it('uses SingleRent branding and preserves every required guarantor field', () => {
    expect(terms.version).toBe(GUARANTOR_FORM_VERSION);
    expect(terms.title).toBe('SingleRent Guarantor Form');
    expect(terms.statements.join(' ')).toContain('Test Tenant');
    expect(terms.statements.join(' ')).toContain('Test Apartment');
    expect(terms.statements.join(' ')).toContain('Dear Sir');
    expect(terms.statements.join(' ')).toContain('dangerous to introduce a person who is not well known to you');
    expect(terms.guarantor).toMatchObject({
      name: 'Test Guarantor',
      homeAddress: '1 Home Address',
      businessAddress: '2 Office Address',
      telephone: '08000000000',
      profession: 'Teacher',
      qualification: 'B.Ed',
    });
  });

  it('includes a complete downloadable record, including passport and signature fields', () => {
    const lines = guarantorFormPdfLines(terms).join(' ');
    expect(lines).toContain('Passport photograph');
    expect(lines).toContain('Signature: Pending');
    expect(lines).toContain('Qualification: B.Ed');
  });
});
