"use client";

import type { ReactNode } from "react";
import {
  ArrowLeft,
  Bell,
  Building2,
  CalendarDays,
  ChevronDown,
  ChevronRight,
  FileText,
  Heart,
  Home,
  House,
  LayoutDashboard,
  LogOut,
  MapPin,
  MessageCircle,
  MoreHorizontal,
  Search,
  Settings,
  UserRound,
  Users,
  WalletCards,
  Wrench,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAppSession } from "@/features/app/app-provider";
import { useNotificationCenter } from "@/features/notifications/notification-live";
import type { ApiSession } from "@/lib/api";
import type { View } from "@/lib/routes";

export type Navigate = (view: View, query?: Record<string, string>) => void;

export function Brand({ go }: { go: Navigate }) {
  return (
    <button className="brand" onClick={() => go("home")} aria-label="SingleRent home">
      <i><House size={17} /></i>
      <b>Single<span>Rent</span></b>
    </button>
  );
}

export function Status({
  children,
  tone = "green",
}: {
  children: ReactNode;
  tone?: "green" | "gold" | "red" | "blue" | "slate";
}) {
  return <span className={`status ${tone}`}>{children}</span>;
}

export function Img({ src, alt = "Property" }: { src: string; alt?: string }) {
  return <img className="img" src={src} alt={alt} referrerPolicy="no-referrer" />;
}

export function Back({ go, to = "home" }: { go: Navigate; to?: View }) {
  return <button className="back" onClick={() => go(to)}><ArrowLeft size={15} /> Back</button>;
}

export function Metric({
  label,
  value,
  note,
  icon,
  tone = "",
  onClick,
}: {
  label: string;
  value: string;
  note: string;
  icon?: ReactNode;
  tone?: string;
  onClick?: () => void;
}) {
  const content = <><span>{label}{icon}</span><strong>{value}</strong><small>{note}</small></>;
  if (onClick) return <button type="button" className={`metric metric-button w-full text-left ${tone}`} onClick={onClick}>{content}</button>;
  return <div className={`metric ${tone}`}>{content}</div>;
}

function destinationFor(session: ApiSession): View {
  if (session.user.roles.includes("SUPER_ADMIN") || session.user.roles.includes("ADMIN")) return "admin";
  if (session.user.roles.includes("LANDLORD")) return "landlord";
  if (session.user.roles.includes("AGENT")) return "agent";
  return "tenant";
}

export function PublicHeader({ go }: { go: Navigate }) {
  const { session, signOut } = useAppSession();
  const workspace = session ? destinationFor(session) : null;
  const isLandlord = session?.user.roles.includes("LANDLORD") ?? false;
  const isAgent = session?.user.roles.includes("AGENT") ?? false;
  return (
    <header className="head">
      <Brand go={go} />
      <nav>
        <button onClick={() => go("explore")}>Explore homes</button>
        {session ? (
          <>
            {isLandlord ? (
              <button onClick={() => go("landlord-homes")}>My homes</button>
            ) : isAgent ? (
              <button onClick={() => go("agent-homes")}>Managed homes</button>
            ) : (
              <button onClick={() => go("saved-homes")}>Saved homes</button>
            )}
            <button onClick={() => go(workspace!)}>My dashboard</button>
          </>
        ) : (
          <>
            <button onClick={() => go("home")}>How it works</button>
            <button onClick={() => go("sign-up")}>For landlords</button>
          </>
        )}
      </nav>
      {session ? (
        <div>
          <Button variant="ghost" onClick={() => go(workspace!)}><UserRound size={15} /> {session.user.firstName}</Button>
          <Button variant="outline" onClick={() => void signOut()}><LogOut size={14} /> Sign out</Button>
        </div>
      ) : (
        <div>
          <Button variant="ghost" onClick={() => go("sign-in")}>Sign in</Button>
          <Button onClick={() => go("sign-up")}>Create account</Button>
        </div>
      )}
    </header>
  );
}

function NotificationBell({ go, mobile = false }: { go: Navigate; mobile?: boolean }) {
  const { unreadCount } = useNotificationCenter();
  const label = unreadCount
    ? `${unreadCount} unread notification${unreadCount === 1 ? '' : 's'}. Open notifications.`
    : 'Notifications';
  const content = <><Bell size={17} />{unreadCount > 0 && <span className="notification-count" aria-hidden="true">{unreadCount > 99 ? '99+' : unreadCount}</span>}<span className="sr-only">{label}</span></>;
  if (mobile) return <button className="notification-bell mobile-notification-bell" onClick={() => go('notifications')} aria-label={label}>{content}</button>;
  return <Button variant="ghost" size="icon" className="notification-bell" aria-label={label} onClick={() => go('notifications')}>{content}</Button>;
}

export function Shell({
  go,
  role = "tenant",
  title,
  children,
}: {
  go: Navigate;
  role?: "tenant" | "landlord" | "agent" | "admin";
  title: string;
  children: ReactNode;
}) {
  const { session, signOut } = useAppSession();
  const displayName = session ? `${session.user.firstName} ${session.user.lastName}`.trim() : "Not signed in";
  const initials = session ? `${session.user.firstName.charAt(0)}${session.user.lastName.charAt(0)}`.toUpperCase() : "SR";
  const items = role === "tenant"
    ? [["Overview", "tenant", LayoutDashboard], ["Saved homes", "saved-homes", Heart], ["Applications", "tenant-applications", FileText], ["Payments", "transactions", WalletCards], ["Messages", "assistant", MessageCircle], ["Maintenance", "maintenance", Wrench]]
    : role === "landlord"
      ? [["Overview", "landlord", LayoutDashboard], ["My homes", "landlord-homes", Building2], ["Applications", "landlord-applications", FileText], ["Questions", "questions", MessageCircle], ["Transactions", "landlord-transactions", WalletCards]]
      : role === "agent"
        ? [["Overview", "agent", LayoutDashboard], ["Managed homes", "agent-homes", Building2], ["Applications", "agent-applications", FileText], ["Questions", "questions", MessageCircle], ["Transactions", "agent-transactions", WalletCards]]
        : [["Overview", "admin", LayoutDashboard], ["Identity reviews", "admin-identity-reviews", UserRound], ["Transactions", "admin-transactions", WalletCards], ["Payment releases", "escrow", WalletCards], ["Property moderation", "admin-listings", Building2], ["Conversations", "admin-conversations", MessageCircle], ["Admin management", "admins", Users]];

  return (
    <div className="shell">
      <aside>
        <Brand go={go} />
        <em>{role} workspace</em>
        <nav>{items.map(([name, view, Icon]) => <button key={String(name)} onClick={() => go(view as View)} className={title === name ? "active" : ""}><Icon size={17} />{name as string}</button>)}</nav>
        <div className="side-bottom">
          <button onClick={() => go("notification-settings")}><Settings size={17} /> Settings</button>
          <div className="profile">
            <i>{initials}</i>
            <button className="profile-details" onClick={() => go("profile")} disabled={!session}><b>{displayName}</b><small>{session ? role : "not signed in"}</small></button>
            {session ? <button className="profile-signout" onClick={() => void signOut()} aria-label="Sign out"><LogOut size={15} /></button> : <MoreHorizontal size={15} />}
          </div>
        </div>
      </aside>
      <main>
        <div className="app-head">
          <span>Workspace <ChevronRight size={13} /><b>{title}</b></span>
          <div><NotificationBell go={go} /><Button variant="outline" size="sm"><CalendarDays size={14} /> {new Intl.DateTimeFormat("en-NG", { month: "short", year: "numeric" }).format(new Date())} <ChevronDown size={13} /></Button></div>
        </div>
        <div className="mobile-title"><Brand go={go} /><span>{role} workspace</span><NotificationBell go={go} mobile /></div>
        {children}
        <div className="mobile-nav">
          <button onClick={() => go(role === "tenant" ? "tenant" : role === "landlord" ? "landlord" : role === "agent" ? "agent" : "admin")}><Home size={17} />Home</button>
          <button onClick={() => go("explore")}><Search size={17} />Explore</button>
          <button onClick={() => go("assistant")}><MessageCircle size={17} />Messages</button>
          <button onClick={() => go("maintenance")}><Wrench size={17} />More</button>
        </div>
      </main>
    </div>
  );
}

export { MapPin };
