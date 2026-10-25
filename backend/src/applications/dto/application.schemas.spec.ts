import { createApplicationSchema, updateApplicationSchema } from './application.schemas';

const questionnaire = {
  employmentStatus: 'EMPLOYED',
  incomeRange: 'PREFER_NOT_TO_SAY',
  moveReason: 'RELOCATION',
  preferredContact: 'IN_APP',
  pets: 'NO',
  smoking: 'NO',
  intendedBusinessUse: 'NO',
  confirmsInformationIsAccurate: true,
} as const;

describe('application questionnaire schema', () => {
  const application = {
    listingId: '10f745ce-6010-4f14-8cd8-21812f35af65',
    moveInDate: '2026-11-01T00:00:00.000Z',
    leaseMonths: 12,
    occupantsCount: 2,
    tenantQuestionnaire: questionnaire,
  };

  it('requires the privacy-safe questionnaire snapshot at application time', () => {
    expect(createApplicationSchema.safeParse(application).success).toBe(true);
    expect(createApplicationSchema.safeParse({ ...application, tenantQuestionnaire: undefined }).success).toBe(false);
  });

  it('requires truthful confirmation and the property-fit answers', () => {
    expect(createApplicationSchema.safeParse({
      ...application,
      tenantQuestionnaire: { ...questionnaire, confirmsInformationIsAccurate: false },
    }).success).toBe(false);
    expect(createApplicationSchema.safeParse({
      ...application,
      tenantQuestionnaire: { ...questionnaire, pets: undefined },
    }).success).toBe(false);
  });

  it('permits a tenant to submit the same validated fields for a pending application update', () => {
    const { listingId: _listingId, ...update } = application;
    expect(updateApplicationSchema.safeParse(update).success).toBe(true);
  });
});
