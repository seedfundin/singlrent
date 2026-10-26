'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Bell,
  BellOff,
  Check,
  ChevronRight,
  CircleAlert,
  FileText,
  Home,
  Landmark,
  LoaderCircle,
  MessageCircle,
  ShieldCheck,
  Star,
  Wrench,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useAppSession, useAppNavigation } from '@/features/app/app-provider';
import { PublicHeader, Shell, Status } from '@/features/app/shell';
import { api, type ApiNotification, type ApiNotificationType } from '@/lib/api';
import { notificationDestination } from '@/lib/notification-destination';
import { useNotificationCenter } from './notification-live';

type WorkspaceRole = 'tenant' | 'landlord' | 'agent' | 'admin';
type Filter = 'all' | 'unread';

function roleFor(roles: string[]): WorkspaceRole {
  if (roles.includes('SUPER_ADMIN') || roles.includes('ADMIN')) return 'admin';
  if (roles.includes('AGENT')) return 'agent';
  if (roles.includes('LANDLORD')) return 'landlord';
  return 'tenant';
}

function iconFor(type: ApiNotificationType) {
  if (type === 'NEW_MESSAGE') return MessageCircle;
  if (type.includes('PAYMENT') || type === 'ESCROW_UPDATED' || type === 'COMMISSION_EARNED') return Landmark;
  if (type.includes('APPLICATION')) return FileText;
  if (type.includes('MAINTENANCE')) return Wrench;
  if (type.includes('REVIEW')) return Star;
  if (type.includes('VERIFICATION') || type === 'KYC_UPDATED') return ShieldCheck;
  if (type === 'LISTING_STATUS_UPDATED') return Home;
  return Bell;
}

function timeLabel(value: string) {
  const elapsed = Math.max(0, Date.now() - new Date(value).getTime());
  const minutes = Math.floor(elapsed / 60000);
  if (minutes < 1) return 'Just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Intl.DateTimeFormat('en-NG', {
    day: 'numeric',
    month: 'short',
    year: new Date(value).getFullYear() === new Date().getFullYear() ? undefined : 'numeric',
  }).format(new Date(value));
}

function mergeNotifications(
  current: ApiNotification[],
  incoming: ApiNotification[],
) {
  const byId = new Map(current.map((notification) => [notification.id, notification]));
  incoming.forEach((notification) => byId.set(notification.id, notification));
  return [...byId.values()].sort(
    (left, right) =>
      new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime(),
  );
}

export function NotificationInboxPage() {
  const { go, router } = useAppNavigation();
  const { session } = useAppSession();
  const center = useNotificationCenter();
  const [filter, setFilter] = useState<Filter>('all');
  const [items, setItems] = useState<ApiNotification[]>([]);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(Boolean(session));
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(
    async (nextPage = 1, append = false) => {
      if (!session) return;
      if (append) {
        setLoadingMore(true);
      } else {
        setLoading(true);
      }
      setError('');
      try {
        const response = await api.notifications.list(session.accessToken, {
          page: nextPage,
          pageSize: 25,
          unreadOnly: filter === 'unread',
        });
        setItems((current) =>
          append
            ? mergeNotifications(current, response.items)
            : response.items,
        );
        setPage(response.meta.page);
        setTotalPages(response.meta.totalPages);
      } catch (cause) {
        setError(
          cause instanceof Error
            ? cause.message
            : 'We could not load your notifications.',
        );
      } finally {
        setLoading(false);
        setLoadingMore(false);
      }
    },
    [filter, session],
  );

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  const visibleItems = useMemo(() => {
    const current = filter === 'unread' ? items.filter((item) => !item.readAt) : items;
    const incoming = filter === 'unread'
      ? center.recentNotifications.filter((item) => !item.readAt)
      : center.recentNotifications;
    return mergeNotifications(current, incoming);
  }, [center.recentNotifications, filter, items]);

  const openNotification = async (notification: ApiNotification) => {
    if (!session) return;
    try {
      await center.markNotificationRead(notification);
      setItems((current) =>
        current.map((item) =>
          item.id === notification.id
            ? { ...item, readAt: new Date().toISOString() }
            : item,
        ),
      );
      router.push(notificationDestination(notification, session.user.roles));
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : 'We could not open this notification.',
      );
    }
  };

  const markAllRead = async () => {
    try {
      await center.markAllNotificationsRead();
      const now = new Date().toISOString();
      setItems((current) =>
        current.map((item) => (item.readAt ? item : { ...item, readAt: now })),
      );
      if (filter === 'unread') setItems([]);
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : 'We could not mark your notifications as read.',
      );
    }
  };

  if (!session) {
    return (
      <>
        <PublicHeader go={go} />
        <main className="public">
          <section className="rental-empty">
            <Bell size={24} />
            <h1>Sign in to view notifications</h1>
            <p>Important account updates appear here.</p>
            <Button onClick={() => go('sign-in')}>Sign in</Button>
          </section>
        </main>
      </>
    );
  }

  const role = roleFor(session.user.roles);
  return (
    <Shell go={go} role={role} title="Notifications">
      <main className="page notification-inbox">
        <header className="notification-inbox-heading">
          <span>
            <small>Account updates</small>
            <h1>Notifications</h1>
            <p>Updates appear here as they happen, so you do not need to refresh.</p>
          </span>
          <div>
            {center.unreadCount > 0 && <Status>{center.unreadCount} unread</Status>}
            <Button
              variant="outline"
              disabled={center.unreadCount === 0}
              onClick={() => void markAllRead()}
            >
              <Check size={14} /> Mark all read
            </Button>
          </div>
        </header>

        <section className="notification-inbox-card">
          <div className="notification-inbox-tabs" role="tablist" aria-label="Notification filter">
            <button
              type="button"
              role="tab"
              aria-selected={filter === 'all'}
              className={filter === 'all' ? 'active' : ''}
              onClick={() => setFilter('all')}
            >
              All updates
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={filter === 'unread'}
              className={filter === 'unread' ? 'active' : ''}
              onClick={() => setFilter('unread')}
            >
              Unread {center.unreadCount > 0 && <b>{center.unreadCount > 99 ? '99+' : center.unreadCount}</b>}
            </button>
          </div>

          {error && <p className="rental-alert error"><CircleAlert size={15} /> {error}</p>}
          {loading ? (
            <div className="notification-inbox-empty">
              <LoaderCircle className="spin" size={22} />
              <p>Loading your updates…</p>
            </div>
          ) : visibleItems.length ? (
            <div className="notification-list">
              {visibleItems.map((notification) => {
                const Icon = iconFor(notification.type);
                return (
                  <button
                    key={notification.id}
                    type="button"
                    className={`notification-row${notification.readAt ? '' : ' unread'}`}
                    onClick={() => void openNotification(notification)}
                  >
                    <i aria-hidden="true"><Icon size={18} /></i>
                    <span>
                      <b>{notification.title}</b>
                      <p>{notification.body}</p>
                      <small>{timeLabel(notification.createdAt)}</small>
                    </span>
                    {!notification.readAt && <em>New</em>}
                    <ChevronRight size={17} aria-hidden="true" />
                  </button>
                );
              })}
            </div>
          ) : (
            <div className="notification-inbox-empty">
              <BellOff size={24} />
              <h2>{filter === 'unread' ? 'You are all caught up' : 'No notifications yet'}</h2>
              <p>{filter === 'unread' ? 'New updates will appear here as they arrive.' : 'Important updates about your account and homes will appear here.'}</p>
            </div>
          )}
          {!loading && page < totalPages && (
            <footer className="notification-inbox-more">
              <Button
                variant="outline"
                disabled={loadingMore}
                onClick={() => void load(page + 1, true)}
              >
                {loadingMore ? <><LoaderCircle className="spin" size={14} /> Loading…</> : 'Load earlier updates'}
              </Button>
            </footer>
          )}
        </section>
      </main>
    </Shell>
  );
}
