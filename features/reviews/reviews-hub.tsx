"use client";

import { useCallback, useEffect, useState } from "react";
import { CircleAlert, LoaderCircle, MessageSquareText, Send, Star } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAppSession } from "@/features/app/app-provider";
import { Shell, Status, type Navigate } from "@/features/app/shell";
import { ApiFieldError } from "@/features/forms/api-field-error";
import { api, apiFieldErrors, apiFormError, type ApiFieldErrors, type ApiReview, type ApiReviewOpportunity } from "@/lib/api";
import "@/features/rentals/rental-flow.css";
import "./reviews-hub.css";

function workspaceRole(roles: string[]): "tenant" | "landlord" | "agent" | "admin" {
  if (roles.includes("SUPER_ADMIN") || roles.includes("ADMIN")) return "admin";
  if (roles.includes("AGENT")) return "agent";
  if (roles.includes("LANDLORD")) return "landlord";
  return "tenant";
}

function targetName(target: ApiReviewOpportunity["targets"][number]) {
  if (target.type === "LISTING") return "the property";
  return target.user ? `${target.user.firstName} ${target.user.lastName}` : "this property contact";
}

function reviewTargetLabel(target: ApiReview["targetType"]) {
  return target.toLowerCase().replace("_", " ");
}

const standardReviewDimensions = [
  ["accuracy", "Accuracy"],
  ["condition", "Condition"],
  ["communication", "Communication"],
  ["reliability", "Reliability"],
] as const;

const tenantTenancyDimensions = [
  ["paymentReliability", "Payment reliability"],
  ["propertyCare", "Property care"],
  ["communication", "Communication"],
  ["tenancyObligations", "Tenancy obligations"],
] as const;

type ReviewDimensions = NonNullable<ApiReview["ratingDimensions"]>;
type ReviewDimensionKey = keyof ReviewDimensions;

function defaultDimensions(targetType: ApiReview["targetType"]): ReviewDimensions {
  const keys = targetType === "TENANT" ? tenantTenancyDimensions : standardReviewDimensions;
  return Object.fromEntries(keys.map(([key]) => [key, 5])) as ReviewDimensions;
}

export function ReviewsHub({ go }: { go: Navigate }) {
  const { session } = useAppSession();
  const token = session?.accessToken;
  const [reviews, setReviews] = useState<ApiReview[]>([]);
  const [received, setReceived] = useState<ApiReview[]>([]);
  const [opportunities, setOpportunities] = useState<ApiReviewOpportunity[]>([]);
  const [loading, setLoading] = useState(Boolean(session));
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState<{ tenancyId: string; targetType: ApiReview["targetType"] } | null>(null);
  const [score, setScore] = useState(5);
  const [dimensions, setDimensions] = useState<ReviewDimensions>(defaultDimensions("LISTING"));
  const [body, setBody] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<ApiFieldErrors>({});
  const [disputingReviewId, setDisputingReviewId] = useState<string | null>(null);
  const [disputeReason, setDisputeReason] = useState("");

  const load = useCallback(async () => {
    if (!token) { setLoading(false); return; }
    setLoading(true);
    setError(null);
    try {
      const [mine, available, receivedReviews] = await Promise.all([
        api.reviews.mine(token, { pageSize: 30 }),
        api.reviews.opportunities(token, { pageSize: 30 }),
        api.reviews.received(token, { pageSize: 30 }),
      ]);
      setReviews(mine.items);
      setOpportunities(available.items);
      setReceived(receivedReviews.items);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to load reviews.");
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => { void load(); }, [load]);

  const submit = async () => {
    if (!token || !draft) return;
    if (body.trim().length < 10) {
      setFieldErrors({ body: ["Review must contain at least 10 characters."] });
      setError("Please correct the highlighted fields and try again.");
      return;
    }
    setSubmitting(true);
    setError(null);
    setFieldErrors({});
    try {
      await api.reviews.create(token, { tenancyId: draft.tenancyId, targetType: draft.targetType, score, body: body.trim(), ratingDimensions: dimensions });
      setDraft(null);
      setBody("");
      setScore(5);
      setDimensions(defaultDimensions("LISTING"));
      await load();
    } catch (cause) {
      const nextFieldErrors = apiFieldErrors(cause);
      setFieldErrors(nextFieldErrors);
      setError(apiFormError(cause, nextFieldErrors, "Unable to publish this review."));
    } finally {
      setSubmitting(false);
    }
  };

  const submitDispute = async () => {
    if (!token || !disputingReviewId || disputeReason.trim().length < 10) return;
    setSubmitting(true);
    setError(null);
    try {
      await api.reviews.dispute(token, disputingReviewId, disputeReason.trim());
      setDisputingReviewId(null);
      setDisputeReason("");
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to submit this dispute.");
    } finally {
      setSubmitting(false);
    }
  };

  if (!session) return <Shell go={go} role="tenant" title="Reviews"><div className="page rental-flow"><section className="rental-empty"><Star size={24} /><h1>Sign in to view reviews</h1><p>Reviews are tied to completed tenancies or mutually confirmed inspections.</p><Button onClick={() => go("sign-in")}>Sign in</Button></section></div></Shell>;

  return <Shell go={go} role={workspaceRole(session.user.roles)} title="Reviews"><div className="page rental-flow reviews-live">
    <div className="rental-flow-heading"><span><small>Verified feedback</small><h1>Reviews</h1><p>Review a completed tenancy here, or use your inspection dashboard to review a mutually confirmed inspection.</p></span></div>
    {error && <p className="rental-alert error"><CircleAlert size={15} /> {error}</p>}
    {loading ? <section className="rental-empty"><LoaderCircle className="spin" size={24} /><h1>Loading reviews…</h1></section> : <>
      <section className="panel live-dashboard-panel"><div className="subhead"><span><small>Completed tenancies</small><h2>Feedback still available</h2></span></div>
        {opportunities.length ? <div className="review-opportunities">{opportunities.map((opportunity) => <article key={opportunity.tenancyId}><span><b>{opportunity.listing.title}</b><small>Completed tenancy · choose a target to leave feedback.</small></span><div>{opportunity.targets.filter((target) => !target.reviewed).map((target) => <Button key={target.type} size="sm" variant="outline" onClick={() => { setDraft({ tenancyId: opportunity.tenancyId, targetType: target.type }); setDimensions(defaultDimensions(target.type)); }}>Review {targetName(target)}</Button>)}{opportunity.targets.every((target) => target.reviewed) && <Status tone="green">All available reviews submitted</Status>}</div></article>)}</div> : <div className="dashboard-empty"><Star size={20} /><h2>No reviews available yet</h2><p>When a tenancy ends, eligible review targets will appear here.</p></div>}
      </section>
      {draft && <section className="panel live-data-form review-compose"><div className="subhead"><span><small>Your verified tenancy feedback</small><h2>Write a review</h2></span><Button variant="ghost" onClick={() => setDraft(null)}>Cancel</Button></div>
        <label>Rating<select aria-invalid={Boolean(fieldErrors.score)} value={score} onChange={(event) => { setScore(Number(event.target.value)); setFieldErrors((current) => { const { score: _score, ...remaining } = current; return remaining; }); }}>{[5, 4, 3, 2, 1].map((value) => <option key={value} value={value}>{value} star{value === 1 ? "" : "s"}</option>)}</select><ApiFieldError errors={fieldErrors} field="score" /></label>
        <fieldset className="review-dimensions"><legend>{draft.targetType === "TENANT" ? "Tenant rental record categories" : "Optional detail ratings"}</legend>{(draft.targetType === "TENANT" ? tenantTenancyDimensions : standardReviewDimensions).map(([key, label]) => <label key={key}>{label}<select value={dimensions[key as ReviewDimensionKey] ?? 5} onChange={(event) => setDimensions((current) => ({ ...current, [key]: Number(event.target.value) }))}>{[5, 4, 3, 2, 1].map((value) => <option key={value} value={value}>{value}/5</option>)}</select></label>)}</fieldset>
        <label>Review<textarea aria-invalid={Boolean(fieldErrors.body)} value={body} onChange={(event) => { setBody(event.target.value); setFieldErrors((current) => { const { body: _body, ...remaining } = current; return remaining; }); }} maxLength={2000} placeholder={draft.targetType === "TENANT" ? "Share factual feedback from the completed tenancy." : "Share facts about your completed tenancy."} /><ApiFieldError errors={fieldErrors} field="body" /></label>
        <Button disabled={submitting || body.trim().length < 10} onClick={() => void submit()}>{submitting ? <><LoaderCircle className="spin" size={14} /> Publishing…</> : <><Send size={14} /> Publish review</>}</Button>
      </section>}
      <section className="panel live-dashboard-panel"><div className="subhead"><span><small>Feedback you submitted</small><h2>Your reviews</h2></span></div>
        {reviews.length ? <div className="live-dashboard-list">{reviews.map((review) => <article className="live-record-row" key={review.id}><span><b>{review.listing?.title ?? "Listing no longer available"}</b><small><Star size={13} /> {review.score}/5 · {review.inspectionId ? "Inspection" : "Tenancy"} · {reviewTargetLabel(review.targetType)} · {review.body}</small></span><Status tone={review.status === "PUBLISHED" ? "green" : review.status === "HIDDEN" ? "gold" : "red"}>{review.status.toLowerCase()}</Status></article>)}</div> : <div className="dashboard-empty"><MessageSquareText size={20} /><h2>You have not written any reviews</h2><p>Submitted feedback will appear here with its real moderation status.</p></div>}
      </section>
      <section className="panel live-dashboard-panel"><div className="subhead"><span><small>Feedback about you</small><h2>Received reviews</h2></span></div>
        {received.length ? <div className="live-dashboard-list">{received.map((review) => <article className="live-record-row review-received" key={review.id}><span><b>{review.listing?.title ?? "Completed tenancy"}</b><small><Star size={13} /> {review.score}/5 · {review.inspectionId ? "Inspection" : "Tenancy"} · from {review.author.firstName} {review.author.lastName} · {review.body}</small>{review.disputedAt && !review.disputeResolvedAt && <small>Your dispute is awaiting moderation.</small>}</span><div>{review.status === 'PUBLISHED' && !review.disputedAt && <Button size="sm" variant="outline" onClick={() => { setDisputingReviewId(review.id); setDisputeReason(""); }}>Dispute</Button>}<Status tone={review.status === "PUBLISHED" ? "green" : review.status === "HIDDEN" ? "gold" : "red"}>{review.status.toLowerCase()}</Status></div></article>)}</div> : <div className="dashboard-empty"><MessageSquareText size={20} /><h2>No received reviews yet</h2><p>Reviews about your verified interactions will appear here.</p></div>}
      </section>
      {disputingReviewId && <section className="panel live-data-form review-compose"><div className="subhead"><span><small>Moderation request</small><h2>Dispute this review</h2></span><Button variant="ghost" onClick={() => setDisputingReviewId(null)}>Cancel</Button></div><label>Tell us what is inaccurate<textarea value={disputeReason} onChange={(event) => setDisputeReason(event.target.value)} minLength={10} maxLength={1000} placeholder="Give factual details that a moderator can review." /></label><Button disabled={submitting || disputeReason.trim().length < 10} onClick={() => void submitDispute()}>{submitting ? <><LoaderCircle className="spin" size={14} /> Submitting…</> : "Submit dispute"}</Button></section>}
    </>}
  </div></Shell>;
}
