self.addEventListener('push', (event) => {
  let notificationId = ''; let type = '';
  try { const data = event.data?.json(); notificationId = data?.notificationId || ''; type = data?.type || ''; } catch { /* Generic message only. */ }
  const titles = { NEW_MESSAGE: 'New message', INSPECTION_UPDATED: 'Inspection update', PAYMENT_SUCCESSFUL: 'Payment update', PAYMENT_FAILED: 'Payment update', ESCROW_UPDATED: 'Payment release update', VERIFICATION_UPDATED: 'Verification update', TENANCY_UPDATED: 'Tenancy update', REVIEW_UPDATED: 'Review update', LISTING_STATUS_UPDATED: 'Listing update', NEW_APPLICATION: 'Application update', ADMIN_ANNOUNCEMENT: 'SingleRent update' };
  event.waitUntil(self.registration.showNotification(`${titles[type] || 'Update'} — SingleRent`, {
    body: 'Open SingleRent to view this update.',
    icon: '/singlerent-icon-192.png',
    data: { notificationId },
    tag: notificationId ? `singlerent-${notificationId}` : undefined,
  }));
});
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil((async () => {
    const id = event.notification.data?.notificationId;
    const target = new URL(typeof id === 'string' && /^[0-9a-f-]{36}$/i.test(id) ? `/notification-open?id=${encodeURIComponent(id)}` : '/notifications', self.location.origin).href;
    const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    const client = windows.find((entry) => new URL(entry.url).origin === self.location.origin);
    if (client) { await client.navigate(target); return client.focus(); }
    return self.clients.openWindow(target);
  })());
});
