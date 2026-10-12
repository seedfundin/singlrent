"use client";

import { useCallback, useEffect, useState } from "react";
import { CircleAlert, FileWarning, LoaderCircle, ShieldAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAppSession } from "@/features/app/app-provider";
import { Shell, Status, type Navigate } from "@/features/app/shell";
import { ApiFieldError } from "@/features/forms/api-field-error";
import { api, apiFieldErrors, apiFormError, type ApiFieldErrors, type ApiIncident, type ApiIncidentSeverity, type ApiIncidentType, type ApiTenancy } from "@/lib/api";
import "@/features/rentals/rental-flow.css";

type WorkspaceRole = "tenant" | "landlord" | "agent" | "admin";

const incidentTypes: Array<{ value: ApiIncidentType; label: string }> = [
  { value: "SAFETY_THREAT", label: "Safety threat" },
  { value: "HARASSMENT", label: "Harassment" },
  { value: "FRAUD", label: "Fraud" },
  { value: "VIOLENCE", label: "Violence" },
  { value: "SERIOUS_PROPERTY_SAFETY", label: "Serious property safety" },
  { value: "MISCONDUCT", label: "Misconduct" },
];

const severities: Array<{ value: ApiIncidentSeverity; label: string }> = [
  { value: "LOW", label: "Low" },
  { value: "MEDIUM", label: "Medium" },
  { value: "HIGH", label: "High" },
  { value: "CRITICAL", label: "Critical" },
];

type FormSubmitEvent = Pick<Event, "preventDefault">;

function roleFor(roles: string[]): WorkspaceRole {
  if (roles.includes("SUPER_ADMIN") || roles.includes("ADMIN")) return "admin";
  if (roles.includes("AGENT")) return "agent";
  if (roles.includes("LANDLORD")) return "landlord";
  return "tenant";
}

function label(value: string) {
  return value.replaceAll("_", " ").toLowerCase();
}

function tone(status: ApiIncident["status"]) {
  if (status === "RESOLVED" || status === "CLOSED") return "green" as const;
  if (status === "UNDER_REVIEW" || status === "INVESTIGATING") return "gold" as const;
  return "slate" as const;
}

export function IncidentReports({ go }: { go: Navigate }) {
  const { session } = useAppSession();
  const [reports, setReports] = useState<ApiIncident[]>([]);
  const [tenancies, setTenancies] = useState<ApiTenancy[]>([]);
  const [listingId, setListingId] = useState("");
  const [type, setType] = useState<ApiIncidentType>("SAFETY_THREAT");
  const [severity, setSeverity] = useState<ApiIncidentSeverity>("MEDIUM");
  const [description, setDescription] = useState("");
  const [confidential, setConfidential] = useState(true);
  const [loading, setLoading] = useState(Boolean(session));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<ApiFieldErrors>({});
  const [notice, setNotice] = useState<string | null>(null);
  const role = roleFor(session?.user.roles ?? []);

  const load = useCallback(async () => {
    if (!session) {
      setReports([]);
      setTenancies([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const [reportResponse, tenancyResponse] = await Promise.all([
        api.reports.mine(session.accessToken, { pageSize: 50 }),
        api.tenancies.list(session.accessToken, { pageSize: 50 }),
      ]);
      setReports(reportResponse.items);
      setTenancies(tenancyResponse.items);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to load your reports.");
    } finally {
      setLoading(false);
    }
  }, [session]);

  useEffect(() => {
    void load();
  }, [load]);

  const submit = async (event: FormSubmitEvent) => {
    event.preventDefault();
    if (!session) return;
    if (description.trim().length < 10) {
      setFieldErrors({ description: ["Description must contain at least 10 characters."] });
      setError("Please correct the highlighted fields and try again.");
      return;
    }
    setSaving(true);
    setError(null);
    setFieldErrors({});
    setNotice(null);
    try {
      const report = await api.reports.create(session.accessToken, {
        listingId: listingId || undefined,
        type,
        severity,
        description: description.trim(),
        confidential,
      });
      setReports((current) => [report, ...current]);
      setDescription("");
      setListingId("");
      setNotice(`Your report was submitted. Reference: ${report.reference}`);
    } catch (cause) {
      const nextFieldErrors = apiFieldErrors(cause);
      setFieldErrors(nextFieldErrors);
      setError(apiFormError(cause, nextFieldErrors, "Unable to submit this report."));
    } finally {
      setSaving(false);
    }
  };

  if (!session) {
    return <Shell go={go} role="tenant" title="Report a concern"><div className="page rental-flow"><section className="rental-empty"><ShieldAlert size={24} /><h1>Sign in to report a concern</h1><p>Reports are private to you and authorized SingleRent staff.</p><Button onClick={() => go("sign-in")}>Sign in</Button></section></div></Shell>;
  }

  return <Shell go={go} role={role} title="Report a concern"><div className="page rental-flow incident-reports-live">
    <div className="rental-flow-heading"><span><small>Safety and support</small><h1>Report a concern</h1><p>Submit a real concern for review. Your submitted reports and their status appear below.</p></span></div>
    {error && <p className="rental-alert error"><CircleAlert size={15} /> {error}</p>}
    {notice && <p className="rental-alert"><FileWarning size={15} /> {notice}</p>}
    <form className="panel live-data-form" onSubmit={(event) => void submit(event)}>
      <div className="subhead"><span><small>New report</small><h2>What happened?</h2></span></div>
      <label>Related home (optional)<select aria-invalid={Boolean(fieldErrors.listingId)} value={listingId} onChange={(event) => { setListingId(event.target.value); setFieldErrors((current) => { const { listingId: _listingId, ...remaining } = current; return remaining; }); }}><option value="">No related home selected</option>{tenancies.map((tenancy) => <option key={tenancy.id} value={tenancy.listingId}>{tenancy.listing.title}</option>)}</select><ApiFieldError errors={fieldErrors} field="listingId" /></label>
      <div className="live-form-grid"><label>Concern type<select aria-invalid={Boolean(fieldErrors.type)} value={type} onChange={(event) => { setType(event.target.value as ApiIncidentType); setFieldErrors((current) => { const { type: _type, ...remaining } = current; return remaining; }); }}>{incidentTypes.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select><ApiFieldError errors={fieldErrors} field="type" /></label><label>Severity<select aria-invalid={Boolean(fieldErrors.severity)} value={severity} onChange={(event) => { setSeverity(event.target.value as ApiIncidentSeverity); setFieldErrors((current) => { const { severity: _severity, ...remaining } = current; return remaining; }); }}>{severities.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select><ApiFieldError errors={fieldErrors} field="severity" /></label></div>
      <label>Describe the concern<textarea aria-invalid={Boolean(fieldErrors.description)} value={description} onChange={(event) => { setDescription(event.target.value); setFieldErrors((current) => { const { description: _description, ...remaining } = current; return remaining; }); }} minLength={10} maxLength={4000} required /><ApiFieldError errors={fieldErrors} field="description" /></label>
      <label className="live-checkbox"><input type="checkbox" checked={confidential} onChange={(event) => setConfidential(event.target.checked)} /> Keep this report confidential</label>
      <Button disabled={saving}>{saving ? <><LoaderCircle className="spin" size={14} /> Submitting…</> : <><ShieldAlert size={14} /> Submit report</>}</Button>
    </form>
    <section className="panel live-dashboard-panel">
      <div className="subhead"><span><small>Your reports</small><h2>Submitted concerns</h2></span></div>
      {loading ? <div className="rental-empty"><LoaderCircle className="spin" size={22} /><h2>Loading reports…</h2></div> : reports.length ? <div className="live-dashboard-list">{reports.map((report) => <article key={report.id} className="live-record-row"><span><b>{label(report.type)}</b><small><code>{report.reference}</code>{report.listing ? ` · ${report.listing.title}` : ""} · submitted {new Intl.DateTimeFormat("en-NG", { dateStyle: "medium" }).format(new Date(report.createdAt))}</small></span><Status tone={tone(report.status)}>{label(report.status)}</Status></article>)}</div> : <div className="dashboard-empty"><FileWarning size={20} /><h2>No reports submitted</h2><p>Any real concern you submit will appear here with its current status.</p></div>}
    </section>
  </div></Shell>;
}
