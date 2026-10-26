"use client";

import { useEffect, useState } from 'react';
import { api, sessionStore } from '@/lib/api';
import { notificationDestination } from '@/lib/notification-destination';

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

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
    api.notifications.get(session.accessToken, id).then(async (notification) => {
      if (!notification.readAt) await api.notifications.markRead(session.accessToken, notification.id).catch(() => undefined);
      if (active) window.location.replace(notificationDestination(notification, session.user.roles));
    }).catch(() => { if (active) setError('This notification is unavailable for this account.'); });
    return () => { active = false; };
  }, []);
  return <main style={{ padding: '3rem' }}><h1>SingleRent notification</h1><p>{error || 'Opening your update…'}</p>{error && <a href="/notifications">View your notifications</a>}</main>;
}
