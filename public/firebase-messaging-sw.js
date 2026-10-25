/* SingleRent does not cache pages or authentication data in this worker. */
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const id = event.notification.data?.notificationId;
  const target = new URL(typeof id === 'string' && /^[0-9a-f-]{36}$/i.test(id) ? `/notification-open?id=${encodeURIComponent(id)}` : '/settings/notifications', self.location.origin).href;
  event.waitUntil((async () => {
    const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    const existing = windows.find((client) => new URL(client.url).origin === self.location.origin);
    if (existing) { await existing.navigate(target); return existing.focus(); }
    return self.clients.openWindow(target);
  })());
});

importScripts('https://www.gstatic.com/firebasejs/11.10.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/11.10.0/firebase-messaging-compat.js');
const params = new URL(self.location.href).searchParams;
firebase.initializeApp({ apiKey: params.get('apiKey'), projectId: params.get('projectId'), messagingSenderId: params.get('senderId'), appId: params.get('appId') });
const titles = { NEW_MESSAGE: 'New message', INSPECTION_UPDATED: 'Inspection update', PAYMENT_SUCCESSFUL: 'Payment update', PAYMENT_FAILED: 'Payment update', ESCROW_UPDATED: 'Payment release update', VERIFICATION_UPDATED: 'Verification update', TENANCY_UPDATED: 'Tenancy update', REVIEW_UPDATED: 'Review update', LISTING_STATUS_UPDATED: 'Listing update', NEW_APPLICATION: 'Application update', ADMIN_ANNOUNCEMENT: 'SingleRent update' };
firebase.messaging().onBackgroundMessage((payload) => self.registration.showNotification(`${titles[payload.data?.type] || 'Update'} — SingleRent`, {
  body: 'Open SingleRent to view this update.',
  icon: '/singlerent-icon-192.png',
  data: { notificationId: payload.data?.notificationId },
  tag: payload.data?.notificationId ? `singlerent-${payload.data.notificationId}` : undefined,
}));
