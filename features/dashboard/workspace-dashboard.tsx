"use client";

import { useCallback, useEffect, useState } from "react";
import {
  ArrowRight,
  Building2,
  CircleAlert,
  FileText,
  Heart,
  House,
  Landmark,
  LoaderCircle,
  MessageCircle,
  Plus,
  Search,
  WalletCards,
  Wrench,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAppSession } from "@/features/app/app-provider";
import { InspectionDashboard } from "@/features/inspections/inspections";
import { Metric, Shell, Status, type Navigate } from "@/features/app/shell";
import { api, type ApiApplicationStatus, type ApiDashboard, type ApiListing, type ApiRentalApplication } from "@/lib/api";
import { formatNaira } from "@/lib/pricing";

type WorkspaceRole = "tenant" | "landlord" | "agent";

type DashboardData = {
  summary: ApiDashboard;
  listings: ApiListing[];
  applications: ApiRentalApplication[];
};

function numberFromKobo(value: string) {
  const amount = Number(value);
  return Number.isFinite(amount) ? amount / 100 : 0;
}

function statusLabel(status: ApiApplicationStatus | ApiListing["status"]) {
  return status.replaceAll("_", " ").toLowerCase();
}

function listingTone(status: ApiListing["status"]) {
  if (status === "PUBLISHED") return "green" as const;
  if (status === "PENDING_REVIEW") return "gold" as const;
  if (status === "REJECTED" || status === "SUSPENDED") return "red" as const;
  return "slate" as const;
}

function greeting(firstName: string | undefined) {
  return firstName?.trim() ? `Good morning, ${firstName.trim()}` : "Good morning";
}

function DashboardSecondary({
  unreadMessages,
  unreadNotifications,
  maintenanceOpen,
  onOpenMessages,
  onOpenMaintenance,
  onOpenTransactions,
}: {
  unreadMessages: number;
  unreadNotifications: number;
  maintenanceOpen: number;
  onOpenMessages: () => void;
  onOpenMaintenance: () => void;
  onOpenTransactions: () => void;
}) {
  return <div className="dashgrid live-dashboard-secondary">
    <section className="panel">
      <small>Messages</small>
      <h2>{unreadMessages} unread conversation{unreadMessages === 1 ? "" : "s"}</h2>
      <p>Only real property conversations are counted here.</p>
      <Button variant="outline" onClick={onOpenMessages}><MessageCircle size={14} /> Open messages</Button>
    </section>
    <section className="panel">
      <small>Maintenance</small>
      <h2>{maintenanceOpen} open request{maintenanceOpen === 1 ? "" : "s"}</h2>
      <p>{maintenanceOpen ? "Open requests need attention." : "There are no open maintenance requests."}</p>
      <Button variant="outline" onClick={onOpenMaintenance}><Wrench size={14} /> View maintenance</Button>
    </section>
    <section className="panel">
      <small>Transaction records</small>
      <h2>{unreadNotifications} unread notification{unreadNotifications === 1 ? "" : "s"}</h2>
      <p>Payment and payout references are kept with the related transaction.</p>
      <Button variant="outline" onClick={onOpenTransactions}><Landmark size={14} /> View transactions</Button>
    </section>
  </div>;
}

export function WorkspaceDashboard({ go, role }: { go: Navigate; role: WorkspaceRole }) {
  const { session } = useAppSession();
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(Boolean(session));
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!session) {
      setData(null);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const summaryRequest = api.dashboard.get(session.accessToken);
      const detailRequest = role === "tenant"
        ? api.applications.mine(session.accessToken, { pageSize: 5 })
        : api.listings.mine(session.accessToken, { pageSize: 5 });
      const [summary, detail] = await Promise.all([summaryRequest, detailRequest]);
      setData({
        summary,
        listings: role === "tenant" ? [] : detail.items as ApiListing[],
        applications: role === "tenant" ? detail.items as ApiRentalApplication[] : [],
      });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to load your dashboard.");
    } finally {
      setLoading(false);
    }
  }, [role, session]);

  useEffect(() => {
    void load();
  }, [load]);

  const homeView = role === "agent" ? "agent-homes" : "landlord-homes";
  const transactionView = role === "agent" ? "agent-transactions" : role === "landlord" ? "landlord-transactions" : "transactions";
  const applicationView = role === "agent" ? "agent-applications" : role === "landlord" ? "landlord-applications" : "tenant-applications";
  const heading = role === "tenant" ? "Here is what is happening with your home search." : role === "agent" ? "Manage your listings, applications and released commissions." : "See the live position of your listings, applications and payouts.";

  if (!session) {
    return <Shell go={go} role={role} title="Overview"><div className="page dashboard"><section className="rental-empty"><CircleAlert size={24} /><h1>Sign in to view your dashboard</h1><Button onClick={() => go("sign-in")}>Sign in</Button></section></div></Shell>;
  }

  const tenantMetrics = role === "tenant" ? data?.summary.tenant : undefined;
  const managerMetrics = role === "landlord" ? data?.summary.landlord : role === "agent" ? data?.summary.agent : undefined;
  const unreadMessages = data?.summary.unreadMessages ?? 0;
  const unreadNotifications = data?.summary.unreadNotifications ?? 0;
  const openMessages = () => go(role === "landlord" ? "questions" : "assistant");
  const openTransactions = () => go(transactionView);

  return <Shell go={go} role={role} title="Overview">
    <div className="page dashboard live-workspace-dashboard">
      <div className="page-title">
        <span>
          <small>{role === "tenant" ? "Your renting journey" : role === "agent" ? "Agent workspace" : "Property portfolio"}</small>
          <h1>{greeting(session.user.firstName)}</h1>
          <p>{heading}</p>
        </span>
        {role === "tenant" ? <Button onClick={() => go("explore")}><Search size={14} /> Explore homes</Button> : <Button onClick={() => go("wizard")}><Plus size={14} /> Add a property</Button>}
      </div>

      {loading ? <section className="rental-empty"><LoaderCircle className="spin" size={24} /><h1>Loading your dashboard…</h1></section> : error ? <section className="rental-empty error"><CircleAlert size={24} /><h1>Dashboard needs attention</h1><p>{error}</p><Button variant="outline" onClick={() => void load()}>Try again</Button></section> : tenantMetrics ? <>
        <div className="metrics four">
          <Metric label="Saved homes" value={String(tenantMetrics.savedHomes)} note={tenantMetrics.savedHomes ? "Homes on your shortlist" : "No saved homes yet"} icon={<Heart size={16} />} onClick={() => go("saved-homes")} />
          <Metric label="Applications" value={String(tenantMetrics.pendingApplications)} note={tenantMetrics.pendingApplications ? "Awaiting the next rental step" : "No applications in progress"} tone="gold" icon={<FileText size={16} />} onClick={() => go(applicationView)} />
          <Metric label="Active rentals" value={String(tenantMetrics.activeTenancies)} note={tenantMetrics.activeTenancies ? "Current tenancy records" : "No active rentals yet"} icon={<House size={16} />} />
          <Metric label="Total paid" value={formatNaira(numberFromKobo(tenantMetrics.totalPaidKobo))} note="Confirmed rent payments" icon={<WalletCards size={16} />} onClick={openTransactions} />
        </div>

        <section className="panel live-dashboard-panel">
          <div className="subhead"><span><small>Applications</small><h2>Your recent activity</h2></span><Button variant="ghost" onClick={() => go(applicationView)}>All applications <ArrowRight size={13} /></Button></div>
          {data?.applications.length ? <div className="live-dashboard-list">{data.applications.map((application) => <button key={application.id} onClick={() => go(applicationView)}><span><b>{application.listing.title}</b><small>Move-in {new Intl.DateTimeFormat("en-NG", { dateStyle: "medium" }).format(new Date(application.moveInDate))}</small></span><Status tone={application.status === "REJECTED" || application.status === "CANCELLED" ? "red" : application.status === "ACTIVE" || application.status === "COMPLETED" ? "green" : "gold"}>{statusLabel(application.status)}</Status><ArrowRight size={14} /></button>)}</div> : <div className="dashboard-empty"><FileText size={20} /><h2>No applications yet</h2><p>Homes you apply for will appear here with their real status.</p><Button variant="outline" onClick={() => go("explore")}>Explore homes</Button></div>}
        </section>
        <DashboardSecondary unreadMessages={unreadMessages} unreadNotifications={unreadNotifications} maintenanceOpen={tenantMetrics.maintenanceOpen} onOpenMessages={openMessages} onOpenMaintenance={() => go("maintenance")} onOpenTransactions={openTransactions} />
      </> : managerMetrics ? <>
        <div className="metrics four">
          <Metric label={role === "agent" ? "Managed listings" : "My listings"} value={String(managerMetrics.totalListings)} note={`${managerMetrics.activeListings} published and available`} icon={<Building2 size={16} />} onClick={() => go(homeView)} />
          <Metric label="Active rentals" value={String(managerMetrics.activeTenancies)} note={managerMetrics.activeTenancies ? "Current tenancy records" : "No active rentals yet"} icon={<House size={16} />} />
          <Metric label="Applications" value={String(managerMetrics.pendingApplications)} note={managerMetrics.pendingApplications ? "Awaiting review" : "No applications awaiting review"} tone="gold" icon={<FileText size={16} />} onClick={() => go(applicationView)} />
          <Metric label="Paid out" value={formatNaira(numberFromKobo(managerMetrics.paidOutKobo))} note="Completed payouts" icon={<WalletCards size={16} />} onClick={openTransactions} />
        </div>
        <section className="panel live-dashboard-panel">
          <div className="subhead"><span><small>{role === "agent" ? "Managed homes" : "Your homes"}</small><h2>Current listings</h2></span><Button variant="ghost" onClick={() => go(homeView)}>View all homes <ArrowRight size={13} /></Button></div>
          {data?.listings.length ? <div className="live-dashboard-list">{data.listings.map((listing) => <button key={listing.id} onClick={() => go(homeView, { listing: listing.id })}><span><b>{listing.title}</b><small>{listing.area}, {listing.state} · {formatNaira(numberFromKobo(listing.annualRentKobo))} / year</small></span><Status tone={listingTone(listing.status)}>{statusLabel(listing.status)}</Status><ArrowRight size={14} /></button>)}</div> : <div className="dashboard-empty"><Building2 size={20} /><h2>No listings yet</h2><p>{role === "agent" ? "Homes you manage will appear here once they are created." : "You have not added any listings yet."}</p><Button variant="outline" onClick={() => go("wizard")}>Add a property</Button></div>}
        </section>
        <DashboardSecondary unreadMessages={unreadMessages} unreadNotifications={unreadNotifications} maintenanceOpen={managerMetrics.maintenanceOpen} onOpenMessages={openMessages} onOpenMaintenance={() => go(homeView)} onOpenTransactions={openTransactions} />
      </> : <section className="rental-empty"><CircleAlert size={24} /><h1>No dashboard data is available</h1><p>Try refreshing this page.</p></section>}
      <InspectionDashboard token={session.accessToken} userId={session.user.id} manager={role !== 'tenant'} />
    </div>
  </Shell>;
}
