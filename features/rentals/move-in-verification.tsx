"use client";

import { useEffect, useState } from "react";
import { Camera, CheckCircle2, ChevronRight, CircleAlert, ClipboardCheck, History, KeyRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { api, ApiError, type ApiMoveIn, type ApiTenancy, type MoveInAnswer } from "@/lib/api";

const items = [
  ["PROPERTY_ACCESS", "Property access", "Keys, entry and access to the home", [["INACCESSIBLE_PROPERTY", "Property cannot be accessed"]]],
  ["ELECTRICITY", "Electricity", "Lights, sockets and safe wiring", [["DANGEROUS_WIRING", "Dangerous wiring"], ["ELECTRICAL_FAILURE", "Electrical failure"]]],
  ["WATER_SUPPLY", "Water supply", "The promised water supply is available", [["NO_PROMISED_WATER", "No promised water"], ["WATER_SUPPLY_PROBLEM", "Water supply problem"]]],
  ["BATHROOM", "Toilets and bathrooms", "Fixtures are safe and usable", [["UNUSABLE_BATHROOM", "Bathroom cannot be used"], ["DEFECTIVE_BATHROOM", "Bathroom defect"]]],
  ["DRAINAGE", "Sewage and drainage", "There are no significant leaks or blockages", [["MAJOR_SEWAGE_LEAK", "Major sewage leak"], ["SIGNIFICANT_PLUMBING", "Significant plumbing problem"], ["MINOR_PLUMBING", "Minor plumbing issue"]]],
  ["DOORS_WINDOWS", "Doors and windows", "Entries can close and secure properly", [["INSECURE_DOORS_WINDOWS", "Doors or windows are insecure"]]],
  ["STRUCTURAL_SAFETY", "Structural safety", "No visible structural or safety hazard", [["STRUCTURAL_HAZARD", "Structural hazard"]]],
  ["PROPERTY_CONDITION", "Property condition", "The home reasonably matches the listing", [["MATERIAL_MISREPRESENTATION", "Material difference from listing"], ["COSMETIC_IMPERFECTION", "Minor cosmetic imperfection"]]],
  ["AMENITIES", "Agreed amenities", "Promised essential amenities are available", [["MISSING_ESSENTIAL_AMENITY", "Essential amenity missing"]]],
  ["REPAIRS", "Outstanding repairs", "Agreed essential repairs are complete", [["OUTSTANDING_ESSENTIAL_REPAIR", "Essential repair not completed"], ["MISSING_AGREED_REPAIRS", "Agreed repairs not completed"]]],
] as const;

function readable(value: string) {
  return value.replaceAll("_", " ").toLowerCase();
}

function statusMessage(record: ApiMoveIn) {
  if (record.status === "VERIFIED") return "Your property check is approved. Your documents are ready for the next step.";
  if (record.status === "ISSUE_REPORTED" || record.status === "UNDER_REVIEW") return "An issue is being reviewed. Your funds remain protected while it is resolved.";
  if (record.submittedAt) return "Your checklist has been submitted and is being processed.";
  if (record.handoverAt) return "Review the home carefully, then complete every check below.";
  return "When you receive the keys or access to the home, confirm it here to begin your inspection.";
}

export function MoveInVerification({ tenancy, token, tenant, onRefresh }: { tenancy: ApiTenancy; token: string; tenant: boolean; onRefresh?: () => Promise<void> }) {
  const [record, setRecord] = useState<ApiMoveIn | null>(null);
  const [answers, setAnswers] = useState<MoveInAnswer[]>([]);
  const [note, setNote] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [issueItem, setIssueItem] = useState("");
  const [issueType, setIssueType] = useState("");
  const [issueDescription, setIssueDescription] = useState("");

  useEffect(() => {
    let active = true;
    api.moveIn.get(token, tenancy.id)
      .then((value) => { if (active) { setRecord(value); setAnswers(value.draft ?? []); } })
      .catch((cause: unknown) => { if (active && !(cause instanceof ApiError && cause.status === 404)) setError(cause instanceof Error ? cause.message : "Unable to load verification."); });
    return () => { active = false; };
  }, [token, tenancy.id]);

  const run = async (operation: () => Promise<ApiMoveIn>) => {
    setBusy(true);
    setError("");
    try {
      setRecord(await operation());
      await onRefresh?.();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Unable to update verification."); } finally { setBusy(false); }
  };
  const change = (item: string, update: Partial<MoveInAnswer>) => setAnswers((previous) => {
    const existing = previous.find((answer) => answer.item === item);
    return [...previous.filter((answer) => answer.item !== item), { item, result: existing?.result ?? "SATISFACTORY", ...existing, ...update }];
  });
  const upload = async (file: File, issueId?: string) => {
    setBusy(true);
    setError("");
    try {
      const mediaType = file.type.startsWith("image/") ? "IMAGE" : "VIDEO";
      const signedUpload = await api.media.createPresignedUpload(token, { kind: "move_in", tenancyId: tenancy.id, mediaType, mimeType: file.type, size: file.size });
      const response = await fetch(signedUpload.uploadUrl, { method: "PUT", headers: { "content-type": file.type }, body: file });
      if (!response.ok) throw new Error("Evidence upload failed.");
      setRecord(await api.moveIn.attachEvidence(token, tenancy.id, signedUpload.objectKey, issueId));
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Unable to upload evidence."); } finally { setBusy(false); }
  };

  if (!record) return error ? <p className="rental-alert error">{error}</p> : null;

  const answeredCount = items.filter(([key]) => answers.some((answer) => answer.item === key)).length;
  const allAnswered = answeredCount === items.length;
  const reportedIssuesComplete = answers.every((answer) => answer.result !== "ISSUE_FOUND" || Boolean(answer.issueType && answer.description?.trim()));
  const inspectionComplete = Boolean(record.submittedAt);
  const hasOpenIssue = record.issues.some((issue) => issue.status !== "RESOLVED");
  const canRequestRefund = tenant && tenancy.status === "PENDING_MOVE_IN" && record.status !== "CANCELLED";

  return <section className="move-in-workflow" aria-label={`Move-in verification for ${tenancy.listing.title}`}>
    <header className="move-in-workflow-header">
      <div>
        <p className="move-in-eyebrow">Your next step after payment</p>
        <h2>Inspect your home before moving in</h2>
        <p>{tenancy.listing.title}{tenancy.listing.address ? ` · ${tenancy.listing.address}` : ""}</p>
      </div>
      <span className={`move-in-status move-in-status-${record.status.toLowerCase()}`}>{readable(record.status)}</span>
    </header>

    <div className="move-in-progress" aria-label="Move-in progress">
      <div className={record.handoverAt ? "complete" : "current"}><span>1</span><b>Receive access</b><small>Get the keys or entry</small></div>
      <ChevronRight aria-hidden="true" />
      <div className={inspectionComplete ? "complete" : record.handoverAt ? "current" : "upcoming"}><span>2</span><b>Inspect the home</b><small>Complete the checklist</small></div>
      <ChevronRight aria-hidden="true" />
      <div className={record.status === "VERIFIED" ? "current" : "upcoming"}><span>3</span><b>Sign your documents</b><small>Agreement and guarantor form</small></div>
    </div>

    <div className="move-in-guidance">
      <ClipboardCheck size={22} aria-hidden="true" />
      <div><b>{record.handoverAt ? inspectionComplete ? "Inspection submitted" : "Your inspection checklist" : "Waiting for property access"}</b><p>{statusMessage(record)}</p></div>
      {record.deadlineAt && <small>Complete by {new Intl.DateTimeFormat("en-NG", { dateStyle: "medium", timeStyle: "short" }).format(new Date(record.deadlineAt))}</small>}
    </div>

    {error && <p className="rental-alert error"><CircleAlert size={15} /> {error}</p>}

    {tenant && !record.handoverAt && <section className="move-in-access-card">
      <div><KeyRound size={24} aria-hidden="true" /><div><h3>Have you received access to the home?</h3><p>Confirm only after you have the keys, access code, or have been let into the apartment. This opens your inspection checklist.</p></div></div>
      <Button disabled={busy} onClick={() => void run(() => api.moveIn.handover(token, tenancy.id))}>I have received access <ChevronRight size={15} /></Button>
    </section>}

    {tenant && record.handoverAt && !inspectionComplete && <section className="move-in-checklist">
      <header><div><p className="move-in-eyebrow">Step 2 of 3</p><h3>Check each part of the home</h3><p>Choose the result that best reflects what you find. Use “Issue found” for anything that needs attention.</p></div><strong>{answeredCount}<small> / {items.length} completed</small></strong></header>
      <div className="move-in-checklist-progress"><span style={{ width: `${(answeredCount / items.length) * 100}%` }} /></div>
      <div className="move-in-checklist-grid">
        {items.map(([key, title, description, types], index) => {
          const answer = answers.find((item) => item.item === key);
          return <article className={`move-in-checklist-item ${answer ? "answered" : ""} ${answer?.result === "ISSUE_FOUND" ? "has-issue" : ""}`} key={key}>
            <span className="move-in-item-number">{answer ? <CheckCircle2 size={17} /> : index + 1}</span>
            <div><h4>{title}</h4><p>{description}</p></div>
            <label><span className="sr-only">Result for {title}</span><select value={answer?.result ?? ""} onChange={(event) => change(key, { result: event.target.value as MoveInAnswer["result"], description: undefined, issueType: undefined })}><option value="">Select result</option><option value="SATISFACTORY">Everything is okay</option><option value="ISSUE_FOUND">Issue found</option>{key !== "PROPERTY_ACCESS" && <option value="NOT_APPLICABLE">Not applicable</option>}</select></label>
            {answer?.result === "ISSUE_FOUND" && <div className="move-in-item-issue"><select aria-label={`Issue type for ${title}`} value={answer.issueType ?? ""} onChange={(event) => change(key, { issueType: event.target.value })}><option value="">Select issue type</option>{types.map(([value, issueLabel]) => <option key={value} value={value}>{issueLabel}</option>)}</select><textarea value={answer.description ?? ""} placeholder="Briefly describe what you found" onChange={(event) => change(key, { description: event.target.value })} /></div>}
          </article>;
        })}
      </div>
      <footer><p>{!allAnswered ? `Complete ${items.length - answeredCount} more ${items.length - answeredCount === 1 ? "check" : "checks"} to submit.` : !reportedIssuesComplete ? "Add the issue type and a brief description for every issue you found." : "Everything is complete. Review your answers before submitting."}</p><div><Button variant="outline" disabled={busy || !answeredCount} onClick={() => void run(() => api.moveIn.draft(token, tenancy.id, answers))}>Save and continue later</Button><Button disabled={busy || !allAnswered || !reportedIssuesComplete} onClick={() => void run(() => api.moveIn.submit(token, tenancy.id, answers))}>Submit checklist <ChevronRight size={15} /></Button></div></footer>
    </section>}

    {record.issues.length > 0 && <section className="move-in-existing-issues"><header><div><p className="move-in-eyebrow">Reported issues</p><h3>{hasOpenIssue ? "Your reported issues" : "Resolved issues"}</h3></div><span>{record.issues.length}</span></header>{record.issues.map((issue) => <article key={issue.id}><div><b>{issue.item.replaceAll("_", " ")}</b><p>{issue.description}</p><small>{issue.severity.toLowerCase()} priority · {readable(issue.status)}</small></div>{issue.status !== "RESOLVED" && <details><summary>Manage this issue</summary><div><textarea placeholder="Describe an update or reason" value={note} onChange={(event) => setNote(event.target.value)} />{!tenant && <Button disabled={busy} onClick={() => void run(() => api.moveIn.issueAction(token, tenancy.id, issue.id, "REPAIR_REPORTED", note))}>Report repair</Button>}{tenant && issue.status === "REPAIR_REPORTED" && <Button disabled={busy} onClick={() => void run(() => api.moveIn.issueAction(token, tenancy.id, issue.id, "TENANT_CONFIRMED", note))}>Confirm repair</Button>}{tenant && issue.severity === "MINOR" && <Button variant="outline" disabled={busy} onClick={() => void run(() => api.moveIn.issueAction(token, tenancy.id, issue.id, "DISPUTE_CLASSIFICATION", note))}>Challenge classification</Button>}<Button variant="outline" disabled={busy} onClick={() => void run(() => api.moveIn.issueAction(token, tenancy.id, issue.id, "REQUEST_REVIEW", note))}>Request review</Button><label className="move-in-upload"><Camera size={14} /> Add photo or video<input type="file" accept="image/jpeg,image/png,image/webp,video/mp4,video/webm,video/quicktime" disabled={busy} onChange={(event) => { const file = event.target.files?.[0]; if (file) void upload(file, issue.id); event.currentTarget.value = ""; }} /></label></div></details>}</article>)}</section>}

    {tenant && record.status !== "CANCELLED" && <details className="move-in-secondary-action"><summary><span><CircleAlert size={17} /> Report a serious property issue</span><small>Use this if something important was missed</small></summary><div className="move-in-secondary-content"><p>{record.handoverAt ? "If the home has a serious issue, report it with enough detail for a fair review." : "If you cannot access the property, you can report that before confirming handover."}</p><div className="move-in-report-grid"><select aria-label="Issue category" value={issueItem} onChange={(event) => { setIssueItem(event.target.value); setIssueType(""); }}><option value="">Select category</option>{items.filter(([key]) => record.handoverAt || key === "PROPERTY_ACCESS").map(([key, title]) => <option key={key} value={key}>{title}</option>)}</select><select aria-label="Issue type" value={issueType} onChange={(event) => setIssueType(event.target.value)}><option value="">Select issue type</option>{items.find(([key]) => key === issueItem)?.[3].map(([value, issueLabel]) => <option key={value} value={value}>{issueLabel}</option>)}</select><textarea value={issueDescription} onChange={(event) => setIssueDescription(event.target.value)} placeholder="Describe the issue clearly" /></div><Button disabled={busy || !issueItem || !issueType || !issueDescription.trim()} onClick={() => void run(async () => { const updated = await api.moveIn.reportIssue(token, tenancy.id, issueItem, issueType, issueDescription); setIssueDescription(""); setIssueItem(""); setIssueType(""); return updated; })}>Report issue</Button></div></details>}

    {canRequestRefund && <details className="move-in-secondary-action"><summary><span>Cancellation or refund request</span><small>Available before the tenancy begins</small></summary><div className="move-in-secondary-content"><p>Explain why you need a refund. An administrator will review the request using the cancellation policy and your supporting evidence.</p><label className="move-in-upload"><Camera size={14} /> Add a supporting photo or video<input type="file" accept="image/jpeg,image/png,image/webp,video/mp4,video/webm,video/quicktime" disabled={busy} onChange={(event) => { const file = event.target.files?.[0]; if (file) void upload(file); event.currentTarget.value = ""; }} /></label>{!record.refundRequests.some((request) => request.status === "PENDING") ? <><textarea value={note} onChange={(event) => setNote(event.target.value)} placeholder="Explain your request" /><Button disabled={busy || !note.trim()} onClick={() => void run(() => api.moveIn.refund(token, tenancy.id, note))}>Request refund review</Button></> : <p className="move-in-pending-request">Your refund request is awaiting review.</p>}</div></details>}

    {record.events.length > 0 && <details className="move-in-history"><summary><History size={16} /> Verification history</summary><div>{record.events.filter((event) => !["DRAFT_SAVED", "CHECKLIST_SUBMITTED"].includes(event.type)).map((event) => <p key={event.id}><b>{readable(event.type)}</b>{typeof event.details.note === "string" ? ` · ${event.details.note}` : typeof event.details.reason === "string" ? ` · ${event.details.reason}` : ""}</p>)}</div></details>}
  </section>;
}
