export const viewPaths = {
  home: '/',
  explore: '/homes',
  listing: '/homes/lekki-phase-1/bright-2-bedroom-apartment',
  assistant: '/property-assistant',
  'sign-in': '/sign-in',
  'sign-up': '/sign-up',
  'account-type': '/sign-up/account-type',
  kyc: '/verify-identity',
  apply: '/homes/lekki-phase-1/bright-2-bedroom-apartment/apply',
  payment: '/homes/lekki-phase-1/bright-2-bedroom-apartment/payment',
  confirmation: '/booking-confirmed',
  tenant: '/dashboard',
  maintenance: '/dashboard/maintenance',
  landlord: '/landlord',
  wizard: '/landlord/list-a-property',
  questions: '/landlord/list-a-property/questions',
  admin: '/admin',
  escrow: '/admin/escrow',
  states: '/admin/system-states',
  admins: '/admin/admins',
  permissions: '/admin/admins/permissions',
  agent: '/agent',
  pricing: '/agent/fees',
  reviews: '/reviews',
  incidents: '/reports',
  deposit: '/caution-deposit',
  notifications: '/settings/notifications',
  adminops: '/admin/operations',
} as const;

export type View = keyof typeof viewPaths;

export const staticRouteParams = Object.values(viewPaths)
  .filter((path) => path !== '/')
  .map((path) => ({ slug: path.slice(1).split('/') }));

export function viewForPath(pathname: string): View | undefined {
  return (Object.entries(viewPaths) as [View, string][]).find(
    ([, path]) => path === pathname,
  )?.[0];
}
