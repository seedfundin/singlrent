"use client";

import { useCallback, useEffect, useState } from "react";
import { Activity, CircleAlert, ClipboardList, Database, LoaderCircle, MessageSquareWarning, ServerCog, ShieldCheck, Star } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAppSession } from "@/features/app/app-provider";
import { Shell, Status, type Navigate } from "@/features/app/shell";
import { AdminAccess } from "@/features/admin/live-admin";
import { api, type ApiDashboard, type ApiIncident, type ApiMaintenanceRequest, type ApiReview, type ApiSystemStates } from "@/lib/api";
import { formatNaira } from "@/lib/pricing";
import "./operations.css";

function OperationsContent({ go }: { go: Navigate }) {
  const { session } = useAppSession();
  const token = session?.accessToken;
  const [dashboard, setDashboard] = useState<ApiDashboard | null>(null);
  const [reports, setReports] = useState<ApiIncident[]>([]);
  const [maintenance, setMaintenance] = useState<ApiMaintenanceRequest[]>([]);
  const [reviews, setReviews] = useState<ApiReview[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setError(null);
    try {
      const [metrics, reportResponse, maintenanceResponse, reviewResponse] = await Promise.all([
        api.dashboard.get(token),
        api.reports.admin(token, { pageSize: 6 }),
        api.admin.maintenance(token, { pageSize: 6 }),
        api.reviews.admin(token, { pageSize: 6 }),
      ]);
      setDashboard(metrics);
      setReports(reportResponse.items);
      setMaintenance(maintenanceResponse.items);
      setReviews(reviewResponse.items);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to load operations data.");
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => { void load(); }, [load]);
  if (!session) return null;
  const metrics = dashboard?.admin;

  return <Shell go={go} role="admin" title="Operations"><div className="page live-admin-page operations-page">
    <div className="page-title"><span><small>Live operations</small><h1>Marketplace operations</h1><p>Current reports, maintenance work, and reviews from the live SingleRent API.</p></span><Button variant="outline" onClick={() => void load()} disabled={loading}>{loading ? <LoaderCircle className="spin" size={14} /> : <Activity size={14} />} Refresh</Button></div>
    {error && <p className="admin-live-error" role="alert"><CircleAlert size={15} /> {error}</p>}
    <div className="admin-summary operations-summary">
      <div className="metric"><span>Pending listing review</span><strong>{loading ? "…" : metrics?.listingsPendingReview ?? "—"}</strong><small>Authoritative queue count</small></div>
      <div className="metric gold"><span>Open maintenance</span><strong>{loading ? "…" : metrics?.maintenanceOpen ?? "—"}</strong><small>Across the marketplace</small></div>
      <div className="metric green"><span>Platform fees collected</span><strong>{loading || !metrics ? "…" : formatNaira(Number(metrics.platformRevenueKobo) / 100)}</strong><small>Successful payments only</small></div>
    </div>
    {loading ? <div className="admin-live-loading"><LoaderCircle className="spin" size={18} /> Loading operations data…</div> : !error && <div className="operations-grid">
      <section className="panel operations-panel"><div className="subhead"><span><small>Safety</small><h2>Incident reports</h2></span><MessageSquareWarning size={18} /></div>{reports.length ? reports.map((report) => <article key={report.id}><span><b>{report.reference}</b><small>{report.type.toLowerCase().replaceAll("_", " ")} · {report.description}</small></span><Status tone={report.severity === "CRITICAL" || report.severity === "HIGH" ? "red" : "gold"}>{report.status.toLowerCase().replaceAll("_", " ")}</Status></article>) : <p className="operations-empty">No incident reports in the current result set.</p>}</section>
      <section className="panel operations-panel"><div className="subhead"><span><small>Property care</small><h2>Maintenance queue</h2></span><ClipboardList size={18} /></div>{maintenance.length ? maintenance.map((request) => <article key={request.id}><span><b>{request.title}</b><small>{request.listing.title} · {request.priority.toLowerCase()} priority</small></span><Status tone={request.status === "RESOLVED" || request.status === "CLOSED" ? "green" : "gold"}>{request.status.toLowerCase().replaceAll("_", " ")}</Status></article>) : <p className="operations-empty">No maintenance cases in the current result set.</p>}</section>
      <section className="panel operations-panel"><div className="subhead"><span><small>Trust & feedback</small><h2>Recent reviews</h2></span><Star size={18} /></div>{reviews.length ? reviews.map((review) => <article key={review.id}><span><b>{review.listing?.title ?? "Listing no longer available"}</b><small>{review.score}/5 · {review.body}</small></span><Status tone={review.status === "PUBLISHED" ? "green" : review.status === "HIDDEN" ? "gold" : "red"}>{review.status.toLowerCase()}</Status></article>) : <p className="operations-empty">No reviews in the current result set.</p>}</section>
    </div>}
  </div></Shell>;
}

export function AdminOperations({ go }: { go: Navigate }) {
  return <AdminAccess go={go} title="Operations"><OperationsContent go={go} /></AdminAccess>;
}

function StateRow({ label, value }: { label: string; value: string }) {
  const okay = value === "operational" || value === "configured";
  return <article className="system-state-row"><span><b>{label}</b><small>{okay ? "Available" : "Needs configuration or attention"}</small></span><Status tone={okay ? "green" : "gold"}>{value.replaceAll("_", " ")}</Status></article>;
}

function SystemStatesContent({ go }: { go: Navigate }) {
  const { session } = useAppSession();
  const token = session?.accessToken;
  const [states, setStates] = useState<ApiSystemStates | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setError(null);
    try { setStates(await api.admin.systemStates(token)); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Unable to read system states."); }
    finally { setLoading(false); }
  }, [token]);
  useEffect(() => { void load(); }, [load]);
  if (!session) return null;

  return <Shell go={go} role="admin" title="System states"><div className="page live-admin-page system-states-page">
    <div className="page-title"><span><small>Operational visibility</small><h1>System states</h1><p>Live availability checks. Credentials and provider secrets are never exposed here.</p></span><Button variant="outline" onClick={() => void load()} disabled={loading}>{loading ? <LoaderCircle className="spin" size={14} /> : <ServerCog size={14} />} Refresh</Button></div>
    {loading ? <div className="admin-live-loading"><LoaderCircle className="spin" size={18} /> Checking system state…</div> : error ? <section className="admin-access-state"><CircleAlert size={22} /><h2>System state unavailable</h2><p>{error}</p></section> : states && <section className="panel system-states-list"><div className="subhead"><span><small>Last checked</small><h2>{new Intl.DateTimeFormat("en-NG", { dateStyle: "medium", timeStyle: "medium" }).format(new Date(states.checkedAt))}</h2></span><ShieldCheck size={21} /></div><StateRow label="SingleRent API" value={states.api} /><StateRow label="Database" value={states.database} /><StateRow label="Redis" value={states.redis} /><StateRow label="Paystack" value={states.integrations.paystack} /><StateRow label="Dojah" value={states.integrations.dojah} /><StateRow label="Cloudflare R2" value={states.integrations.r2} /></section>}
  </div></Shell>;
}

export function AdminSystemStates({ go }: { go: Navigate }) {
  return <AdminAccess go={go} title="System states"><SystemStatesContent go={go} /></AdminAccess>;
}
