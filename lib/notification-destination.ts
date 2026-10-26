import type { ApiNotification } from '@/lib/api';

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function relatedId(data: Record<string, unknown>, key: string) {
  const value = data[key];
  return typeof value === 'string' && uuid.test(value) ? value : null;
}

/**
 * Notification payloads only contain record IDs. Routes are selected here from
 * known application paths, never from a URL supplied by a notification.
 */
export function notificationDestination(
  notification: ApiNotification,
  roles: string[],
) {
  const data = notification.data && typeof notification.data === 'object'
    ? notification.data
    : {};
  const admin = roles.includes('SUPER_ADMIN') || roles.includes('ADMIN');
  const manager = roles.includes('AGENT')
    ? 'agent'
    : roles.includes('LANDLORD')
      ? 'landlord'
      : 'dashboard';
  const tenancyId = relatedId(data, 'tenancyId');
  const paymentId = relatedId(data, 'paymentId');
  const inspectionId = relatedId(data, 'inspectionId');

  if (admin && (tenancyId || paymentId)) return '/admin/escrow';
  if (relatedId(data, 'escalationId')) return '/landlord/list-a-property/questions';
  if (relatedId(data, 'conversationId')) {
    return `/property-assistant?conversation=${encodeURIComponent(relatedId(data, 'conversationId')!)}`;
  }
  if (inspectionId) return `/${manager}#inspection-${inspectionId}`;
  if (relatedId(data, 'reviewId')) return '/reviews';
  if (
    tenancyId ||
    paymentId ||
    [
      'PAYMENT_SUCCESSFUL',
      'PAYMENT_FAILED',
      'ESCROW_UPDATED',
      'COMMISSION_EARNED',
    ].includes(notification.type)
  ) {
    const target = tenancyId
      ? `#${notification.type === 'TENANCY_UPDATED' ? 'agreement' : 'tenancy'}-${tenancyId}`
      : paymentId
        ? `#payment-${paymentId}`
        : '';
    return `/${manager}/transactions${target}`;
  }
  if (
    [
      'NEW_APPLICATION',
      'APPLICATION_APPROVED',
      'APPLICATION_REJECTED',
    ].includes(notification.type)
  ) {
    return `/${manager}/applications`;
  }
  if (['MAINTENANCE_CREATED', 'MAINTENANCE_UPDATED'].includes(notification.type)) {
    return manager === 'dashboard' ? '/dashboard/maintenance' : `/${manager}`;
  }
  if (notification.type === 'CAUTION_DISPUTE_UPDATED') return '/caution-deposit';
  if (notification.type === 'INCIDENT_UPDATED') return '/reports';
  if (notification.type === 'KYC_UPDATED') return '/verify-identity';
  if (notification.type === 'VERIFICATION_UPDATED') {
    return manager === 'dashboard' ? '/verify-identity' : '/verify-publisher';
  }
  if (notification.type === 'LISTING_STATUS_UPDATED' && manager !== 'dashboard') {
    return `/${manager}/homes`;
  }
  return '/notifications';
}
