import { PermissionKey, PrismaClient, RoleCode } from '@prisma/client';

const prisma = new PrismaClient();

const roles: Array<{ code: RoleCode; name: string; description: string }> = [
  { code: RoleCode.TENANT, name: 'Tenant', description: 'Rents and manages a home.' },
  { code: RoleCode.LANDLORD, name: 'Landlord', description: 'Owns and manages rental properties.' },
  { code: RoleCode.AGENT, name: 'Agent', description: 'Manages properties on behalf of landlords.' },
  { code: RoleCode.ADMIN, name: 'Admin', description: 'Operates assigned parts of the platform.' },
  { code: RoleCode.SUPER_ADMIN, name: 'Super Admin', description: 'Has all platform permissions.' },
];

const permissionDescriptions: Record<PermissionKey, string> = {
  USERS_VIEW: 'View users',
  USERS_EDIT: 'Edit users',
  USERS_SUSPEND: 'Suspend users',
  KYC_VIEW: 'View KYC records',
  KYC_REVIEW: 'Approve or reject KYC',
  LISTINGS_VIEW: 'View listings',
  LISTINGS_APPROVE: 'Approve listings',
  LISTINGS_REJECT: 'Reject listings',
  LISTINGS_SUSPEND: 'Suspend listings',
  TRANSACTIONS_VIEW: 'View transactions',
  ESCROW_MANAGE: 'Manage escrow',
  PAYOUTS_RELEASE: 'Release payouts',
  REFUNDS_PROCESS: 'Process refunds',
  PLATFORM_FEES_VIEW: 'View platform fees',
  AGENT_COMMISSIONS_VIEW: 'View agent commissions',
  REPORTS_VIEW: 'View reports',
  REPORTS_INVESTIGATE: 'Investigate reports',
  REPORTS_RESOLVE: 'Resolve reports',
  MAINTENANCE_MANAGE: 'Manage maintenance cases',
  REVIEWS_VIEW: 'View reviews',
  REVIEWS_MODERATE: 'Moderate or remove reviews',
  ADMINS_CREATE: 'Create administrators',
  ADMIN_PERMISSIONS_EDIT: 'Edit administrator permissions',
  AUDIT_LOGS_VIEW: 'View audit logs',
  SYSTEM_SETTINGS_MODIFY: 'Modify system settings',
};

async function main(): Promise<void> {
  for (const role of roles) {
    await prisma.role.upsert({
      where: { code: role.code },
      update: { name: role.name, description: role.description },
      create: role,
    });
  }

  for (const [key, description] of Object.entries(permissionDescriptions) as Array<
    [PermissionKey, string]
  >) {
    await prisma.permission.upsert({
      where: { key },
      update: { name: description, description },
      create: { key, name: description, description },
    });
  }

  const superAdmin = await prisma.role.findUniqueOrThrow({
    where: { code: RoleCode.SUPER_ADMIN },
  });
  const permissions = await prisma.permission.findMany({ select: { id: true } });

  await prisma.rolePermission.createMany({
    data: permissions.map((permission) => ({
      roleId: superAdmin.id,
      permissionId: permission.id,
    })),
    skipDuplicates: true,
  });

  console.info(`Seeded ${roles.length} roles and ${permissions.length} permissions.`);
}

main()
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
