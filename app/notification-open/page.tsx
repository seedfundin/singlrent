"use client";

import { useEffect, useState } from 'react';
import { api, sessionStore, type ApiNotification } from '@/lib/api';

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Routes are built here from known application paths, never from a URL in a push payload.
function destination(notification: ApiNotification, roles: string[]): string {
  const data = notification.data && typeof notification.data === 'object' ? notification.data : {};
  const id = (key: string) => typeof data[key] === 'string' && uuid.test(data[key] as string) ? data[key] as string : null;
  const admin = roles.includes('SUPER_ADMIN') || roles.includes('ADMIN');
  if (admin && (id('tenancyId') || id('paymentId'))) return '/admin/escrow';
  const manager = roles.includes('AGENT') ? 'agent' : roles.includes('LANDLORD') ? 'landlord' : 'dashboard';
  if (id('escalationId')) return '/landlord/list-a-property/questions';
  if (id('conversationId')) return `/property-assistant?conversation=${encodeURIComponent(id('conversationId')!)}`;
  if (id('inspectionId')) return `/${manager}#inspection-${id('inspectionId')}`;
  if (id('reviewId')) return '/reviews';
  if (id('tenancyId') || id('paymentId') || ['PAYMENT_SUCCESSFUL', 'PAYMENT_FAILED', 'ESCROW_UPDATED', 'COMMISSION_EARNED'].includes(notification.type)) {
    const target = id('tenancyId') ? `#${notification.type === 'TENANCY_UPDATED' ? 'agreement' : 'tenancy'}-${id('tenancyId')}` : id('paymentId') ? `#payment-${id('paymentId')}` : '';
    return `/${manager}/transactions${target}`;
  }
  if (['NEW_APPLICATION', 'APPLICATION_APPROVED', 'APPLICATION_REJECTED'].includes(notification.type)) return `/${manager}/applications`;
  if (notification.type === 'LISTING_STATUS_UPDATED' && manager !== 'dashboard') return `/${manager}/homes`;
  return '/settings/notifications';
}

export default function NotificationOpenPage() {
  const [error, setError] = useState('');
  useEffect(() => {
    const id = new URLSearchParams(window.location.search).get('id');
    if (!id || !uuid.test(id)) { setError('This notification link is invalid.'); return; }
    const session = sessionStore.get();
    if (!session) {
      sessionStorage.setItem('singlerent.notification.open', id);
      window.location.replace('/sign-in');
      return;
    }
    if (!session.user.emailVerified) {
      sessionStorage.setItem('singlerent.notification.open', id);
      window.location.replace('/verify-email');
      return;
    }
    let active = true;
    api.notifications.get(session.accessToken, id).then((notification) => {
      if (active) window.location.replace(destination(notification, session.user.roles));
    }).catch(() => { if (active) setError('This notification is unavailable for this account.'); });
    return () => { active = false; };
  }, []);
  return <main style={{ padding: '3rem' }}><h1>SingleRent notification</h1><p>{error || 'Opening your update…'}</p>{error && <a href="/settings/notifications">View your notifications</a>}</main>;
}
