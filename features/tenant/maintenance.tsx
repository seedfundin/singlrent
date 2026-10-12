"use client";

import { useCallback, useEffect, useState, type ChangeEvent } from "react";
import { CircleAlert, ClipboardPlus, LoaderCircle, Paperclip, Trash2, Wrench } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAppSession } from "@/features/app/app-provider";
import { Shell, Status, type Navigate } from "@/features/app/shell";
import { ApiFieldError } from "@/features/forms/api-field-error";
import {
  api,
  apiFieldErrors,
  apiFormError,
  type ApiFieldErrors,
  type ApiMaintenanceCategory,
  type ApiMaintenancePriority,
  type ApiMaintenanceRequest,
  type ApiTenancy,
} from "@/lib/api";
import "@/features/rentals/rental-flow.css";

const categories: Array<{ value: ApiMaintenanceCategory; label: string }> = [
  { value: "PLUMBING", label: "Plumbing" },
  { value: "ELECTRICITY", label: "Electricity" },
  { value: "APPLIANCE", label: "Appliance" },
  { value: "SECURITY", label: "Security" },
  { value: "STRUCTURAL", label: "Structural" },
  { value: "OTHER", label: "Other" },
];

const priorities: Array<{ value: ApiMaintenancePriority; label: string }> = [
  { value: "LOW", label: "Low" },
  { value: "MEDIUM", label: "Medium" },
  { value: "HIGH", label: "High" },
  { value: "URGENT", label: "Urgent" },
];

type FormSubmitEvent = Pick<Event, "preventDefault">;

type MaintenanceAttachment = { url: string; publicId: string; format?: string; bytes?: number };

function uploadDirectly(uploadUrl: string, file: File): Promise<void> {
  return new Promise((resolve, reject) => {
    const request = new XMLHttpRequest();
    request.open("PUT", uploadUrl);
    request.setRequestHeader("Content-Type", file.type);
    request.onerror = () => reject(new Error("The upload could not reach storage. Please try again."));
    request.onload = () => request.status >= 200 && request.status < 300
      ? resolve()
      : reject(new Error("The upload was rejected by storage. Please try again."));
    request.send(file);
  });
}

function label(value: string) {
  return value.replaceAll("_", " ").toLowerCase();
}

function tone(status: ApiMaintenanceRequest["status"]) {
  if (status === "RESOLVED" || status === "CLOSED") return "green" as const;
  if (status === "OPEN" || status === "ACKNOWLEDGED" || status === "IN_PROGRESS") return "gold" as const;
  return "slate" as const;
}

export function TenantMaintenance({ go }: { go: Navigate }) {
  const { session } = useAppSession();
  const [requests, setRequests] = useState<ApiMaintenanceRequest[]>([]);
  const [tenancies, setTenancies] = useState<ApiTenancy[]>([]);
  const [listingId, setListingId] = useState("");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState<ApiMaintenanceCategory>("OTHER");
  const [priority, setPriority] = useState<ApiMaintenancePriority>("MEDIUM");
  const [attachments, setAttachments] = useState<MaintenanceAttachment[]>([]);
  const [loading, setLoading] = useState(Boolean(session));
  const [saving, setSaving] = useState(false);
  const [uploadingAttachments, setUploadingAttachments] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<ApiFieldErrors>({});
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!session) {
      setRequests([]);
      setTenancies([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const [requestResponse, tenancyResponse] = await Promise.all([
        api.maintenance.list(session.accessToken),
        api.tenancies.list(session.accessToken, { pageSize: 50, status: "ACTIVE" }),
      ]);
      setRequests(requestResponse.items);
      setTenancies(tenancyResponse.items);
      setListingId((current) => current || tenancyResponse.items[0]?.listingId || "");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to load maintenance requests.");
    } finally {
      setLoading(false);
    }
  }, [session]);

  useEffect(() => {
    void load();
  }, [load]);

  const submit = async (event: FormSubmitEvent) => {
    event.preventDefault();
    if (!session || !listingId) return;
    const localErrors: ApiFieldErrors = {};
    if (title.trim().length < 3) localErrors.title = ["Short title must contain at least 3 characters."];
    if (description.trim().length < 10) localErrors.description = ["Description must contain at least 10 characters."];
    if (attachments.length > 5) localErrors.attachments = ["You can attach up to five files."];
    if (Object.keys(localErrors).length) {
      setFieldErrors(localErrors);
      setError("Please correct the highlighted fields and try again.");
      return;
    }
    setSaving(true);
    setError(null);
    setFieldErrors({});
    setNotice(null);
    try {
      const request = await api.maintenance.create(session.accessToken, {
        listingId,
        title: title.trim(),
        description: description.trim(),
        category,
        priority,
        attachments,
      });
      setRequests((current) => [request, ...current]);
      setTitle("");
      setDescription("");
      setCategory("OTHER");
      setPriority("MEDIUM");
      setAttachments([]);
      setNotice("Your maintenance request has been submitted.");
    } catch (cause) {
      const nextFieldErrors = apiFieldErrors(cause);
      setFieldErrors(nextFieldErrors);
      setError(apiFormError(cause, nextFieldErrors, "Unable to submit this maintenance request."));
    } finally {
      setSaving(false);
    }
  };

  const uploadAttachments = async (event: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files ?? []);
    event.target.value = "";
    if (!session || !files.length) return;
    if (attachments.length + files.length > 5) {
      setError("You can attach up to five photos or videos to a maintenance request.");
      return;
    }
    setUploadingAttachments(true);
    setError(null);
    try {
      const uploaded = await Promise.all(files.map(async (file) => {
        const mediaType = file.type.startsWith("image/") ? "IMAGE" : file.type.startsWith("video/") ? "VIDEO" : null;
        if (!mediaType) throw new Error("Attachments must be an image or video file.");
        const signed = await api.media.createPresignedUpload(session.accessToken, {
          kind: "maintenance",
          mediaType,
          mimeType: file.type,
          size: file.size,
        });
        await uploadDirectly(signed.uploadUrl, file);
        return {
          url: signed.publicUrl,
          publicId: signed.objectKey,
          format: file.type,
          bytes: file.size,
        } satisfies MaintenanceAttachment;
      }));
      setAttachments((current) => [...current, ...uploaded]);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to upload the attachment.");
    } finally {
      setUploadingAttachments(false);
    }
  };

  const removeAttachment = async (attachment: MaintenanceAttachment) => {
    if (!session) return;
    setError(null);
    try {
      await api.media.deleteUnassociatedUpload(session.accessToken, attachment.publicId);
      setAttachments((current) => current.filter((item) => item.publicId !== attachment.publicId));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to remove the attachment.");
    }
  };

  if (!session) {
    return <Shell go={go} role="tenant" title="Maintenance"><div className="page rental-flow"><section className="rental-empty"><Wrench size={24} /><h1>Sign in to manage maintenance</h1><p>Maintenance requests are visible only to tenancy participants.</p><Button onClick={() => go("sign-in")}>Sign in</Button></section></div></Shell>;
  }

  return <Shell go={go} role="tenant" title="Maintenance"><div className="page rental-flow tenant-maintenance-live">
    <div className="rental-flow-heading"><span><small>Home care</small><h1>Maintenance requests</h1><p>Submit and follow only the requests linked to your active tenancy.</p></span></div>
    {error && <p className="rental-alert error"><CircleAlert size={15} /> {error}</p>}
    {notice && <p className="rental-alert"><ClipboardPlus size={15} /> {notice}</p>}
    {loading ? <section className="rental-empty"><LoaderCircle className="spin" size={24} /><h1>Loading maintenance requests…</h1></section> : <>
      {tenancies.length ? <form className="panel live-data-form" onSubmit={(event) => void submit(event)}>
        <div className="subhead"><span><small>New request</small><h2>Tell us what needs attention</h2></span></div>
        <label>Home<select aria-invalid={Boolean(fieldErrors.listingId)} value={listingId} onChange={(event) => { setListingId(event.target.value); setFieldErrors((current) => { const { listingId: _listingId, ...remaining } = current; return remaining; }); }}>{tenancies.map((tenancy) => <option key={tenancy.id} value={tenancy.listingId}>{tenancy.listing.title}</option>)}</select><ApiFieldError errors={fieldErrors} field="listingId" /></label>
        <div className="live-form-grid">
          <label>Category<select value={category} onChange={(event) => setCategory(event.target.value as ApiMaintenanceCategory)}>{categories.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select></label>
          <label>Priority<select value={priority} onChange={(event) => setPriority(event.target.value as ApiMaintenancePriority)}>{priorities.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select></label>
        </div>
        <label>Short title<input aria-invalid={Boolean(fieldErrors.title)} value={title} onChange={(event) => { setTitle(event.target.value); setFieldErrors((current) => { const { title: _title, ...remaining } = current; return remaining; }); }} minLength={3} maxLength={120} required /><ApiFieldError errors={fieldErrors} field="title" /></label>
        <label>Describe the issue<textarea aria-invalid={Boolean(fieldErrors.description)} value={description} onChange={(event) => { setDescription(event.target.value); setFieldErrors((current) => { const { description: _description, ...remaining } = current; return remaining; }); }} minLength={10} maxLength={2000} required /><ApiFieldError errors={fieldErrors} field="description" /></label>
        <label>Evidence (optional)<input aria-invalid={Boolean(fieldErrors.attachments)} type="file" accept="image/jpeg,image/png,image/webp,video/mp4,video/webm,video/quicktime" multiple disabled={uploadingAttachments || saving} onChange={(event) => void uploadAttachments(event)} /><small>Up to five JPEG, PNG, WebP, MP4, WebM or MOV files. Files are uploaded securely before this request is submitted.</small><ApiFieldError errors={fieldErrors} field="attachments" /></label>
        {attachments.length > 0 && <ul className="maintenance-attachments">{attachments.map((attachment) => <li key={attachment.publicId}><span><Paperclip size={13} /> {attachment.publicId.split("/").at(-1)}</span><button type="button" onClick={() => void removeAttachment(attachment)} disabled={saving || uploadingAttachments} aria-label="Remove attachment"><Trash2 size={13} /></button></li>)}</ul>}
        <Button disabled={saving || uploadingAttachments}>{saving ? <><LoaderCircle className="spin" size={14} /> Submitting…</> : uploadingAttachments ? <><LoaderCircle className="spin" size={14} /> Uploading evidence…</> : <><ClipboardPlus size={14} /> Submit request</>}</Button>
      </form> : <section className="rental-empty"><Wrench size={24} /><h1>No active tenancy</h1><p>Maintenance reporting is available once an active tenancy is recorded.</p></section>}
      <section className="panel live-dashboard-panel">
        <div className="subhead"><span><small>Request history</small><h2>Your reported issues</h2></span></div>
        {requests.length ? <div className="live-dashboard-list">{requests.map((request) => <article key={request.id} className="live-record-row"><span><b>{request.title}</b><small>{request.listing.title} · {label(request.category)} · submitted {new Intl.DateTimeFormat("en-NG", { dateStyle: "medium" }).format(new Date(request.createdAt))}</small></span><Status tone={tone(request.status)}>{label(request.status)}</Status></article>)}</div> : <div className="dashboard-empty"><Wrench size={20} /><h2>No maintenance requests yet</h2><p>Requests you submit for an active tenancy will appear here.</p></div>}
      </section>
    </>}
  </div></Shell>;
}
