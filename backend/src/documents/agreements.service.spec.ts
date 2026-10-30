import { ForbiddenException } from "@nestjs/common";
import { AgreementStatus } from "@prisma/client";
import { AgreementsService } from "./agreements.service";

describe("tenancy agreement signing", () => {
  it("does not allow a landlord to submit a tenant agreement signature", async () => {
    const agreement = {
      id: "agreement",
      tenancyId: "tenancy",
      status: AgreementStatus.PENDING_SIGNATURES,
      termsVersion: "single-rent-tenancy-agreement-v2",
      signatures: [],
      tenancy: {
        tenantId: "tenant",
        landlordId: "landlord",
        agentId: null,
        tenant: {
          id: "tenant",
          firstName: "Test",
          lastName: "Tenant",
          email: "tenant@example.test",
          phone: "+2348012345678",
        },
        landlord: {
          id: "landlord",
          firstName: "Test",
          lastName: "Landlord",
          email: "landlord@example.test",
          phone: "+2348098765432",
        },
        agent: null,
      },
    };
    const prisma = {
      tenancyAgreement: { findUnique: jest.fn().mockResolvedValue(agreement) },
      moveInVerification: { findUnique: jest.fn().mockResolvedValue(null) },
    };
    const service = new AgreementsService(prisma as never, {} as never);

    await expect(
      service.sign(
        "landlord",
        "tenancy",
        { signerName: "Test Landlord", acceptTerms: true },
        { headers: {} } as never,
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });
});
