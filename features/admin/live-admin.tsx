"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import {
  ArrowLeft,
  ArrowRight,
  Building2,
  Check,
  CircleAlert,
  Clock3,
  FileText,
  KeyRound,
  LoaderCircle,
  ReceiptText,
  Search,
  Plus,
  ShieldCheck,
  UserRound,
  Users,
  WalletCards,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Shell, Status } from "@/features/app/shell";
import { useAppSession } from "@/features/app/app-provider";
import { listingImages } from "@/features/listings/listing-card";
import { MoveInOperations } from "./move-in-operations";
import type { View } from "@/lib/routes";
import {
  api,
  type AdminPermissionKey,
  type ApiAdminUser,
  type ApiAuditLog,
  type ApiAdminTransaction,
  type ApiListing,
  type PermissionEffect,
} from "@/lib/api";
import { formatNaira } from "@/lib/pricing";
import "./live-admin.css";

type Go = (view: View, query?: Record<string, string>) => void;
type ListingAction = "suspend";
type PermissionChoice = PermissionEffect | "INHERIT";

const permissionGroups: Array<[string, Array<[AdminPermissionKey, string]>]> = [
  ["Users", [["USERS_VIEW", "View users"], ["USERS_EDIT", "Edit users"], ["USERS_SUSPEND", "Suspend users"], ["KYC_VIEW", "View KYC"], ["KYC_REVIEW", "Approve/reject KYC"]]],
  ["Properties", [["LISTINGS_VIEW", "View listings"], ["LISTINGS_SUSPEND", "Suspend listings"]]],
  ["Payments", [["TRANSACTIONS_VIEW", "View transactions"], ["ESCROW_MANAGE", "Manage protected payments"], ["PAYOUTS_RELEASE", "Release payouts"], ["REFUNDS_PROCESS", "Process refunds"], ["PLATFORM_FEES_VIEW", "View platform fees"], ["AGENT_COMMISSIONS_VIEW", "View agent commissions"]]],
  ["Reports & maintenance", [["REPORTS_VIEW", "View reports"], ["REPORTS_INVESTIGATE", "Investigate reports"], ["REPORTS_RESOLVE", "Resolve reports"], ["MAINTENANCE_MANAGE", "Manage maintenance cases"]]],
  ["Reviews", [["REVIEWS_VIEW", "View reviews"], ["REVIEWS_MODERATE", "Moderate/remove reviews"]]],
  ["Administration", [["ADMINS_CREATE", "Create admins"], ["ADMIN_PERMISSIONS_EDIT", "Edit admin permissions"], ["AUDIT_LOGS_VIEW", "View audit logs"], ["SYSTEM_SETTINGS_MODIFY", "Modify system settings"]]],
];

const listingStatuses = ["PUBLISHED", "SUSPENDED"] as const;

function userIsSuperAdmin(user: ApiAdminUser) {
  return user.userRoles.some(({ role }) => role.code === "SUPER_ADMIN");
}

function roleLabel(user: ApiAdminUser) {
  if (user.userRoles.some(({ role }) => role.code === "SUPER_ADMIN")) return "Super Admin";
  if (user.userRoles.some(({ role }) => role.code === "ADMIN")) return "Admin";
  return "Member";
}

function initials(firstName: string, lastName: string) {
  return `${firstName.charAt(0)}${lastName.charAt(0)}`.toUpperCase();
}

function displayDate(value: string | null) {
  if (!value) return "Never";
  return new Intl.DateTimeFormat("en-NG", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}

function listingStatusLabel(status: ApiListing["status"]) {
  return status === "PENDING_REVIEW" ? "Under review" : status.toLowerCase().replace("_", " ");
}

function statusTone(status: ApiListing["status"]) {
  if (status === "PUBLISHED") return "green" as const;
  if (status === "PENDING_REVIEW") return "gold" as const;
  if (status === "REJECTED" || status === "SUSPENDED") return "red" as const;
  return "slate" as const;
}

function transactionStatusTone(status: string) {
  if (status === "SUCCESS" || status === "PAID" || status === "RELEASED") return "green" as const;
  if (status === "FAILED" || status === "REVERSED" || status === "REFUNDED" || status === "CANCELLED") return "red" as const;
  if (status === "PENDING" || status === "INITIALIZED" || status === "SCHEDULED" || status === "PROCESSING") return "gold" as const;
  return "slate" as const;
}

function transactionLabel(value: string) {
  return value.replace(/_/g, " ").toLowerCase();
}

function listingRent(listing: ApiListing) {
  const kobo = Number(listing.annualRentKobo);
  return formatNaira(Number.isFinite(kobo) ? kobo / 100 : 0);
}

export function AdminAccess({ go, title, children }: { go: Go; title: string; children: ReactNode }) {
  const { session } = useAppSession();
  const isAdmin = session?.user.roles.includes("ADMIN") || session?.user.roles.includes("SUPER_ADMIN");
  if (!session) {
    return <Shell go={go} role="admin" title={title}><section className="page admin-access-state"><ShieldCheck size={24} /><h1>Sign in to access administration</h1><p>Use an administrator account to review SingleRent operations.</p><Button onClick={() => go("sign-in")}>Sign in <ArrowRight size={14} /></Button></section></Shell>;
  }
  if (!isAdmin) {
    return <Shell go={go} role="admin" title={title}><section className="page admin-access-state"><CircleAlert size={24} /><h1>Administrator access required</h1><p>This workspace is only available to Admin and Super Admin accounts.</p><Button variant="outline" onClick={() => go("home")}>Back to home</Button></section></Shell>;
  }
  return <>{children}</>;
}

function ErrorMessage({ message }: { message: string | null }) {
  return message ? <p className="admin-live-error" role="alert"><CircleAlert size={15} /> {message}</p> : null;
}

export function LiveAdminDashboard({ go }: { go: Go }) {
  return <AdminAccess go={go} title="Overview"><LiveAdminDashboardContent go={go} /></AdminAccess>;
}

function LiveAdminDashboardContent({ go }: { go: Go }) {
  const { session } = useAppSession();
  const token = session?.accessToken;
  const [liveListings, setLiveListings] = useState<ApiListing[]>([]);
  const [liveListingCount, setLiveListingCount] = useState<number | null>(null);
  const [summary, setSummary] = useState<{ users: number; administrators: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [pushActivity, setPushActivity] = useState<Awaited<ReturnType<typeof api.admin.notificationActivity>> | null>(null);

  useEffect(() => {
    if (!token || !session?.user.roles.includes('SUPER_ADMIN')) return;
    let active = true;
    api.admin.notificationActivity(token).then((result) => { if (active) setPushActivity(result); }).catch(() => { if (active) setPushActivity(null); });
    return () => { active = false; };
  }, [token, session?.user.roles]);

  useEffect(() => {
    if (!token) return;
    let active = true;
    setLoading(true);
    Promise.all([
      api.admin.listings(token, { status: "PUBLISHED", pageSize: 5 }),
      api.dashboard.get(token),
    ]).then(([listingResponse, dashboard]) => {
      if (!active) return;
      setLiveListings(listingResponse.items);
      setLiveListingCount(listingResponse.total);
      setSummary(dashboard.admin ? {
        users: dashboard.admin.users,
        administrators: dashboard.admin.administrators,
      } : null);
    }).catch((cause: unknown) => active && setError(cause instanceof Error ? cause.message : "Unable to load live admin data."))
      .finally(() => active && setLoading(false));
    return () => { active = false; };
  }, [token]);

  if (!session) return null;
  return <Shell go={go} role="admin" title="Overview"><div className="page live-admin-page">
    <div className="page-title"><span><small>Live marketplace operations</small><h1>Admin overview</h1><p>Monitor live listings and take safety action using the live SingleRent API.</p></span><Button variant="outline" onClick={() => go("admin-listings")}>Manage listings <ArrowRight size={14} /></Button></div>
    <ErrorMessage message={error} />
    <div className="admin-summary">
      <div className="metric"><span>Live listings</span><strong>{loading ? "…" : liveListingCount ?? "—"}</strong><small>Published automatically by verified publishers</small></div>
      <div className="metric gold"><span>Platform users</span><strong>{loading ? "…" : summary?.users ?? "—"}</strong><small>Visible to your permission set</small></div>
      <div className="metric green"><span>Administrators</span><strong>{loading ? "…" : summary?.administrators ?? "—"}</strong><small>Admin and Super Admin accounts</small></div>
    </div>
    {pushActivity && <section className="panel live-queue-preview"><div className="subhead"><span><small>Browser notifications</small><h2>Push activity</h2></span></div>{pushActivity.enabled ? <p>{pushActivity.activeDevices} active devices · {pushActivity.attempts} submission attempts · {pushActivity.accepted} accepted · {pushActivity.failed} failed · {pushActivity.invalid} invalid subscriptions removed. Provider acceptance does not prove device delivery.</p> : <p>Browser push notifications are disabled.</p>}</section>}
    <section className="panel live-queue-preview"><div className="subhead"><span><small>Live properties</small><h2>Recently published</h2></span><Button variant="ghost" onClick={() => go("admin-listings")}>Manage listings <ArrowRight size={13} /></Button></div>
      {loading ? <div className="admin-live-loading"><LoaderCircle size={17} /> Loading live listings…</div> : liveListings.length ? liveListings.map((listing) => <article key={listing.id}><span>{listing.media[0] ? <img src={listing.media[0].url} alt="" /> : <i><Building2 size={15} /></i>}<b>{listing.title}<small>{listing.area}, {listing.state} · {listingRent(listing)} / year</small></b></span><Status tone="green">Published</Status></article>) : <div className="admin-live-empty"><Check size={17} /> No published listings yet.</div>}
    </section>
  </div></Shell>;
}

export function AdminListingReview({ go }: { go: Go }) {
  return <AdminAccess go={go} title="Property moderation"><AdminListingReviewContent go={go} /></AdminAccess>;
}

const transactionStatuses = ["ALL", "INITIALIZED", "PENDING", "SUCCESS", "FAILED", "REVERSED", "REFUNDED"] as const;

type ReleaseCheck = {
  label: string;
  detail: string;
  ready: boolean;
};

function hasBlockingMoveInIssue(transaction: ApiAdminTransaction) {
  return transaction.moveInVerification?.issues.some((issue) =>
    issue.status !== "RESOLVED" && (issue.severity !== "MINOR" || issue.classificationDisputed),
  ) ?? false;
}

function paymentReleaseReadiness(transaction: ApiAdminTransaction) {
  const paymentHeld = transaction.escrow?.status === "HELD";
  const verification = transaction.moveInVerification;
  const tenancy = transaction.application.tenancy;

  // Payments created before the move-in workflow retain their existing release path.
  if (!verification) {
    const ready = paymentHeld && transaction.status === "SUCCESS" && transaction.application.status === "PAYMENT_HELD";
    return {
      ready,
      checks: [
        { label: "Successful payment", detail: transaction.status === "SUCCESS" ? "Payment confirmed" : "Payment has not been confirmed", ready: transaction.status === "SUCCESS" },
        { label: "Payment protection", detail: paymentHeld ? "Funds are held for review" : "Funds are no longer available for release", ready: paymentHeld },
        { label: "Legacy payment flow", detail: "This payment was created before the move-in document workflow.", ready: transaction.application.status === "PAYMENT_HELD" },
      ] satisfies ReleaseCheck[],
    };
  }

  const verificationApproved = verification.status === "VERIFIED";
  const agreementSigned = tenancy?.agreement?.status === "EXECUTED";
  const guarantorSigned = tenancy?.guarantorForm?.status === "EXECUTED";
  const tenancyActive = tenancy?.status === "ACTIVE";
  const pendingRefund = verification.refundRequests.some((request) => request.status === "PENDING");
  const blockingIssue = hasBlockingMoveInIssue(transaction);
  const clearToRelease = !verification.adminHold && !pendingRefund && !blockingIssue;
  const checks: ReleaseCheck[] = [
    {
      label: "Property checklist approved",
      detail: verificationApproved ? `Approved ${verification.verifiedAt ? displayDate(verification.verifiedAt) : ""}`.trim() : "Awaiting an approved property checklist",
      ready: verificationApproved,
    },
    {
      label: "Tenancy agreement signed",
      detail: agreementSigned ? `Signed ${tenancy?.agreement?.executedAt ? displayDate(tenancy.agreement.executedAt) : ""}`.trim() : "Awaiting the tenant's signature",
      ready: Boolean(agreementSigned),
    },
    {
      label: "Guarantor form signed",
      detail: guarantorSigned ? `Signed ${tenancy?.guarantorForm?.signedAt ? displayDate(tenancy.guarantorForm.signedAt) : ""}`.trim() : "Awaiting the guarantor's signature or signed upload",
      ready: Boolean(guarantorSigned),
    },
    {
      label: "Tenancy activated",
      detail: tenancyActive ? "The tenancy is active" : "The tenancy activates when both documents are complete",
      ready: Boolean(tenancyActive),
    },
    {
      label: "No open issue or refund",
      detail: verification.adminHold ? "An administrator hold is active" : pendingRefund ? "A refund request is awaiting a decision" : blockingIssue ? "A reported property issue still needs attention" : "No release blockers found",
      ready: clearToRelease,
    },
    {
      label: "Payment remains protected",
      detail: paymentHeld ? "Funds are ready to be authorized" : "Funds have already been released, refunded, or changed",
      ready: paymentHeld,
    },
  ];

  return { ready: checks.every((check) => check.ready), checks };
}

export function LiveAdminTransactions({ go }: { go: Go }) {
  return <AdminAccess go={go} title="Transactions"><LiveAdminTransactionsContent go={go} /></AdminAccess>;
}

export function LiveAdminEscrow({ go }: { go: Go }) {
  return <AdminAccess go={go} title="Payment releases"><LiveAdminTransactionsContent go={go} escrowOnly /></AdminAccess>;
}

type IdentityReviewKind = 'KYC' | 'PUBLISHER';
type IdentityReviewItem = {
  key: string;
  user: ApiAdminUser;
  kind: IdentityReviewKind;
  method: string | null;
  nameMatchStatus: string;
  reason: string | null;
};

function reviewLabel(kind: IdentityReviewKind) {
  return kind === 'KYC' ? 'Tenant / payout identity' : 'Landlord / agent publisher identity';
}

export function LiveAdminIdentityReviews({ go }: { go: Go }) {
  return <AdminAccess go={go} title="Identity reviews"><LiveAdminIdentityReviewsContent go={go} /></AdminAccess>;
}

function LiveAdminIdentityReviewsContent({ go }: { go: Go }) {
  const { session } = useAppSession();
  const token = session?.accessToken;
  const [items, setItems] = useState<IdentityReviewItem[]>([]);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [reviewNote, setReviewNote] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<'approve' | 'reject' | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = () => {
    if (!token) return;
    setLoading(true);
    setError(null);
    api.admin.kyc(token, { pageSize: 100 }).then((response) => {
      const next = response.items.flatMap((user) => {
        const entries: IdentityReviewItem[] = [];
        if (user.kyc?.status === 'UNDER_REVIEW') {
          entries.push({ key: `${user.id}:kyc`, user, kind: 'KYC', method: user.kyc.identityMethod, nameMatchStatus: user.kyc.nameMatchStatus, reason: user.kyc.nameMatchReason });
        }
        if (user.publisherVerification?.status === 'UNDER_REVIEW') {
          entries.push({ key: `${user.id}:publisher`, user, kind: 'PUBLISHER', method: user.publisherVerification.method, nameMatchStatus: user.publisherVerification.nameMatchStatus, reason: user.publisherVerification.nameMatchReason });
        }
        return entries;
      });
      setItems(next);
      setSelectedKey((current) => current && next.some((item) => item.key === current) ? current : next[0]?.key ?? null);
    }).catch((cause: unknown) => setError(cause instanceof Error ? cause.message : 'Unable to load identity reviews.'))
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, [token]);
  const selected = items.find((item) => item.key === selectedKey) ?? null;

  const review = async (approved: boolean) => {
    if (!token || !selected) return;
    if (reviewNote.trim().length < 3) {
      setError('Add a short review note for the audit trail.');
      return;
    }
    setSaving(approved ? 'approve' : 'reject');
    setError(null);
    try {
      const input = { approved, reviewNote: reviewNote.trim() };
      if (selected.kind === 'KYC') await api.admin.reviewKyc(token, selected.user.id, input);
      else await api.admin.reviewPublisherVerification(token, selected.user.id, input);
      setReviewNote('');
      load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to complete this identity review.');
    } finally {
      setSaving(null);
    }
  };

  if (!session) return null;
  return <Shell go={go} role="admin" title="Identity reviews"><div className="page live-admin-page">
    <div className="page-title"><span><small>Identity safeguards</small><h1>Identity name reviews</h1><p>Dojah confirmed these identity records, but the legal name was missing or differs from the SingleRent account. Review supporting evidence before granting access.</p></span></div>
    <ErrorMessage message={error} />
    <div className="admin-review-layout"><section className="panel admin-listing-list">
      {loading ? <div className="admin-live-loading"><LoaderCircle size={17} /> Loading identity reviews…</div> : items.length ? items.map((item) => <button type="button" className={selected?.key === item.key ? 'active' : ''} onClick={() => { setSelectedKey(item.key); setReviewNote(''); }} key={item.key}><span className="admin-listing-thumbnail"><UserRound size={17} /></span><span><b>{item.user.firstName} {item.user.lastName}</b><small>{reviewLabel(item.kind)}</small><small>{item.method ?? 'Identity'} · provider name {item.nameMatchStatus.toLowerCase().replace('_', ' ')}</small></span><Status tone="gold">Review needed</Status></button>) : <div className="admin-live-empty"><Check size={17} /> No identity name reviews are waiting.</div>}
    </section><aside className="panel admin-listing-review">{selected ? <><div className="admin-review-heading"><span><small>{reviewLabel(selected.kind)}</small><h2>{selected.user.firstName} {selected.user.lastName}</h2><p>{selected.user.email}</p></span><button type="button" aria-label="Close review" onClick={() => setSelectedKey(null)}><X size={16} /></button></div><div className="admin-review-facts"><span><small>Method</small><b>{selected.method ?? 'Not supplied'}</b></span><span><small>Name check</small><b>{selected.nameMatchStatus.toLowerCase().replace('_', ' ')}</b></span><span><small>Provider details</small><b>Not retained</b></span></div><p className="admin-readonly-note">{selected.reason ?? 'The provider did not return a name that can be used for automatic approval.'}</p><label className="admin-note">Review note<textarea value={reviewNote} onChange={(event) => setReviewNote(event.target.value)} placeholder="State the supporting evidence and decision." maxLength={1000} /></label><div className="actions"><Button variant="outline" disabled={Boolean(saving)} onClick={() => void review(false)}>{saving === 'reject' ? <><LoaderCircle className="spin" size={14} /> Declining…</> : 'Decline verification'}</Button><Button disabled={Boolean(saving)} onClick={() => void review(true)}>{saving === 'approve' ? <><LoaderCircle className="spin" size={14} /> Approving…</> : 'Approve after review'}</Button></div></> : <div className="admin-live-empty"><ShieldCheck size={19} /> Select an identity review to take action.</div>}</aside></div>
  </div></Shell>;
}

function LiveAdminTransactionsContent({ go, escrowOnly = false }: { go: Go; escrowOnly?: boolean }) {
  const { session } = useAppSession();
  const token = session?.accessToken;
  const [status, setStatus] = useState<(typeof transactionStatuses)[number]>("ALL");
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [transactions, setTransactions] = useState<ApiAdminTransaction[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refundScope, setRefundScope] = useState<"RENT" | "CAUTION">("RENT");
  const [refundAmount, setRefundAmount] = useState("");
  const [refundReason, setRefundReason] = useState("");
  const [refunding, setRefunding] = useState(false);
  const [releasing, setReleasing] = useState(false);
  const [resolvingDeductionId, setResolvingDeductionId] = useState<string | null>(null);
  const [resolutionNote, setResolutionNote] = useState("");

  const load = () => {
    if (!token) return;
    setLoading(true);
    setError(null);
    api.admin.transactions(token, {
      pageSize: 50,
      ...(status === "ALL" ? {} : { status }),
      ...(search ? { search } : {}),
    }).then((response) => {
      setTransactions(response.items);
      setSelectedId((current) => current && response.items.some((item) => item.id === current) ? current : response.items[0]?.id ?? null);
    }).catch((cause: unknown) => setError(cause instanceof Error ? cause.message : "Unable to load transactions."))
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, [token, status, search]);
  const selected = transactions.find((transaction) => transaction.id === selectedId) ?? null;
  const selectedReleaseReadiness = selected ? paymentReleaseReadiness(selected) : null;
  const visibleTransactions = escrowOnly
    ? transactions.filter((transaction) => transaction.escrow && !["RELEASED", "REFUNDED"].includes(transaction.escrow.status))
    : transactions;
  const issueRefund = async () => {
    if (!token || !selected) return;
    const naira = Number(refundAmount);
    if (!Number.isFinite(naira) || naira <= 0 || Math.round(naira * 100) !== naira * 100) {
      setError("Enter a valid refund amount in naira.");
      return;
    }
    if (refundReason.trim().length < 3) {
      setError("Add a short reason for the refund.");
      return;
    }
    setRefunding(true);
    setError(null);
    try {
      await api.admin.refund(token, selected.id, { scope: refundScope, amountKobo: String(Math.round(naira * 100)), reason: refundReason.trim() });
      setRefundAmount("");
      setRefundReason("");
      load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to schedule the refund.");
    } finally {
      setRefunding(false);
    }
  };

  const release = async () => {
    if (!token || !selected) return;
    setReleasing(true);
    setError(null);
    try {
      await api.admin.authorizeEscrowRelease(token, selected.id);
      load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to authorize the payment release.");
    } finally {
      setReleasing(false);
    }
  };

  const resolveDispute = async (deductionId: string, outcome: "RETURN_TO_TENANT" | "PAY_LANDLORD") => {
    if (!token || !selected) return;
    if (resolutionNote.trim().length < 3) {
      setError("Add a short resolution note for the audit trail.");
      return;
    }
    setResolvingDeductionId(deductionId);
    setError(null);
    try {
      await api.admin.resolveCautionDispute(token, selected.id, deductionId, { outcome, note: resolutionNote.trim() });
      setResolutionNote("");
      load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to resolve this caution dispute.");
    } finally {
      setResolvingDeductionId(null);
    }
  };

  if (!session) return null;
  return <Shell go={go} role="admin" title={escrowOnly ? "Payment releases" : "Transactions"}><div className="page live-admin-page">
    <div className="page-title"><span><small>Live financial operations</small><h1>{escrowOnly ? "Payment releases" : "Transactions"}</h1><p>{escrowOnly ? "Review each completed move-in, confirm the document checklist, and authorize eligible landlord or agent payouts with a full audit trail." : "Search the shared SingleRent Transaction Reference to trace payment, payment protection, payout and ledger activity."}</p></span></div>
    {escrowOnly && <MoveInOperations token={session.accessToken} />}
    <form className="admin-transaction-filters" onSubmit={(event) => { event.preventDefault(); setSearch(searchInput.trim()); }}>
      <label><Search size={14} /><input value={searchInput} onChange={(event) => setSearchInput(event.target.value)} placeholder="Search transaction reference, person or property" /></label>
      <Button type="submit" variant="outline">Search</Button>
      {search && <Button type="button" variant="ghost" onClick={() => { setSearchInput(""); setSearch(""); }}>Clear</Button>}
    </form>
    <div className="admin-status-tabs">{transactionStatuses.map((item) => <button type="button" key={item} className={status === item ? "active" : ""} onClick={() => setStatus(item)}>{item === "ALL" ? "All" : transactionLabel(item)}</button>)}</div>
    <ErrorMessage message={error} />
    <div className="admin-transaction-layout"><section className="panel admin-transaction-list">
      {loading ? <div className="admin-live-loading"><LoaderCircle size={17} /> Loading live transactions…</div> : visibleTransactions.length ? visibleTransactions.map((transaction) => {
        const releaseReadiness = paymentReleaseReadiness(transaction);
        return <button type="button" key={transaction.id} className={transaction.id === selected?.id ? "active" : ""} onClick={() => setSelectedId(transaction.id)}>
        <ReceiptText size={18} />
        <span><b>{transaction.listing.title}</b><small className="admin-transaction-reference">{transaction.transactionReference}</small><small>{transaction.tenant.firstName} {transaction.tenant.lastName} · {displayDate(transaction.createdAt)}</small></span>
        <span><b>{formatNaira(Number(transaction.totalAmountKobo) / 100)}</b>{transaction.escrow?.status === "HELD" && transaction.status === "SUCCESS" ? <Status tone={releaseReadiness.ready ? "green" : "gold"}>{releaseReadiness.ready ? "Ready to release" : "Review needed"}</Status> : <Status tone={transactionStatusTone(transaction.status)}>{transactionLabel(transaction.status)}</Status>}</span>
      </button>;
      }) : <div className="admin-live-empty"><WalletCards size={18} /> {escrowOnly ? "No payment releases need action." : "No matching transactions."}</div>}
    </section>
    <aside className="panel admin-transaction-detail">{selected ? <>
      <div className="admin-review-heading"><span><small>SingleRent Transaction Reference</small><h2><code>{selected.transactionReference}</code></h2><p>{selected.listing.title}</p></span><button type="button" aria-label="Close transaction details" onClick={() => setSelectedId(null)}><X size={16} /></button></div>
      <dl className="admin-transaction-facts">
        <div><dt>Tenant</dt><dd>{selected.tenant.firstName} {selected.tenant.lastName}</dd></div>
        <div><dt>Landlord</dt><dd>{selected.landlord.firstName} {selected.landlord.lastName}</dd></div>
        <div><dt>Agent</dt><dd>{selected.agent ? `${selected.agent.firstName} ${selected.agent.lastName}` : "Not applicable"}</dd></div>
        <div><dt>Total</dt><dd>{formatNaira(Number(selected.totalAmountKobo) / 100)}</dd></div>
        <div><dt>Payment protection</dt><dd>{selected.escrow ? transactionLabel(selected.escrow.status) : "Not created"}</dd></div>
        <div><dt>Payment reference</dt><dd><code>{selected.providerReference ?? "Not available"}</code></dd></div>
      </dl>
      {selected.escrow?.status === "HELD" && selected.status === "SUCCESS" && (selected.application.status === "PAYMENT_HELD" || selected.application.status === "ACTIVE") && selectedReleaseReadiness && <section className="admin-release-readiness"><div className="admin-release-heading"><span><small>Before you release</small><h3>Payment release checklist</h3></span><Status tone={selectedReleaseReadiness.ready ? "green" : "gold"}>{selectedReleaseReadiness.ready ? "Ready to release" : "Action needed"}</Status></div><p>Every item is checked against the live record. Payment release remains unavailable until every requirement is complete.</p><ul>{selectedReleaseReadiness.checks.map((check) => <li key={check.label} className={check.ready ? "ready" : "blocked"}>{check.ready ? <Check size={15} aria-hidden="true" /> : <CircleAlert size={15} aria-hidden="true" />}<span><b>{check.label}</b><small>{check.detail}</small></span></li>)}</ul><Button disabled={releasing || !selectedReleaseReadiness.ready} onClick={() => void release()}>{releasing ? <><LoaderCircle className="spin" size={14} /> Authorizing…</> : "Authorize payment release"}</Button>{!selectedReleaseReadiness.ready && <small className="admin-release-note">Resolve the item marked in amber before authorizing the payout.</small>}</section>}
      {selected.escrow && (selected.escrow.status === "HELD" || selected.escrow.status === "PARTIALLY_SETTLED") && <section className="admin-refund-form"><h3>Schedule tenant refund</h3><p>The tenant must have saved a refund bank account. The refund is sent as a traceable transfer linked to the reference above.</p><div><label>Refund source<select value={refundScope} onChange={(event) => setRefundScope(event.target.value as "RENT" | "CAUTION")}><option value="RENT">Rent payment</option><option value="CAUTION">Caution deposit</option></select></label><label>Amount (₦)<input inputMode="decimal" value={refundAmount} onChange={(event) => setRefundAmount(event.target.value)} placeholder="0.00" /></label></div><label>Reason<textarea value={refundReason} onChange={(event) => setRefundReason(event.target.value)} placeholder="Why is this refund being issued?" maxLength={1000} /></label><Button disabled={refunding} onClick={() => void issueRefund()}>{refunding ? <><LoaderCircle className="spin" size={14} /> Scheduling…</> : "Schedule refund"}</Button></section>}
      {selected.escrow?.cautionDeductions.length ? <section className="admin-transaction-audit admin-caution-settlements"><h3>Caution settlement</h3>{selected.escrow.cautionDeductions.map((deduction) => <article key={deduction.id}><span><b>{formatNaira(Number(deduction.amountKobo) / 100)} deduction</b><small>{deduction.reason}</small><small>{deduction.disputedAt && !deduction.resolvedAt ? "Tenant disputed — admin decision required" : deduction.resolution ? transactionLabel(deduction.resolution) : deduction.acceptedAt ? "Accepted by tenant" : "Awaiting tenant response"}</small></span>{deduction.disputedAt && !deduction.resolvedAt ? <div><label>Resolution note<textarea value={resolutionNote} onChange={(event) => setResolutionNote(event.target.value)} maxLength={1000} placeholder="Explain the decision for both parties" /></label><span><Button variant="outline" disabled={resolvingDeductionId === deduction.id} onClick={() => void resolveDispute(deduction.id, "RETURN_TO_TENANT")}>Return to tenant</Button><Button disabled={resolvingDeductionId === deduction.id} onClick={() => void resolveDispute(deduction.id, "PAY_LANDLORD")}>{resolvingDeductionId === deduction.id ? <LoaderCircle className="spin" size={14} /> : "Pay landlord"}</Button></span></div> : null}</article>)}</section> : null}
      <section className="admin-transaction-audit"><h3>Payout audit</h3>{selected.payouts.length ? <ul>{selected.payouts.map((payout) => <li key={payout.id}><span><b>{transactionLabel(payout.kind)} · {payout.recipient.firstName} {payout.recipient.lastName}</b><small>{formatNaira(Number(payout.amountKobo) / 100)} · {transactionLabel(payout.status)}</small></span><code>{payout.providerReference ?? "Bank transfer not created"}</code></li>)}</ul> : <p>No payouts have been allocated yet.</p>}</section>
      <section className="admin-transaction-audit"><h3>Ledger movements</h3>{selected.ledgerEntries.length ? <ul>{selected.ledgerEntries.map((entry) => <li key={entry.id}><span><b>{transactionLabel(entry.entryType)}</b><small>{entry.debitAccount} → {entry.creditAccount}</small></span><b>{formatNaira(Number(entry.amountKobo) / 100)}</b></li>)}</ul> : <p>No ledger entries have been recorded yet.</p>}</section>
    </> : <div className="admin-live-empty"><ReceiptText size={19} /> Select a transaction to inspect its audit trail.</div>}</aside></div>
  </div></Shell>;
}

function AdminListingReviewContent({ go }: { go: Go }) {
  const { session } = useAppSession();
  const token = session?.accessToken;
  const [status, setStatus] = useState<ApiListing["status"]>("PUBLISHED");
  const [listings, setListings] = useState<ApiListing[]>([]);
  const [selected, setSelected] = useState<ApiListing | null>(null);
  const [note, setNote] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<ListingAction | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = () => {
    if (!token) return;
    setLoading(true);
    setError(null);
    api.admin.listings(token, { status, pageSize: 50 })
      .then((response) => setListings(response.items))
      .catch((cause: unknown) => setError(cause instanceof Error ? cause.message : "Unable to load listings."))
      .finally(() => setLoading(false));
  };
  useEffect(() => { setSelected(null); setNote(""); load(); }, [token, status]);

  const moderate = async (action: ListingAction) => {
    if (!token || !selected) return;
    if (note.trim().length < 3) {
      setError("Give the landlord a short explanation before suspending this listing.");
      return;
    }
    setSaving(action);
    setError(null);
    try {
      const updated = await api.admin.moderateListing(token, selected.id, action, note.trim() || undefined);
      setListings((current) => current.filter((listing) => listing.id !== updated.id));
      setSelected(null);
      setNote("");
    } catch (cause: unknown) {
      setError(cause instanceof Error ? cause.message : "Unable to update this listing.");
    } finally {
      setSaving(null);
    }
  };

  if (!session) return null;
  return <Shell go={go} role="admin" title="Property moderation"><div className="page live-admin-page">
    <button className="back" onClick={() => go("admin")}><ArrowLeft size={14} /> Overview</button>
    <div className="page-title"><span><small>Live moderation</small><h1>Property controls</h1><p>Verified listings publish automatically. Suspend a published listing only when a safety or policy issue requires it.</p></span></div>
    <div className="admin-status-tabs">{listingStatuses.map((tab) => <button type="button" key={tab} className={status === tab ? "active" : ""} onClick={() => setStatus(tab)}>{listingStatusLabel(tab)}</button>)}</div>
    <ErrorMessage message={error} />
    <div className="admin-review-layout"><section className="panel admin-listing-list">
      {loading ? <div className="admin-live-loading"><LoaderCircle size={17} /> Loading listings…</div> : listings.length ? listings.map((listing) => <button type="button" className={selected?.id === listing.id ? "active" : ""} onClick={() => { setSelected(listing); setNote(listing.moderationNote ?? ""); }} key={listing.id}><span className="admin-listing-thumbnail">{listingImages(listing)[0] ? <img src={listingImages(listing)[0].url} alt="" /> : <Building2 size={17} />}</span><span><b>{listing.title}</b><small>{listing.address}, {listing.area}, {listing.state}</small><small>{listingRent(listing)} / year · {listing.landlord.firstName} {listing.landlord.lastName}</small></span><Status tone={statusTone(listing.status)}>{listingStatusLabel(listing.status)}</Status></button>) : <div className="admin-live-empty"><Check size={17} /> No {listingStatusLabel(status)} listings.</div>}
    </section>
    <aside className="panel admin-listing-review">{selected ? <>
      <div className="admin-review-heading"><span><small>Selected property</small><h2>{selected.title}</h2><p>{selected.description}</p></span><button type="button" aria-label="Close review" onClick={() => setSelected(null)}><X size={16} /></button></div>
      <div className="admin-review-facts"><span><small>Landlord</small><b>{selected.landlord.firstName} {selected.landlord.lastName}</b></span><span><small>Location</small><b>{selected.area}, {selected.state}</b></span><span><small>Media</small><b>{selected.media.filter((item) => item.mediaType === "IMAGE").length} photos · {selected.media.filter((item) => item.mediaType === "VIDEO").length} video</b></span></div>
      {selected.media.length ? <div className="admin-review-media">{selected.media.filter((item) => item.mediaType === "IMAGE").slice(0, 3).map((item) => <img key={item.id} src={item.url} alt={item.altText ?? selected.title} />)}</div> : null}
      {selected.status === "PUBLISHED" ? <><label className="admin-note">Reason for suspension <textarea value={note} onChange={(event) => setNote(event.target.value)} placeholder="Tell the landlord why this listing is being suspended." maxLength={1000} /></label><Button variant="destructive" disabled={Boolean(saving)} onClick={() => void moderate("suspend")}>{saving === "suspend" ? "Suspending…" : "Suspend listing"}</Button></> : <p className="admin-readonly-note">This listing is suspended and is not visible to tenants. Its recorded note is shown above when available.</p>}
    </> : <div className="admin-live-empty"><FileText size={19} /> Select a listing to review its details.</div>}</aside></div>
  </div></Shell>;
}

export function LiveAdminManagement({ go }: { go: Go }) {
  return <AdminAccess go={go} title="Admin management"><LiveAdminManagementContent go={go} /></AdminAccess>;
}

function LiveAdminManagementContent({ go }: { go: Go }) {
  const { session } = useAppSession();
  const token = session?.accessToken;
  const isSuperAdmin = session?.user.roles.includes("SUPER_ADMIN") ?? false;
  const [admins, setAdmins] = useState<ApiAdminUser[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showInvite, setShowInvite] = useState(false);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<"ADMIN" | "SUPER_ADMIN">("ADMIN");
  const [title, setTitle] = useState("");
  const [inviteToken, setInviteToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = () => {
    if (!token) return;
    setLoading(true);
    api.admin.users(token, { pageSize: 100 }).then((response) => {
      const next = response.items.filter((user) => user.userRoles.some(({ role: assignedRole }) => assignedRole.code === "ADMIN" || assignedRole.code === "SUPER_ADMIN"));
      setAdmins(next);
      setSelectedId((current) => current && next.some((user) => user.id === current) ? current : next[0]?.id ?? null);
    }).catch((cause: unknown) => setError(cause instanceof Error ? cause.message : "Unable to load administrators."))
      .finally(() => setLoading(false));
  };
  useEffect(() => { load(); }, [token]);
  const selected = admins.find((user) => user.id === selectedId) ?? null;

  const invite = async () => {
    if (!token || !email.trim()) return;
    setSaving(true);
    setError(null);
    setInviteToken(null);
    try {
      const invitation = await api.admin.createInvitation(token, { email: email.trim(), role, adminTitle: title.trim() || undefined });
      setInviteToken(invitation.developmentInviteToken ?? null);
      setEmail("");
      setTitle("");
      setShowInvite(false);
      load();
    } catch (cause: unknown) {
      setError(cause instanceof Error ? cause.message : "Unable to create an administrator invitation.");
    } finally {
      setSaving(false);
    }
  };

  const changeStatus = async (status: ApiAdminUser["status"]) => {
    if (!token || !selected) return;
    setSaving(true);
    setError(null);
    try {
      await api.admin.updateUserStatus(token, selected.id, status);
      load();
    } catch (cause: unknown) {
      setError(cause instanceof Error ? cause.message : "Unable to update this administrator.");
    } finally {
      setSaving(false);
    }
  };

  if (!session) return null;
  return <Shell go={go} role="admin" title="Admin management"><div className="page live-admin-page">
    <div className="page-title"><span><small>Live account administration</small><h1>Admin management</h1><p>Invite administrators, review their account state, and configure direct permissions.</p></span>{isSuperAdmin ? <Button onClick={() => setShowInvite(true)}><Plus size={14} /> Add admin</Button> : <Status tone="gold"><ShieldCheck size={12} /> Super Admin only</Status>}</div>
    <ErrorMessage message={error} />
    {inviteToken && <section className="admin-development-token"><KeyRound size={16} /><span><b>Development invitation token</b><code>{inviteToken}</code><small>Only shown locally. Give it to the invited admin to complete registration.</small></span></section>}
    {showInvite && <section className="panel admin-invite-form"><div className="subhead"><span><small>Super Admin action</small><h2>Invite an administrator</h2></span><Button variant="ghost" size="icon-sm" onClick={() => setShowInvite(false)}><X size={15} /></Button></div><div className="formgrid"><label>Work email<input type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="name@company.com" /></label><label>Admin title<input value={title} onChange={(event) => setTitle(event.target.value)} placeholder="e.g. Operations Admin" /></label><label>Platform role<select value={role} onChange={(event) => setRole(event.target.value as "ADMIN" | "SUPER_ADMIN")}><option value="ADMIN">Admin</option><option value="SUPER_ADMIN">Super Admin</option></select></label></div><div className="actions"><Button variant="ghost" onClick={() => setShowInvite(false)}>Cancel</Button><Button disabled={saving || !email.trim()} onClick={() => void invite()}>{saving ? "Creating…" : "Create invitation"} <ArrowRight size={14} /></Button></div></section>}
    <div className="admin-live-management"><section className="panel admins-table"><div className="subhead"><span><small>Live accounts</small><h2>Administrators</h2></span><span>{loading ? "Loading…" : `${admins.length} account${admins.length === 1 ? "" : "s"}`}</span></div><div className="admin-thead"><span>Admin</span><span>Role</span><span>Status</span><span>Last active</span><span>Permission summary</span></div>{loading ? <div className="admin-live-loading"><LoaderCircle size={17} /> Loading administrator accounts…</div> : admins.length ? admins.map((admin) => <button className={`admin-person ${selected?.id === admin.id ? "selected" : ""}`} key={admin.id} onClick={() => setSelectedId(admin.id)}><span><i>{initials(admin.firstName, admin.lastName)}</i><b>{admin.firstName} {admin.lastName}<small>{admin.email}</small></b></span><Status tone={userIsSuperAdmin(admin) ? "gold" : "slate"}>{roleLabel(admin)}</Status><Status tone={admin.status === "ACTIVE" ? "green" : "red"}>{admin.status.toLowerCase()}</Status><small>{displayDate(admin.lastActiveAt)}</small><small>{admin.directPermissions.length ? `${admin.directPermissions.length} direct rule${admin.directPermissions.length === 1 ? "" : "s"}` : "Role defaults"}</small><ArrowRight size={14} /></button>) : error ? <div className="admin-live-empty"><CircleAlert size={18} /> Administrator accounts could not be loaded.</div> : <div className="admin-live-empty"><Users size={18} /> No administrator accounts are available.</div>}</section>
    {selected && <aside className="panel admin-live-profile"><span className="admin-profile-avatar">{initials(selected.firstName, selected.lastName)}</span><Status tone={userIsSuperAdmin(selected) ? "gold" : "slate"}>{roleLabel(selected)}</Status><h2>{selected.firstName} {selected.lastName}</h2><p>{selected.email}</p><dl><div><dt>Account status</dt><dd>{selected.status.toLowerCase()}</dd></div><div><dt>Last active</dt><dd>{displayDate(selected.lastActiveAt)}</dd></div><div><dt>Direct permissions</dt><dd>{selected.directPermissions.length}</dd></div></dl>{isSuperAdmin && <div className="admin-profile-actions"><Button variant="outline" onClick={() => go("permissions")}>Edit permissions</Button><Button variant={selected.status === "ACTIVE" ? "destructive" : "outline"} disabled={saving} onClick={() => void changeStatus(selected.status === "ACTIVE" ? "DEACTIVATED" : "ACTIVE")}>{selected.status === "ACTIVE" ? "Deactivate" : "Reactivate"}</Button></div>}</aside>}</div>
  </div></Shell>;
}

export function LiveAdminPermissions({ go }: { go: Go }) {
  return <AdminAccess go={go} title="Permissions"><LiveAdminPermissionsContent go={go} /></AdminAccess>;
}

function LiveAdminPermissionsContent({ go }: { go: Go }) {
  const { session } = useAppSession();
  const token = session?.accessToken;
  const isSuperAdmin = session?.user.roles.includes("SUPER_ADMIN") ?? false;
  const [admins, setAdmins] = useState<ApiAdminUser[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [choices, setChoices] = useState<Partial<Record<AdminPermissionKey, PermissionChoice>>>({});
  const [audit, setAudit] = useState<ApiAuditLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!token) return;
    setLoading(true);
    Promise.all([api.admin.users(token, { pageSize: 100 }), api.admin.auditLogs(token, { pageSize: 8 })])
      .then(([users, logs]) => {
        const next = users.items.filter((user) => user.userRoles.some(({ role }) => role.code === "ADMIN" || role.code === "SUPER_ADMIN"));
        setAdmins(next);
        setSelectedId((current) => current || next[0]?.id || "");
        setAudit(logs);
      }).catch((cause: unknown) => setError(cause instanceof Error ? cause.message : "Unable to load permission data."))
      .finally(() => setLoading(false));
  }, [token]);

  const selected = useMemo(() => admins.find((admin) => admin.id === selectedId) ?? null, [admins, selectedId]);
  useEffect(() => {
    if (!selected) return;
    const next: Partial<Record<AdminPermissionKey, PermissionChoice>> = {};
    selected.directPermissions.forEach(({ permission, effect }) => { next[permission.key] = effect; });
    setChoices(next);
  }, [selected]);

  const save = async () => {
    if (!token || !selected) return;
    setSaving(true);
    setError(null);
    try {
      const permissions = Object.entries(choices).filter(([, effect]) => effect && effect !== "INHERIT").map(([key, effect]) => ({ key: key as AdminPermissionKey, effect: effect as PermissionEffect }));
      await api.admin.updatePermissions(token, selected.id, permissions);
      const users = await api.admin.users(token, { pageSize: 100 });
      setAdmins(users.items.filter((user) => user.userRoles.some(({ role }) => role.code === "ADMIN" || role.code === "SUPER_ADMIN")));
    } catch (cause: unknown) {
      setError(cause instanceof Error ? cause.message : "Unable to save direct permissions.");
    } finally {
      setSaving(false);
    }
  };

  if (!session) return null;
  return <Shell go={go} role="admin" title="Permissions"><div className="page live-admin-page">
    <button className="back" onClick={() => go("admins")}><ArrowLeft size={14} /> Admin management</button>
    <div className="page-title"><span><small>Live RBAC controls</small><h1>Roles & direct permissions</h1><p>Choose an administrator and configure allow/deny overrides. Inherited role permissions remain unchanged.</p></span></div>
    {!isSuperAdmin && <section className="admin-access-state compact"><KeyRound size={20} /><h2>Super Admin access required</h2><p>You can view this page only when your account has Super Admin access. The API also enforces this restriction.</p></section>}
    <ErrorMessage message={error} />
    {isSuperAdmin && <>{loading ? <div className="admin-live-loading"><LoaderCircle size={17} /> Loading permissions…</div> : selected ? <div className="admin-permissions-header"><label>Administrator<select value={selectedId} onChange={(event) => setSelectedId(event.target.value)}>{admins.map((admin) => <option value={admin.id} key={admin.id}>{admin.firstName} {admin.lastName} · {roleLabel(admin)}</option>)}</select></label><span><Status tone={userIsSuperAdmin(selected) ? "gold" : "slate"}>{roleLabel(selected)}</Status><small>Direct rules override this account’s role grants.</small></span><Button disabled={saving} onClick={() => void save()}>{saving ? "Saving…" : "Save permission rules"}</Button></div> : error ? <div className="admin-live-empty"><CircleAlert size={18} /> Permission data could not be loaded.</div> : <div className="admin-live-empty"><Users size={18} /> No administrator account is available.</div>}
      {selected && <div className="permission-layout"><section className="permission-groups">{permissionGroups.map(([group, entries]) => <article key={group}><header><span><h3>{group}</h3><small>Direct permission override</small></span></header><div>{entries.map(([key, label]) => <label className="admin-permission-row" key={key}><span>{label}</span><select value={choices[key] ?? "INHERIT"} onChange={(event) => setChoices((current) => ({ ...current, [key]: event.target.value as PermissionChoice }))}><option value="INHERIT">Inherit role</option><option value="ALLOW">Allow</option><option value="DENY">Deny</option></select></label>)}</div></article>)}</section><aside className="permission-side"><div className="sidecard"><i><ShieldCheck /></i><h3>Selected admin</h3><p>{selected.firstName} has {selected.directPermissions.length} saved direct permission rule{selected.directPermissions.length === 1 ? "" : "s"}.</p><div className="access-stat"><b>{Object.values(choices).filter((choice) => choice === "ALLOW").length}</b><small>direct allows in this edit</small></div></div><div className="restricted-card"><KeyRound size={18} /><h3>Safe permission editing</h3><p>Choose Inherit to remove a direct override and use the account’s role permission instead.</p></div></aside></div>}</>}
    <section className="panel audit-log"><div className="subhead"><span><small>Live accountability data</small><h2>Recent admin activity</h2></span></div>{audit.length ? audit.map((entry) => <div className="audit-row" key={entry.id}><small>{displayDate(entry.createdAt)}</small><span><i>{entry.actor ? initials(entry.actor.firstName, entry.actor.lastName) : "SR"}</i><b>{entry.actor ? `${entry.actor.firstName} ${entry.actor.lastName}` : "System"}</b></span><b>{entry.action.replaceAll("_", " ")}</b><small>{entry.entityType}{entry.entityId ? ` · ${entry.entityId.slice(0, 8)}` : ""}</small></div>) : <div className="admin-live-empty"><Clock3 size={17} /> No audit records are available.</div>}</section>
  </div></Shell>;
}
