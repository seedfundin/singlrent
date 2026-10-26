"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ArrowUpRight,
  CalendarClock,
  CircleAlert,
  ClipboardCheck,
  Clock3,
  FileText,
  Flag,
  LoaderCircle,
  MessageCircle,
  RefreshCw,
  Search,
  Send,
  ShieldAlert,
  UserRound,
  Users,
  Wrench,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAppSession } from "@/features/app/app-provider";
import { Shell, Status, type Navigate } from "@/features/app/shell";
import { AdminAccess } from "@/features/admin/live-admin";
import {
  api,
  type ApiAdminMaintenanceCase,
  type ApiMaintenanceAuditEvent,
  type ApiMaintenanceOperator,
  type ApiMaintenanceRequest,
} from "@/lib/api";
import "./maintenance.css";

type AttentionFilter = "ALL" | "URGENT" | "OVERDUE" | "ESCALATED" | "UNASSIGNED";
type Recipient = "TENANT" | "LANDLORD" | "AGENT";

const statuses: Array<ApiMaintenanceRequest["status"]> = ["OPEN", "ACKNOWLEDGED", "IN_PROGRESS", "RESOLVED", "CLOSED"];

function humanize(value: string) {
  return value.replaceAll("_", " ").toLowerCase();
}

function fullName(person?: { firstName: string; lastName: string } | null) {
  return person ? `${person.firstName} ${person.lastName}`.trim() : "Not assigned";
}

function displayDate(value?: string | null) {
  if (!value) return "Not set";
  return new Intl.DateTimeFormat("en-NG", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}

function timeAgo(value: string) {
  const difference = Date.now() - new Date(value).getTime();
  const minutes = Math.max(1, Math.floor(difference / 60000));
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 48) return `${hours} hr${hours === 1 ? "" : "s"} ago`;
  const days = Math.floor(hours / 24);
  return `${days} day${days === 1 ? "" : "s"} ago`;
}

function statusTone(status: ApiMaintenanceRequest["status"]) {
  if (status === "RESOLVED" || status === "CLOSED") return "green" as const;
  if (status === "OPEN") return "red" as const;
  if (status === "IN_PROGRESS") return "blue" as const;
  return "gold" as const;
}

function priorityTone(priority: ApiMaintenanceRequest["priority"]) {
  if (priority === "URGENT") return "red" as const;
  if (priority === "HIGH") return "gold" as const;
  return "slate" as const;
}

function activityLabel(event: ApiMaintenanceAuditEvent) {
  if (event.action === "maintenance.internal_note_added") return "Internal note";
  if (event.action === "maintenance.escalated") return "Case escalated";
  if (event.action === "maintenance.participant_contacted") return "Support message sent";
  if (event.action === "maintenance.admin_owner_assigned") return "Case owner assigned";
  if (event.action === "maintenance.admin_owner_cleared") return "Case owner cleared";
  if (event.action === "maintenance.closed_by_admin") return "Case closed by support";
  if (event.action === "maintenance.status_corrected") return "Status corrected";
  return event.action.replaceAll(".", " ").replaceAll("_", " ");
}

function activityDetail(event: ApiMaintenanceAuditEvent) {
  const metadata = event.metadata ?? {};
  for (const key of ["note", "reason", "message"] as const) {
    if (typeof metadata[key] === "string") return metadata[key];
  }
  if (typeof metadata.toStatus === "string") return `Changed to ${humanize(metadata.toStatus)}.`;
  return "Recorded in the administrative audit trail.";
}

function CaseRow({ request, selected, onClick }: { request: ApiMaintenanceRequest; selected: boolean; onClick: () => void }) {
  const attention = request.attention;
  return <button type="button" className={`maintenance-case-row ${selected ? "selected" : ""}`} onClick={onClick}>
    <span className="maintenance-case-row-top"><small>{request.listing.title}</small><Status tone={priorityTone(request.priority)}>{humanize(request.priority)}</Status></span>
    <b>{request.title}</b>
    <span className="maintenance-case-row-meta"><UserRound size={13} /> {fullName(request.reporter)} <span>·</span> <Clock3 size={13} /> {timeAgo(request.updatedAt)}</span>
    <span className="maintenance-case-row-footer"><Status tone={statusTone(request.status)}>{humanize(request.status)}</Status>{attention?.needsAttention && <span className="attention-dot">Needs attention</span>}</span>
  </button>;
}

function MaintenanceContent({ go }: { go: Navigate }) {
  const { session } = useAppSession();
  const token = session?.accessToken;
  const [cases, setCases] = useState<ApiMaintenanceRequest[]>([]);
  const [operators, setOperators] = useState<ApiMaintenanceOperator[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedCase, setSelectedCase] = useState<ApiAdminMaintenanceCase | null>(null);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"ALL" | ApiMaintenanceRequest["status"]>("ALL");
  const [attentionFilter, setAttentionFilter] = useState<AttentionFilter>("ALL");
  const [loadingQueue, setLoadingQueue] = useState(true);
  const [loadingCase, setLoadingCase] = useState(false);
  const [action, setAction] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [escalationReason, setEscalationReason] = useState("");
  const [responseDueAt, setResponseDueAt] = useState("");
  const [message, setMessage] = useState("");
  const [recipient, setRecipient] = useState<Recipient>("TENANT");
  const [statusCorrection, setStatusCorrection] = useState<ApiMaintenanceRequest["status"]>("IN_PROGRESS");
  const [statusReason, setStatusReason] = useState("");

  const loadQueue = useCallback(async (quiet = false) => {
    if (!token) return;
    if (!quiet) setLoadingQueue(true);
    try {
      const response = await api.admin.maintenance(token, {
        pageSize: 100,
        status: statusFilter === "ALL" ? undefined : statusFilter,
        attention: attentionFilter === "ALL" ? undefined : attentionFilter,
        search: search.trim() || undefined,
      });
      setCases(response.items);
      setSelectedId((current) => current && response.items.some((request) => request.id === current) ? current : response.items[0]?.id ?? null);
    } catch (cause) {
      if (!quiet) setError(cause instanceof Error ? cause.message : "Unable to load maintenance cases.");
    } finally {
      if (!quiet) setLoadingQueue(false);
    }
  }, [attentionFilter, search, statusFilter, token]);

  const loadCase = useCallback(async (requestId: string, quiet = false) => {
    if (!token) return;
    if (!quiet) setLoadingCase(true);
    try {
      setSelectedCase(await api.admin.maintenanceCase(token, requestId));
    } catch (cause) {
      if (!quiet) setError(cause instanceof Error ? cause.message : "Unable to load this maintenance case.");
    } finally {
      if (!quiet) setLoadingCase(false);
    }
  }, [token]);

  useEffect(() => { void loadQueue(); }, [loadQueue]);
  useEffect(() => {
    if (!token) return;
    api.admin.maintenanceOperators(token).then(setOperators).catch(() => setOperators([]));
  }, [token]);
  useEffect(() => { if (selectedId) void loadCase(selectedId); else setSelectedCase(null); }, [loadCase, selectedId]);
  useEffect(() => {
    const timer = window.setInterval(() => {
      void loadQueue(true);
      if (selectedId) void loadCase(selectedId, true);
    }, 30000);
    return () => window.clearInterval(timer);
  }, [loadCase, loadQueue, selectedId]);

  const summary = useMemo(() => ({
    active: cases.filter((request) => !["RESOLVED", "CLOSED"].includes(request.status)).length,
    urgent: cases.filter((request) => request.attention?.urgent).length,
    overdue: cases.filter((request) => request.attention?.overdue).length,
    unassigned: cases.filter((request) => request.attention?.unassigned).length,
  }), [cases]);

  const refresh = async () => {
    setError(null);
    setNotice(null);
    await loadQueue();
    if (selectedId) await loadCase(selectedId);
  };

  const perform = async (name: string, work: () => Promise<void>, success: string) => {
    setAction(name);
    setError(null);
    setNotice(null);
    try {
      await work();
      setNotice(success);
      await loadQueue(true);
      if (selectedId) await loadCase(selectedId, true);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "This case could not be updated.");
    } finally {
      setAction(null);
    }
  };

  if (!session) return null;
  const caseData = selectedCase;
  const availableRecipients: Array<[Recipient, string]> = caseData
    ? [["TENANT", `Tenant · ${fullName(caseData.reporter)}`], ["LANDLORD", `Landlord · ${fullName(caseData.landlord)}`], ...(caseData.agent ? [["AGENT", `Agent · ${fullName(caseData.agent)}`] as [Recipient, string]] : [])]
    : [];

  return <Shell go={go} role="admin" title="Maintenance">
    <div className="page live-admin-page maintenance-admin-page">
      <div className="page-title maintenance-page-title">
        <span><small>Property care oversight</small><h1>Maintenance cases</h1><p>Monitor response quality, support both parties and step in only when a case needs SingleRent’s attention.</p></span>
        <Button variant="outline" onClick={() => void refresh()} disabled={loadingQueue || loadingCase}><RefreshCw size={14} className={loadingQueue || loadingCase ? "spin" : ""} /> Refresh now</Button>
      </div>
      {error && <p className="admin-live-error" role="alert"><CircleAlert size={15} /> {error}</p>}
      {notice && <p className="maintenance-notice"><ClipboardCheck size={15} /> {notice}</p>}

      <div className="admin-summary maintenance-summary">
        <button type="button" className="metric" onClick={() => { setStatusFilter("ALL"); setAttentionFilter("ALL"); }}><span>Active cases</span><strong>{loadingQueue ? "…" : summary.active}</strong><small>Not resolved or closed</small></button>
        <button type="button" className="metric gold" onClick={() => { setStatusFilter("ALL"); setAttentionFilter("URGENT"); }}><span>Urgent</span><strong>{loadingQueue ? "…" : summary.urgent}</strong><small>Needs immediate review</small></button>
        <button type="button" className="metric red" onClick={() => { setStatusFilter("ALL"); setAttentionFilter("OVERDUE"); }}><span>Past deadline</span><strong>{loadingQueue ? "…" : summary.overdue}</strong><small>Response is overdue</small></button>
        <button type="button" className="metric" onClick={() => { setStatusFilter("ALL"); setAttentionFilter("UNASSIGNED"); }}><span>Unassigned</span><strong>{loadingQueue ? "…" : summary.unassigned}</strong><small>Needs an internal owner</small></button>
      </div>

      <section className="maintenance-workspace">
        <aside className="maintenance-queue panel">
          <div className="maintenance-queue-head"><span><small>Case queue</small><h2>{cases.length} case{cases.length === 1 ? "" : "s"}</h2></span><Wrench size={19} /></div>
          <label className="maintenance-search"><Search size={15} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search property, person or issue" /></label>
          <div className="maintenance-filters" aria-label="Maintenance filters">
            <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as typeof statusFilter)} aria-label="Filter by status"><option value="ALL">All statuses</option>{statuses.map((status) => <option value={status} key={status}>{humanize(status)}</option>)}</select>
            <select value={attentionFilter} onChange={(event) => setAttentionFilter(event.target.value as AttentionFilter)} aria-label="Filter by attention"><option value="ALL">All cases</option><option value="URGENT">Urgent</option><option value="OVERDUE">Past deadline</option><option value="ESCALATED">Escalated</option><option value="UNASSIGNED">Unassigned</option></select>
          </div>
          <p className="maintenance-queue-hint"><Clock3 size={13} /> Refreshes quietly every 30 seconds.</p>
          <div className="maintenance-case-list">
            {loadingQueue ? <div className="admin-live-loading"><LoaderCircle className="spin" size={17} /> Loading cases…</div> : cases.length ? cases.map((request) => <CaseRow key={request.id} request={request} selected={request.id === selectedId} onClick={() => setSelectedId(request.id)} />) : <div className="maintenance-empty"><ClipboardCheck size={20} /><b>No matching maintenance cases</b><span>Try clearing a filter or check back shortly.</span></div>}
          </div>
        </aside>

        <section className="maintenance-case-detail panel" aria-live="polite">
          {loadingCase && !caseData ? <div className="admin-live-loading"><LoaderCircle className="spin" size={18} /> Opening case…</div> : !caseData ? <div className="maintenance-empty maintenance-detail-empty"><Wrench size={24} /><b>Select a maintenance case</b><span>Its full context, evidence and support tools will appear here.</span></div> : <>
            <div className="case-detail-heading">
              <div><small>{caseData.listing.title}</small><h2>{caseData.title}</h2><p>{caseData.description}</p></div>
              <div className="case-detail-statuses"><Status tone={priorityTone(caseData.priority)}>{humanize(caseData.priority)} priority</Status><Status tone={statusTone(caseData.status)}>{humanize(caseData.status)}</Status></div>
            </div>

            <div className="case-alerts">
              {caseData.attention?.urgent && <span className="case-alert urgent"><ShieldAlert size={15} /> Urgent: administrator attention required</span>}
              {caseData.attention?.overdue && <span className="case-alert overdue"><Clock3 size={15} /> Response deadline has passed</span>}
              {caseData.attention?.escalated && <span className="case-alert escalated"><Flag size={15} /> Escalated {caseData.responseDueAt ? `· due ${displayDate(caseData.responseDueAt)}` : ""}</span>}
              {caseData.attention?.unassigned && <span className="case-alert unassigned"><Users size={15} /> No internal owner yet</span>}
            </div>

            <section className="case-context">
              <article><small>Tenant</small><b>{fullName(caseData.reporter)}</b></article>
              <article><small>Landlord</small><b>{fullName(caseData.landlord)}</b></article>
              <article><small>Property manager</small><b>{caseData.agent ? fullName(caseData.agent) : "Landlord manages this home"}</b></article>
              <article><small>Raised</small><b>{displayDate(caseData.createdAt)}</b></article>
            </section>

            <section className="case-evidence-section">
              <div className="case-section-head"><span><small>Submitted evidence</small><h3>Files from the tenant</h3></span><FileText size={18} /></div>
              {caseData.attachments?.length ? <div className="case-evidence-list">{caseData.attachments.map((attachment, index) => <a key={attachment.id} href={attachment.url} target="_blank" rel="noreferrer"><FileText size={16} /><span><b>Evidence file {index + 1}</b><small>{attachment.format?.toUpperCase() ?? "Attachment"} · {displayDate(attachment.createdAt)}</small></span><ArrowUpRight size={15} /></a>)}</div> : <p className="case-muted">No files were attached to this report.</p>}
            </section>

            <section className="case-control-grid" aria-label="Administrative maintenance controls">
              <article className="case-control-card"><div className="case-section-head"><span><small>Internal accountability</small><h3>Assign case owner</h3></span><UserRound size={18} /></div><p>One SingleRent team member owns follow-up. This does not change who repairs the home.</p><select value={caseData.adminOwner?.id ?? ""} onChange={(event) => void perform("owner", () => api.admin.assignMaintenanceOwner(token!, caseData.id, event.target.value || null).then(() => undefined), event.target.value ? "Internal case owner updated." : "Internal case owner cleared.")} disabled={action !== null}><option value="">Unassigned</option>{operators.map((operator) => <option key={operator.id} value={operator.id}>{fullName(operator)} · {operator.email}</option>)}</select></article>

              <article className="case-control-card"><div className="case-section-head"><span><small>Private to admins</small><h3>Add internal note</h3></span><ClipboardCheck size={18} /></div><textarea value={note} onChange={(event) => setNote(event.target.value)} placeholder="Record the evidence reviewed, next step or decision. Tenants and property contacts cannot see this." /><Button size="sm" variant="outline" disabled={action !== null || note.trim().length < 3} onClick={() => void perform("note", async () => { await api.admin.addMaintenanceNote(token!, caseData.id, note.trim()); setNote(""); }, "Internal note saved to the audit trail.")}><ClipboardCheck size={14} /> Save internal note</Button></article>

              <article className="case-control-card case-control-card-wide"><div className="case-section-head"><span><small>Escalation and follow-up</small><h3>Set a required response</h3></span><Flag size={18} /></div><p>This alerts the landlord or agent and creates a traceable response deadline.</p><div className="case-control-row"><textarea value={escalationReason} onChange={(event) => setEscalationReason(event.target.value)} placeholder="Why does this need escalation?" /><label><span>Reply due</span><input type="datetime-local" value={responseDueAt} onChange={(event) => setResponseDueAt(event.target.value)} /></label></div><Button size="sm" disabled={action !== null || escalationReason.trim().length < 3} onClick={() => void perform("escalate", async () => { await api.admin.escalateMaintenance(token!, caseData.id, { reason: escalationReason.trim(), responseDueAt: responseDueAt ? new Date(responseDueAt).toISOString() : undefined }); setEscalationReason(""); }, "Case escalated and the property contact was notified.")}><Flag size={14} /> Escalate case</Button></article>

              <article className="case-control-card case-control-card-wide"><div className="case-section-head"><span><small>Direct support</small><h3>Ask a participant for an update</h3></span><MessageCircle size={18} /></div><p>Starts or continues a private support conversation, so the response is not lost in a maintenance log.</p><div className="case-control-row"><select value={recipient} onChange={(event) => setRecipient(event.target.value as Recipient)}>{availableRecipients.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select><textarea value={message} onChange={(event) => setMessage(event.target.value)} placeholder="What information or action do you need?" /></div><Button size="sm" variant="outline" disabled={action !== null || message.trim().length < 3} onClick={() => void perform("contact", async () => { await api.admin.contactMaintenanceParticipant(token!, caseData.id, { recipient, message: message.trim() }); setMessage(""); }, "Your support message was sent and recorded on this case.")}><Send size={14} /> Send support message</Button></article>

              <article className="case-control-card case-control-card-wide case-status-control"><div className="case-section-head"><span><small>Intervention only</small><h3>Correct or close case status</h3></span><ShieldAlert size={18} /></div><p>Use only when the recorded status is misleading, disputed, or requires a support decision. The change is visible to both parties and is fully audited.</p><div className="case-control-row"><select value={statusCorrection} onChange={(event) => setStatusCorrection(event.target.value as ApiMaintenanceRequest["status"])}>{statuses.map((status) => <option key={status} value={status}>{humanize(status)}</option>)}</select><textarea value={statusReason} onChange={(event) => setStatusReason(event.target.value)} placeholder="Explain this status decision clearly" /></div><Button size="sm" variant={statusCorrection === "CLOSED" ? "destructive" : "outline"} disabled={action !== null || statusCorrection === caseData.status || statusReason.trim().length < 3} onClick={() => void perform("status", async () => { await api.admin.correctMaintenanceStatus(token!, caseData.id, { status: statusCorrection, reason: statusReason.trim() }); setStatusReason(""); }, statusCorrection === "CLOSED" ? "Case closed and both parties were notified." : "Case status corrected and both parties were notified.")}><ShieldAlert size={14} /> {statusCorrection === "CLOSED" ? "Close case" : "Correct status"}</Button></article>
            </section>

            <section className="case-timeline-section"><div className="case-section-head"><span><small>Complete record</small><h3>Case activity</h3></span><CalendarClock size={18} /></div><div className="case-timeline">{caseData.updates.map((update) => <article key={`update-${update.id}`}><i className="case-timeline-public" /><span><b>{fullName(update.author)}</b><small>{displayDate(update.createdAt)}</small>{update.body && <p>{update.body}</p>}{update.fromStatus && update.toStatus && <em>{humanize(update.fromStatus)} → {humanize(update.toStatus)}</em>}</span></article>)}{caseData.auditHistory.map((event) => <article key={`audit-${event.id}`}><i className="case-timeline-private" /><span><b><ShieldAlert size={13} /> {activityLabel(event)} <em>Internal</em></b><small>{event.actor ? fullName(event.actor) : "SingleRent system"} · {displayDate(event.createdAt)}</small><p>{activityDetail(event)}</p></span></article>)}{!caseData.updates.length && !caseData.auditHistory.length && <p className="case-muted">This is the first record for this case.</p>}</div></section>
          </>}
        </section>
      </section>
    </div>
  </Shell>;
}

export function AdminMaintenance({ go }: { go: Navigate }) {
  return <AdminAccess go={go} title="Maintenance"><MaintenanceContent go={go} /></AdminAccess>;
}
