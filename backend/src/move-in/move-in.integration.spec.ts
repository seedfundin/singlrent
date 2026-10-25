import { randomUUID } from 'crypto';
import { PrismaClient } from '@prisma/client';
import { AgreementsService } from '../documents/agreements.service';
import { LedgerService } from '../financials/ledger.service';
import { PaymentsService } from '../payments/payments.service';
import { TenanciesService } from '../tenancies/tenancies.service';
import { MoveInService } from './move-in.service';
import { checklistItems } from './move-in.rules';

// This test intentionally runs only against an explicitly supplied local test DB.
const testUrl = process.env.MOVE_IN_TEST_DATABASE_URL;
const integration = testUrl && /^postgresql:\/\/(?:[^@]+@)?(?:127\.0\.0\.1|localhost):55479\//.test(testUrl) ? describe : describe.skip;
integration('move-in workflow with a real PostgreSQL database', () => {
  const db = new PrismaClient({ datasources: { db: { url: testUrl ?? 'postgresql://localhost:55479/unused' } } });
  const notification = { create: jest.fn().mockResolvedValue({}) };
  const gateway = { emitPaymentUpdate: jest.fn() };
  const audit = { record: jest.fn().mockResolvedValue({}) };
  const jobs = { enqueue: jest.fn().mockResolvedValue(undefined), add: jest.fn().mockResolvedValue({}) };
  const agreements = new AgreementsService(db as never, {} as never);
  const payments = new PaymentsService(db as never, {} as never, new LedgerService(), {} as never, jobs as never, {} as never, {} as never, notification as never, gateway as never, audit as never, {} as never, {} as never, agreements, { issueTenantPaymentReceipt: jest.fn().mockResolvedValue({}) } as never);
  const moveIn = new MoveInService(db as never, agreements, {} as never, notification as never, jobs as never, { get: () => 48 } as never);
  const tenancies = new TenanciesService(db as never, notification as never);
  afterAll(async () => { await db.$disconnect(); });

  it('holds payment until verified and tenant-signed, then starts the tenancy and permits only admin release', async () => {
    const suffix = randomUUID();
    const tenant = await db.user.create({ data: { email: `tenant-${suffix}@example.invalid`, firstName: 'Test', lastName: 'Tenant' } });
    const landlord = await db.user.create({ data: { email: `owner-${suffix}@example.invalid`, firstName: 'Test', lastName: 'Landlord' } });
    const listing = await db.listing.create({ data: { slug: `test-${suffix}`, title: 'Test home', description: 'Test', propertyType: 'APARTMENT', annualRentKobo: 100000n, bedrooms: 1, bathrooms: 1, state: 'Lagos', area: 'Test', address: 'Test', amenities: [], landlordId: landlord.id, createdById: landlord.id } });
    const application = await db.rentalApplication.create({ data: { listingId: listing.id, tenantId: tenant.id, landlordId: landlord.id, moveInDate: new Date('2025-01-01'), leaseMonths: 12, status: 'AWAITING_PAYMENT' } });
    const payment = await db.payment.create({ data: { reference: `test-${suffix}`, applicationId: application.id, listingId: listing.id, tenantId: tenant.id, landlordId: landlord.id, rentAmountKobo: 100000n, cautionFeeKobo: 20000n, platformFeeKobo: 1000n, legalFeeKobo: 10000n, totalAmountKobo: 131000n } });
    await (payments as any).recordSuccessfulPayment(payment.reference, 131000n, 'NGN', {});
    expect((await db.listing.findUniqueOrThrow({ where: { id: listing.id } })).availability).toBe('UNAVAILABLE');
    const verification = await db.moveInVerification.findUniqueOrThrow({ where: { paymentId: payment.id } });
    expect(verification.status).toBe('AWAITING_HANDOVER');
    expect(await db.tenancyAgreement.findUnique({ where: { tenancyId: verification.tenancyId } })).toBeNull();
    await expect(payments.authorizeRelease(landlord.id, payment.id)).rejects.toThrow();
    await moveIn.confirmHandover(tenant.id, verification.tenancyId);
    await moveIn.submit(tenant.id, verification.tenancyId, checklistItems.map((item) => ({ item, result: 'SATISFACTORY' })));
    await expect(tenancies.activate(landlord.id, verification.tenancyId)).rejects.toThrow('signed agreement');
    await db.guarantorForm.create({
      data: {
        tenancyId: verification.tenancyId,
        reference: `SRG-${suffix.replace(/-/g, '').slice(0, 16).toUpperCase()}`,
        status: 'EXECUTED',
        prospectiveTenantName: 'Test Tenant',
        guarantorName: 'Test Guarantor',
        knownForYears: 5,
        homeAddress: '1 Guarantor Close',
        businessAddress: '2 Business Street',
        telephone: '08000000000',
        profession: 'Engineer',
        qualification: 'BSc',
        passportObjectKey: `test/${suffix}/passport.jpg`,
        documentHash: 'a'.repeat(64),
        signatureMethod: 'ELECTRONIC_CONSENT',
        signerName: 'Test Guarantor',
        signedAt: new Date(),
        submittedByUserId: tenant.id,
      },
    });
    const request = { headers: {} } as any;
    await agreements.sign(tenant.id, verification.tenancyId, { signerName: 'Test Tenant', acceptTerms: true }, request);
    expect((await db.tenancy.findUniqueOrThrow({ where: { id: verification.tenancyId } })).status).toBe('ACTIVE');
    expect((await db.listing.findUniqueOrThrow({ where: { id: listing.id } })).availability).toBe('RENTED');
    await expect(payments.authorizeRelease(landlord.id, payment.id)).rejects.toThrow();
    await payments.authorizeReleaseByAdmin(landlord.id, payment.id);
    await expect(payments.authorizeReleaseByAdmin(landlord.id, payment.id)).rejects.toThrow();
    expect((await db.escrowRecord.findUniqueOrThrow({ where: { paymentId: payment.id } })).status).toBe('RELEASE_SCHEDULED');
  });

  it('returns every amount paid once for a valid property failure, even after the scheduled start date', async () => {
    const suffix = randomUUID();
    const tenant = await db.user.create({ data: { email: `refund-${suffix}@example.invalid`, firstName: 'Test', lastName: 'Tenant', payoutAccount: { create: { recipientCode: `recipient-${suffix}`, bankCode: '001', bankName: 'Test', accountName: 'Test Tenant', accountLast4: '1234' } } } });
    const landlord = await db.user.create({ data: { email: `refund-owner-${suffix}@example.invalid`, firstName: 'Test', lastName: 'Landlord' } });
    const listing = await db.listing.create({ data: { slug: `refund-${suffix}`, title: 'Test home', description: 'Test', propertyType: 'APARTMENT', annualRentKobo: 100000n, bedrooms: 1, bathrooms: 1, state: 'Lagos', area: 'Test', address: 'Test', amenities: [], landlordId: landlord.id, createdById: landlord.id } });
    const application = await db.rentalApplication.create({ data: { listingId: listing.id, tenantId: tenant.id, landlordId: landlord.id, moveInDate: new Date('2025-01-01'), leaseMonths: 12, status: 'AWAITING_PAYMENT' } });
    const payment = await db.payment.create({ data: { reference: `refund-${suffix}`, applicationId: application.id, listingId: listing.id, tenantId: tenant.id, landlordId: landlord.id, rentAmountKobo: 100000n, cautionFeeKobo: 20000n, platformFeeKobo: 1000n, legalFeeKobo: 10000n, totalAmountKobo: 131000n } });
    await (payments as any).recordSuccessfulPayment(payment.reference, 131000n, 'NGN', {});
    const verification = await db.moveInVerification.findUniqueOrThrow({ where: { paymentId: payment.id } });
    await moveIn.requestRefund(tenant.id, verification.tenancyId, 'Property unavailable');
    const request = await db.moveInRefundRequest.findFirstOrThrow({ where: { verificationId: verification.id } });
    const results = await Promise.allSettled([
      payments.approveMoveInRefund(landlord.id, payment.id, request.id, 'Approved after review', 'VALID_PROPERTY_FAILURE'),
      payments.approveMoveInRefund(landlord.id, payment.id, request.id, 'Approved after review', 'VALID_PROPERTY_FAILURE'),
    ]);
    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    const payouts = await db.payout.findMany({ where: { paymentId: payment.id } });
    expect(payouts).toHaveLength(2);
    expect(payouts.reduce((sum, payout) => sum + payout.amountKobo, 0n)).toBe(131000n);
    expect(payouts.every((payout) => payout.serviceFeeKobo === 0n)).toBe(true);
    expect((await db.tenancy.findUniqueOrThrow({ where: { id: verification.tenancyId } })).status).toBe('CANCELLED');
    expect((await db.listing.findUniqueOrThrow({ where: { id: listing.id } })).availability).toBe('AVAILABLE');
    await expect(payments.authorizeReleaseByAdmin(landlord.id, payment.id)).rejects.toThrow();
  });
});
