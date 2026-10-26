'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { io, type Socket } from 'socket.io-client';
import { api, type ApiNotification, type ApiSession } from '@/lib/api';
import { realtimeUrl } from '@/lib/realtime';

type NotificationCenterValue = {
  unreadCount: number;
  recentNotifications: ApiNotification[];
  refreshNotifications: () => Promise<void>;
  markNotificationRead: (notification: ApiNotification) => Promise<void>;
  markAllNotificationsRead: () => Promise<void>;
};

const NotificationCenter = createContext<NotificationCenterValue | null>(null);

const emptyValue: NotificationCenterValue = {
  unreadCount: 0,
  recentNotifications: [],
  refreshNotifications: async () => undefined,
  markNotificationRead: async () => undefined,
  markAllNotificationsRead: async () => undefined,
};

function isNotification(value: unknown): value is ApiNotification {
  if (!value || typeof value !== 'object') return false;
  const item = value as Record<string, unknown>;
  return (
    typeof item.id === 'string' &&
    typeof item.type === 'string' &&
    typeof item.title === 'string' &&
    typeof item.body === 'string' &&
    typeof item.createdAt === 'string'
  );
}

function newestFirst(items: ApiNotification[]) {
  return [...items].sort(
    (left, right) =>
      new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime(),
  );
}

export function NotificationLiveProvider({
  session,
  children,
}: {
  session: ApiSession | null;
  children: ReactNode;
}) {
  const [unreadCount, setUnreadCount] = useState(0);
  const [recentNotifications, setRecentNotifications] = useState<ApiNotification[]>([]);
  const seenIds = useRef(new Set<string>());

  const refreshNotifications = useCallback(async () => {
    if (!session) {
      setUnreadCount(0);
      setRecentNotifications([]);
      return;
    }
    const [unread, recent] = await Promise.all([
      api.notifications.list(session.accessToken, {
        unreadOnly: true,
        pageSize: 100,
      }),
      api.notifications.list(session.accessToken, { pageSize: 30 }),
    ]);
    unread.items.forEach((notification) => seenIds.current.add(notification.id));
    recent.items.forEach((notification) => seenIds.current.add(notification.id));
    setUnreadCount(unread.meta.total);
    setRecentNotifications(recent.items);
  }, [session]);

  useEffect(() => {
    if (!session) {
      seenIds.current.clear();
      return;
    }
    const load = async () => {
      try {
        await refreshNotifications();
      } catch {
        // The inbox displays its own retry state. A temporary issue must not
        // disrupt the rest of the signed-in workspace.
      }
    };
    void load();

    const socket: Socket = io(`${realtimeUrl()}/realtime`, {
      auth: { token: session.accessToken },
      transports: ['websocket'],
    });
    socket.on('connect', () => void load());
    socket.on('notification:created', (incoming: unknown) => {
      if (!isNotification(incoming)) {
        void load();
        return;
      }
      if (seenIds.current.has(incoming.id)) return;
      seenIds.current.add(incoming.id);
      setRecentNotifications((current) =>
        newestFirst([incoming, ...current.filter((item) => item.id !== incoming.id)]).slice(
          0,
          30,
        ),
      );
      if (!incoming.readAt) setUnreadCount((count) => count + 1);
    });
    return () => {
      socket.disconnect();
    };
  }, [refreshNotifications, session]);

  const markNotificationRead = useCallback(
    async (notification: ApiNotification) => {
      if (!session || notification.readAt) return;
      await api.notifications.markRead(session.accessToken, notification.id);
      setRecentNotifications((current) =>
        current.map((item) =>
          item.id === notification.id
            ? { ...item, readAt: new Date().toISOString() }
            : item,
        ),
      );
      setUnreadCount((count) => Math.max(0, count - 1));
    },
    [session],
  );

  const markAllNotificationsRead = useCallback(async () => {
    if (!session || unreadCount === 0) return;
    await api.notifications.markAllRead(session.accessToken);
    const now = new Date().toISOString();
    setRecentNotifications((current) =>
      current.map((notification) =>
        notification.readAt ? notification : { ...notification, readAt: now },
      ),
    );
    setUnreadCount(0);
  }, [session, unreadCount]);

  const value: NotificationCenterValue = {
    unreadCount,
    recentNotifications,
    refreshNotifications,
    markNotificationRead,
    markAllNotificationsRead,
  };

  return (
    <NotificationCenter.Provider value={value}>
      {children}
    </NotificationCenter.Provider>
  );
}

export function useNotificationCenter() {
  return useContext(NotificationCenter) ?? emptyValue;
}
