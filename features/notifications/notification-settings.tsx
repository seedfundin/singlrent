"use client";

import { useCallback, useEffect, useState } from "react";
import { BellRing, Check, CircleAlert, LoaderCircle, Mail, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAppSession } from "@/features/app/app-provider";
import { Shell, Status, type Navigate } from "@/features/app/shell";
import { api, type ApiNotification, type ApiNotificationPreference, type ApiNotificationType } from "@/lib/api";
import "@/features/rentals/rental-flow.css";
import { enablePush, disablePush } from './push-client';

type WorkspaceRole = "tenant" | "landlord" | "agent" | "admin";

const notificationTypes: Array<{ value: ApiNotificationType; label: string }> = [
  { value: "NEW_MESSAGE", label: "New message" },
  { value: "NEW_APPLICATION", label: "New application" },
  { value: "APPLICATION_APPROVED", label: "Application approved" },
  { value: "APPLICATION_REJECTED", label: "Application rejected" },
  { value: "PAYMENT_SUCCESSFUL", label: "Payment successful" },
  { value: "PAYMENT_FAILED", label: "Payment failed" },
  { value: "ESCROW_UPDATED", label: "Payment release updated" },
  { value: "COMMISSION_EARNED", label: "Commission earned" },
  { value: "MAINTENANCE_CREATED", label: "Maintenance created" },
  { value: "MAINTENANCE_UPDATED", label: "Maintenance updated" },
  { value: "LISTING_STATUS_UPDATED", label: "Listing status updated" },
  { value: "KYC_UPDATED", label: "Verification updated" },
  { value: "INCIDENT_UPDATED", label: "Concern updated" },
  { value: "CAUTION_DISPUTE_UPDATED", label: "Caution dispute updated" },
  { value: "ADMIN_INVITATION", label: "Admin invitation" },
  { value: "INSPECTION_UPDATED", label: "Inspection updates" },
  { value: "REVIEW_UPDATED", label: "Reviews" },
  { value: "VERIFICATION_UPDATED", label: "Move-in verification" },
  { value: "TENANCY_UPDATED", label: "Tenancy updates" },
  { value: "ADMIN_ANNOUNCEMENT", label: "Administrative announcements" },
];

function roleFor(roles: string[]): WorkspaceRole {
  if (roles.includes("SUPER_ADMIN") || roles.includes("ADMIN")) return "admin";
  if (roles.includes("AGENT")) return "agent";
  if (roles.includes("LANDLORD")) return "landlord";
  return "tenant";
}

function label(value: string) {
  return value.replaceAll("_", " ").toLowerCase();
}

function preferenceKey(preference: ApiNotificationPreference) {
  return `${preference.type}:${preference.channel}`;
}

export function NotificationSettings({ go }: { go: Navigate }) {
  const { session } = useAppSession();
  const [preferences, setPreferences] = useState<ApiNotificationPreference[]>([]);
  const [notifications, setNotifications] = useState<ApiNotification[]>([]);
  const [type, setType] = useState<ApiNotificationType>("NEW_MESSAGE");
  const [inApp, setInApp] = useState(true);
  const [email, setEmail] = useState(true);
  const [push, setPush] = useState(true);
  const [pushMessage, setPushMessage] = useState('');
  const [devices, setDevices] = useState<Array<{ id: string; provider: string; label: string | null; createdAt: string; lastSeenAt: string }>>([]);
  const [loading, setLoading] = useState(Boolean(session));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const role = roleFor(session?.user.roles ?? []);

  const load = useCallback(async () => {
    if (!session) {
      setPreferences([]);
      setNotifications([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const [nextPreferences, response] = await Promise.all([
        api.notifications.preferences(session.accessToken),
        api.notifications.list(session.accessToken, { pageSize: 8 }),
      ]);
      setPreferences(nextPreferences);
      setNotifications(response.items);
      api.notifications.devices(session.accessToken).then(setDevices).catch(() => setDevices([]));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to load notification settings.");
    } finally {
      setLoading(false);
    }
  }, [session]);

  useEffect(() => {
    void load();
  }, [load]);

  const savePreferences = async (nextPreferences: ApiNotificationPreference[]) => {
    if (!session) return;
    setSaving(true);
    setError(null);
    try {
      const saved = await api.notifications.updatePreferences(session.accessToken, nextPreferences);
      setPreferences(saved);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to save notification settings.");
    } finally {
      setSaving(false);
    }
  };

  const saveType = async () => {
    const withoutSelected = preferences.filter((preference) => preference.type !== type);
    await savePreferences([
      ...withoutSelected,
      { type, channel: "IN_APP", enabled: inApp },
      { type, channel: "EMAIL", enabled: email },
      { type, channel: "PUSH", enabled: push },
    ]);
  };

  const toggle = async (preference: ApiNotificationPreference) => {
    await savePreferences(preferences.map((current) => preferenceKey(current) === preferenceKey(preference) ? { ...current, enabled: !current.enabled } : current));
  };

  const markRead = async (notificationId: string) => {
    if (!session) return;
    setError(null);
    try {
      await api.notifications.markRead(session.accessToken, notificationId);
      setNotifications((current) => current.map((notification) => notification.id === notificationId ? { ...notification, readAt: new Date().toISOString() } : notification));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to mark this notification as read.");
    }
  };

  const markAllRead = async () => {
    if (!session) return;
    setError(null);
    try {
      await api.notifications.markAllRead(session.accessToken);
      const now = new Date().toISOString();
      setNotifications((current) => current.map((notification) => notification.readAt ? notification : { ...notification, readAt: now }));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to mark notifications as read.");
    }
  };

  const changeBrowserNotifications = async (enabled: boolean) => {
    if (!session) return;
    setSaving(true); setPushMessage('');
    try {
      if (enabled) await enablePush(session.accessToken, session.user.id);
      else await disablePush(session.accessToken, session.user.id);
      setPushMessage(enabled ? 'This browser is registered for notifications.' : 'Notifications are disabled for this browser.');
      setDevices(await api.notifications.devices(session.accessToken));
    } catch (cause) {
      setPushMessage(cause instanceof Error ? cause.message : 'Unable to update notifications. Please try again.');
    } finally { setSaving(false); }
  };

  if (!session) {
    return <Shell go={go} role="tenant" title="Settings"><div className="page rental-flow"><section className="rental-empty"><BellRing size={24} /><h1>Sign in to manage notifications</h1><p>Notification preferences belong to your account.</p><Button onClick={() => go("sign-in")}>Sign in</Button></section></div></Shell>;
  }

  return <Shell go={go} role={role} title="Settings"><div className="page rental-flow notification-settings-live">
    <div className="rental-flow-heading"><span><small>Account settings</small><h1>Notification preferences</h1><p>Choose how you receive each kind of update. Important account records remain available in SingleRent.</p></span></div>
    {error && <p className="rental-alert error"><CircleAlert size={15} /> {error}</p>}
    <section className="panel live-data-form"><h2>Browser notifications</h2><p>Receive important SingleRent updates on this browser. On iPhone, first add SingleRent to your Home Screen using the Share menu, then open it from there.</p><div><Button disabled={saving} onClick={() => void changeBrowserNotifications(true)}>Enable notifications</Button>{' '}<Button variant="outline" disabled={saving} onClick={() => void changeBrowserNotifications(false)}>Disable on this browser</Button></div>{pushMessage && <p role="status">{pushMessage}</p>}</section>
    {devices.length > 0 && <section className="panel live-data-form"><h2>Registered notification devices</h2>{devices.map((device) => <div key={device.id}><span>{device.label || 'Browser'} · last registered {new Date(device.lastSeenAt).toLocaleDateString()}</span>{' '}<Button variant="outline" disabled={saving} onClick={() => { setSaving(true); void api.notifications.removeDevice(session.accessToken, device.id).then(() => setDevices((items) => items.filter((item) => item.id !== device.id))).catch(() => setPushMessage('Unable to remove this device.')).finally(() => setSaving(false)); }}>Remove</Button></div>)}</section>}
    {loading ? <section className="rental-empty"><LoaderCircle className="spin" size={24} /><h1>Loading notification settings…</h1></section> : <>
      <section className="panel live-data-form"><div className="subhead"><span><small>Set a preference</small><h2>Choose delivery for one event</h2></span></div>
        <label>Event<select value={type} onChange={(event) => setType(event.target.value as ApiNotificationType)}>{notificationTypes.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select></label>
        <label className="live-checkbox"><input type="checkbox" checked={inApp} onChange={(event) => setInApp(event.target.checked)} /> In-app notification</label>
        <label className="live-checkbox"><input type="checkbox" checked={email} onChange={(event) => setEmail(event.target.checked)} /> Email notification</label>
        <label className="live-checkbox"><input type="checkbox" checked={push} onChange={(event) => setPush(event.target.checked)} /> Browser push notification</label>
        <Button disabled={saving} onClick={() => void saveType()}>{saving ? <><LoaderCircle className="spin" size={14} /> Saving…</> : <><Save size={14} /> Save preference</>}</Button>
      </section>
      <section className="panel live-dashboard-panel"><div className="subhead"><span><small>Saved preferences</small><h2>Your delivery rules</h2></span></div>
        {preferences.length ? <div className="live-dashboard-list">{preferences.map((preference) => <article key={preferenceKey(preference)} className="live-record-row"><span><b>{label(preference.type)}</b><small>{preference.channel === "EMAIL" ? <><Mail size={13} /> Email</> : <><BellRing size={13} /> {preference.channel === 'PUSH' ? 'Browser push' : 'In-app'}</>}</small></span><button type="button" className="preference-toggle" disabled={saving} onClick={() => void toggle(preference)}><Status tone={preference.enabled ? "green" : "slate"}>{preference.enabled ? "enabled" : "disabled"}</Status></button></article>)}</div> : <div className="dashboard-empty"><BellRing size={20} /><h2>No custom delivery preferences saved</h2><p>Save an event preference above to create an account-level delivery rule.</p></div>}
      </section>
      <section className="panel live-dashboard-panel"><div className="subhead"><span><small>Recent delivery</small><h2>Your notifications</h2></span>{notifications.some((notification) => !notification.readAt) && <Button variant="ghost" onClick={() => void markAllRead()}><Check size={14} /> Mark all read</Button>}</div>
        {notifications.length ? <div className="live-dashboard-list">{notifications.map((notification) => <article key={notification.id} className="live-record-row"><span><b>{notification.title}</b><small>{notification.body}</small></span>{notification.readAt ? <Status tone="slate">read</Status> : <Button variant="outline" size="sm" onClick={() => void markRead(notification.id)}>Mark read</Button>}</article>)}</div> : <div className="dashboard-empty"><BellRing size={20} /><h2>No notifications yet</h2><p>Actual notifications sent to your account will appear here.</p></div>}
      </section>
    </>}
  </div></Shell>;
}
