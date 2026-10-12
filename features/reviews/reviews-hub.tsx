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

export function ReviewsHub({ go }: { go: Navigate }) {
  const { session } = useAppSession();
  const token = session?.accessToken;
  const tenant = session?.user.roles.includes("TENANT") ?? false;
  const [reviews, setReviews] = useState<ApiReview[]>([]);
  const [opportunities, setOpportunities] = useState<ApiReviewOpportunity[]>([]);
  const [loading, setLoading] = useState(Boolean(session));
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState<{ tenancyId: string; targetType: ApiReview["targetType"] } | null>(null);
  const [score, setScore] = useState(5);
  const [body, setBody] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<ApiFieldErrors>({});

  const load = useCallback(async () => {
    if (!token) { setLoading(false); return; }
    setLoading(true);
    setError(null);
    try {
      const [mine, available] = await Promise.all([
        api.reviews.mine(token, { pageSize: 30 }),
        tenant ? api.reviews.opportunities(token, { pageSize: 30 }) : Promise.resolve({ items: [], meta: { page: 1, pageSize: 30, total: 0, totalPages: 0 } }),
      ]);
      setReviews(mine.items);
      setOpportunities(available.items);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to load reviews.");
    } finally {
      setLoading(false);
    }
  }, [tenant, token]);

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
      await api.reviews.create(token, { tenancyId: draft.tenancyId, targetType: draft.targetType, score, body: body.trim() });
      setDraft(null);
      setBody("");
      setScore(5);
      await load();
    } catch (cause) {
      const nextFieldErrors = apiFieldErrors(cause);
      setFieldErrors(nextFieldErrors);
      setError(apiFormError(cause, nextFieldErrors, "Unable to publish this review."));
    } finally {
      setSubmitting(false);
    }
  };

  if (!session) return <Shell go={go} role="tenant" title="Reviews"><div className="page rental-flow"><section className="rental-empty"><Star size={24} /><h1>Sign in to view reviews</h1><p>Reviews and review eligibility are tied to your own completed tenancies.</p><Button onClick={() => go("sign-in")}>Sign in</Button></section></div></Shell>;

  return <Shell go={go} role={workspaceRole(session.user.roles)} title="Reviews"><div className="page rental-flow reviews-live">
    <div className="rental-flow-heading"><span><small>Tenancy feedback</small><h1>Reviews</h1><p>Only tenants with a completed tenancy can publish a review. Your own feedback and eligibility are shown here.</p></span></div>
    {error && <p className="rental-alert error"><CircleAlert size={15} /> {error}</p>}
    {loading ? <section className="rental-empty"><LoaderCircle className="spin" size={24} /><h1>Loading reviews…</h1></section> : <>
      {tenant && <section className="panel live-dashboard-panel"><div className="subhead"><span><small>Completed tenancies</small><h2>Feedback still available</h2></span></div>
        {opportunities.length ? <div className="review-opportunities">{opportunities.map((opportunity) => <article key={opportunity.tenancyId}><span><b>{opportunity.listing.title}</b><small>Completed tenancy · choose a target to leave feedback.</small></span><div>{opportunity.targets.filter((target) => !target.reviewed).map((target) => <Button key={target.type} size="sm" variant="outline" onClick={() => setDraft({ tenancyId: opportunity.tenancyId, targetType: target.type })}>Review {targetName(target)}</Button>)}{opportunity.targets.every((target) => target.reviewed) && <Status tone="green">All available reviews submitted</Status>}</div></article>)}</div> : <div className="dashboard-empty"><Star size={20} /><h2>No reviews available yet</h2><p>When a tenancy ends, eligible review targets will appear here.</p></div>}
      </section>}
      {draft && <section className="panel live-data-form review-compose"><div className="subhead"><span><small>Your verified tenancy feedback</small><h2>Write a review</h2></span><Button variant="ghost" onClick={() => setDraft(null)}>Cancel</Button></div>
        <label>Rating<select aria-invalid={Boolean(fieldErrors.score)} value={score} onChange={(event) => { setScore(Number(event.target.value)); setFieldErrors((current) => { const { score: _score, ...remaining } = current; return remaining; }); }}>{[5, 4, 3, 2, 1].map((value) => <option key={value} value={value}>{value} star{value === 1 ? "" : "s"}</option>)}</select><ApiFieldError errors={fieldErrors} field="score" /></label>
        <label>Review<textarea aria-invalid={Boolean(fieldErrors.body)} value={body} onChange={(event) => { setBody(event.target.value); setFieldErrors((current) => { const { body: _body, ...remaining } = current; return remaining; }); }} maxLength={2000} placeholder="Share facts about your completed tenancy." /><ApiFieldError errors={fieldErrors} field="body" /></label>
        <Button disabled={submitting || body.trim().length < 10} onClick={() => void submit()}>{submitting ? <><LoaderCircle className="spin" size={14} /> Publishing…</> : <><Send size={14} /> Publish review</>}</Button>
      </section>}
      <section className="panel live-dashboard-panel"><div className="subhead"><span><small>Feedback you submitted</small><h2>Your reviews</h2></span></div>
        {reviews.length ? <div className="live-dashboard-list">{reviews.map((review) => <article className="live-record-row" key={review.id}><span><b>{review.listing?.title ?? "Listing no longer available"}</b><small><Star size={13} /> {review.score}/5 for {reviewTargetLabel(review.targetType)} · {review.body}</small></span><Status tone={review.status === "PUBLISHED" ? "green" : review.status === "HIDDEN" ? "gold" : "red"}>{review.status.toLowerCase()}</Status></article>)}</div> : <div className="dashboard-empty"><MessageSquareText size={20} /><h2>You have not written any reviews</h2><p>Submitted feedback will appear here with its real moderation status.</p></div>}
      </section>
    </>}
  </div></Shell>;
}
