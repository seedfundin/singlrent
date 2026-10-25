"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { api, type ApiMoveIn } from "@/lib/api";

type AdminMoveIn = ApiMoveIn & { tenancy: { listing: { title: string }; tenant: { firstName: string; lastName: string } } };

export function MoveInOperations({ token }: { token: string }) {
  const [records, setRecords] = useState<AdminMoveIn[]>([]);
  const [reason, setReason] = useState("");
  const [refundOutcome, setRefundOutcome] = useState<'VALID_PROPERTY_FAILURE' | 'TENANT_CHANGED_MIND'>('TENANT_CHANGED_MIND');
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const load = async () => { try { setRecords(await api.moveIn.adminList(token)); } catch (cause) { setError(cause instanceof Error ? cause.message : "Unable to load move-in cases."); } };
  useEffect(() => { void load(); }, [token]);
  const act = async (action: () => Promise<void>) => { setBusy(true); setError(""); try { await action(); setReason(""); await load(); } catch (cause) { setError(cause instanceof Error ? cause.message : "Unable to record the decision."); } finally { setBusy(false); } };
  return <section className="panel live-dashboard-panel"><h2>Move-in verification and disputes</h2><p>Review property condition, issues and cancellation requests. Each decision requires a reason.</p>{error && <p className="rental-alert error">{error}</p>}
    {!records.length && <p>No move-in cases found.</p>}
    {records.map((record) => <article key={record.id}><h3>{record.tenancy.listing.title}</h3><p>{record.tenancy.tenant.firstName} {record.tenancy.tenant.lastName} · {record.status.replaceAll("_", " ").toLowerCase()}</p>
      {record.draft && <details><summary>Checklist</summary>{record.draft.map((answer) => <p key={answer.item}>{answer.item.replaceAll("_", " ")}: {answer.result.replaceAll("_", " ")}{answer.description ? ` — ${answer.description}` : ""}</p>)}</details>}
      {record.evidence.filter((item) => !item.issueId).map((item) => <Button key={item.id} variant="outline" onClick={() => void api.moveIn.adminEvidence(token, record.tenancyId, item.id).then(({ downloadUrl }) => window.open(downloadUrl, "_blank", "noopener,noreferrer")).catch((cause) => setError(cause instanceof Error ? cause.message : "Unable to view evidence."))}>View supporting evidence</Button>)}
      {record.issues.map((issue) => <div key={issue.id}><p><b>{issue.severity}</b> · {issue.description} · {issue.status}</p>{issue.status !== "RESOLVED" && <><Button disabled={busy} onClick={() => void act(() => api.moveIn.adminResolve(token, record.tenancyId, issue.id, reason))}>Resolve issue</Button>{(["MINOR", "MAJOR", "CRITICAL"] as const).filter((severity) => severity !== issue.severity).map((severity) => <Button key={severity} variant="outline" disabled={busy} onClick={() => void act(() => api.moveIn.adminReclassify(token, record.tenancyId, issue.id, severity, reason))}>Classify {severity.toLowerCase()}</Button>)}</>}{record.evidence.filter((item) => item.issueId === issue.id).map((item) => <Button key={item.id} variant="outline" onClick={() => void api.moveIn.adminEvidence(token, record.tenancyId, item.id).then(({ downloadUrl }) => window.open(downloadUrl, "_blank", "noopener,noreferrer")).catch((cause) => setError(cause instanceof Error ? cause.message : "Unable to view evidence."))}>View evidence</Button>)}</div>)}
      {record.refundRequests.filter((request) => request.status === "PENDING").map((request) => <div key={request.id}><p>Refund requested: {request.reason}.</p><label>Refund decision<select value={refundOutcome} onChange={(event) => setRefundOutcome(event.target.value as 'VALID_PROPERTY_FAILURE' | 'TENANT_CHANGED_MIND')}><option value="TENANT_CHANGED_MIND">Tenant changed mind — refund rent less 3%</option><option value="VALID_PROPERTY_FAILURE">Valid property failure — full refund</option></select></label><p>{refundOutcome === 'VALID_PROPERTY_FAILURE' ? 'Full refund: rent, caution, platform fee, legal fee and agent fee.' : 'Tenant-initiated cancellation: rent only, less a 3% charge. Caution, platform, legal and agent fees are retained.'}</p><Button disabled={busy} onClick={() => void act(() => api.moveIn.adminApprove(token, record.paymentId, request.id, reason, refundOutcome))}>{refundOutcome === 'VALID_PROPERTY_FAILURE' ? 'Approve full refund' : 'Approve rent-only refund'}</Button> <Button disabled={busy} variant="outline" onClick={() => void act(() => api.moveIn.adminReject(token, record.tenancyId, request.id, reason))}>Reject refund</Button></div>)}
      <label>Decision reason<textarea value={reason} onChange={(event) => setReason(event.target.value)} /></label>
      <details><summary>Decision history</summary>{record.events.filter((event) => !["DRAFT_SAVED", "CHECKLIST_SUBMITTED"].includes(event.type)).map((event) => <p key={event.id}>{event.type.replaceAll("_", " ")} · {typeof event.details.reason === "string" ? event.details.reason : typeof event.details.note === "string" ? event.details.note : ""}</p>)}</details>
    </article>)}
  </section>;
}
