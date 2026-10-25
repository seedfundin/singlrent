import { initializeApp, getApps } from 'firebase/app';
import {
  getMessaging,
  getToken,
  deleteToken,
  isSupported,
  onMessage,
} from 'firebase/messaging';
import { api } from '@/lib/api';

const config = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};
const vapidKey = process.env.NEXT_PUBLIC_FIREBASE_VAPID_KEY;
const webVapidKey = process.env.NEXT_PUBLIC_WEB_PUSH_VAPID_KEY;
const deviceKey = 'singlerent.push.device';

type StoredPushDevice = { id: string; userId: string; provider?: 'WEB_PUSH' };

async function registerWebPushFallback(
  accessToken: string,
  userId: string,
  previousDevice?: StoredPushDevice,
) {
  if (!webVapidKey || !('PushManager' in window)) {
    throw new Error(
      'This browser does not support notifications here. On iPhone, add SingleRent to your Home Screen and open it there.',
    );
  }

  const registration = await navigator.serviceWorker.register(
    '/web-push-sw.js',
    { scope: '/' },
  );
  const padding = '='.repeat((4 - (webVapidKey.length % 4)) % 4);
  const raw = atob(
    (webVapidKey + padding).replace(/-/g, '+').replace(/_/g, '/'),
  );
  const applicationServerKey = Uint8Array.from(raw, (character) =>
    character.charCodeAt(0),
  );
  const subscription =
    (await registration.pushManager.getSubscription()) ??
    (await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey,
    }));
  const data = subscription.toJSON();
  if (!data.endpoint || !data.keys?.p256dh || !data.keys.auth) {
    throw new Error(
      'The browser did not provide a complete push subscription.',
    );
  }

  const device = await api.notifications.registerWebPush(
    accessToken,
    {
      endpoint: data.endpoint,
      keys: { p256dh: data.keys.p256dh, auth: data.keys.auth },
    },
    navigator.userAgent.slice(0, 120),
  );
  if (previousDevice && previousDevice.id !== device.id) {
    await api.notifications.removeDevice(accessToken, previousDevice.id);
  }
  localStorage.setItem(
    deviceKey,
    JSON.stringify({ id: device.id, userId, provider: 'WEB_PUSH' }),
  );
  window.dispatchEvent(new Event('singlerent-push-change'));
}

export async function enablePush(accessToken: string, userId: string) {
  const firebaseConfigured = Object.values(config).every(Boolean) && !!vapidKey;
  if (process.env.NODE_ENV !== 'production') {
    console.info('[SingleRent] Firebase client configuration', {
      apiKeyConfigured: Boolean(config.apiKey),
      projectId: config.projectId ?? null,
      messagingSenderId: config.messagingSenderId ?? null,
      appIdConfigured: Boolean(config.appId),
      firebaseVapidConfigured: Boolean(vapidKey),
      webPushFallbackConfigured: Boolean(webVapidKey),
    });
  }
  if (!firebaseConfigured && !webVapidKey)
    throw new Error('Browser notifications have not been configured yet.');
  if (!('Notification' in window) || !('serviceWorker' in navigator))
    throw new Error('This browser does not support web notifications.');
  const previous = localStorage.getItem(deviceKey);
  let previousDevice: StoredPushDevice | undefined;
  if (previous) {
    previousDevice = JSON.parse(previous) as StoredPushDevice;
    if (previousDevice.userId !== userId)
      throw new Error(
        'This browser is still registered to another account. Sign in to that account and disable notifications first.',
      );
  }
  const permission = await Notification.requestPermission();
  if (permission !== 'granted')
    throw new Error(
      'Notifications are not enabled. Check your browser settings if you want to allow them.',
    );
  const firebaseSupported =
    firebaseConfigured && (await isSupported().catch(() => false));
  if (!firebaseSupported) {
    await registerWebPushFallback(accessToken, userId, previousDevice);
    return;
  }
  try {
    const app =
      getApps().find((item) => item.name === 'singlerent-push') ??
      initializeApp(config, 'singlerent-push');
    const query = new URLSearchParams({
      apiKey: config.apiKey!,
      projectId: config.projectId!,
      senderId: config.messagingSenderId!,
      appId: config.appId!,
    });
    const registration = await navigator.serviceWorker.register(
      `/firebase-messaging-sw.js?${query}`,
      { scope: '/' },
    );
    const token = await getToken(getMessaging(app), {
      vapidKey,
      serviceWorkerRegistration: registration,
    });
    if (!token)
      throw new Error('The browser could not register for notifications.');
    const device = await api.notifications.registerDevice(
      accessToken,
      token,
      navigator.userAgent.slice(0, 120),
    );
    if (previousDevice && previousDevice.id !== device.id)
      await api.notifications.removeDevice(accessToken, previousDevice.id);
    localStorage.setItem(deviceKey, JSON.stringify({ id: device.id, userId }));
    window.dispatchEvent(new Event('singlerent-push-change'));
  } catch (error) {
    if (!webVapidKey || !('PushManager' in window)) throw error;
    if (process.env.NODE_ENV !== 'production') {
      console.warn(
        '[SingleRent] Firebase registration failed; using standard Web Push instead.',
        error,
      );
    }
    await registerWebPushFallback(accessToken, userId, previousDevice);
  }
}

export async function disablePush(accessToken: string, userId: string) {
  const raw = localStorage.getItem(deviceKey);
  if (!raw) return;
  const device = JSON.parse(raw) as StoredPushDevice;
  if (device.userId !== userId) return;
  await api.notifications.removeDevice(accessToken, device.id);
  if (device.provider === 'WEB_PUSH' && 'serviceWorker' in navigator) {
    const registration = await navigator.serviceWorker.getRegistration('/');
    const subscription = await registration?.pushManager.getSubscription();
    await subscription?.unsubscribe();
  } else {
    const app = getApps().find((item) => item.name === 'singlerent-push');
    if (app && (await isSupported())) await deleteToken(getMessaging(app));
  }
  localStorage.removeItem(deviceKey);
  window.dispatchEvent(new Event('singlerent-push-change'));
}

export async function listenForForegroundPush(
  userId: string,
): Promise<() => void> {
  const raw = localStorage.getItem(deviceKey);
  if (!raw || !Object.values(config).every(Boolean) || !(await isSupported()))
    return () => undefined;
  const stored = JSON.parse(raw) as { userId: string; provider?: string };
  if (stored.userId !== userId || stored.provider === 'WEB_PUSH')
    return () => undefined;
  const app =
    getApps().find((item) => item.name === 'singlerent-push') ??
    initializeApp(config, 'singlerent-push');
  return onMessage(getMessaging(app), (payload) => {
    const id = payload.data?.notificationId;
    const titles: Record<string, string> = {
      NEW_MESSAGE: 'New message',
      INSPECTION_UPDATED: 'Inspection update',
      PAYMENT_SUCCESSFUL: 'Payment update',
      PAYMENT_FAILED: 'Payment update',
      ESCROW_UPDATED: 'Payment release update',
      VERIFICATION_UPDATED: 'Verification update',
      TENANCY_UPDATED: 'Tenancy update',
      REVIEW_UPDATED: 'Review update',
      LISTING_STATUS_UPDATED: 'Listing update',
      NEW_APPLICATION: 'Application update',
      ADMIN_ANNOUNCEMENT: 'SingleRent update',
    };
    void navigator.serviceWorker.getRegistration('/').then((registration) =>
      registration?.showNotification(
        `${titles[payload.data?.type || ''] || 'Update'} — SingleRent`,
        {
          body: 'Open SingleRent to view this update.',
          icon: '/singlerent-icon-192.png',
          tag: id ? `singlerent-${id}` : undefined,
          data: { notificationId: id },
        },
      ),
    );
  });
}
