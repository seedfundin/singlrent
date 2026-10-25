"use client";

import { useMemo, useState } from "react";
import { BadgeCheck, CircleAlert, LoaderCircle, ShieldCheck, WalletCards } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Status } from "@/features/app/shell";
import { api, type ApiCautionDeduction, type ApiPayment, type ApiTenancy } from "@/lib/api";
import { formatNaira } from "@/lib/pricing";

type WorkspaceRole = "tenant" | "landlord" | "agent";

type Props = {
  payment: ApiPayment;
  tenancy: ApiTenancy | undefined;
  role: WorkspaceRole;
  token: string;
  onRefresh: () => Promise<void>;
};

function label(value: string) {
  return value.replace(/_/g, " ").toLowerCase();
}

function deductionState(deduction: ApiCautionDeduction) {
  if (deduction.resolution === "LANDLORD_PAID") return "Landlord payout scheduled";
  if (deduction.resolution === "TENANT_REFUND") return "Tenant refund scheduled";
  if (deduction.disputedAt) return "Disputed — awaiting admin decision";
  if (deduction.acceptedAt) return "Accepted";
  return "Awaiting tenant response";
}

function validNaira(value: string) {
  const naira = Number(value);
  return Number.isFinite(naira) && naira > 0 && Math.round(naira * 100) === naira * 100
    ? Math.round(naira * 100)
    : null;
}

/**
 * One participant-facing surface for tenancy state and the held caution
 * balance. It deliberately uses the payment's saved escrow amounts only; it
 * never attempts to derive a location, rate, or amount on the client.
 */
export function EscrowSettlement({ payment, tenancy, role, token, onRefresh }: Props) {
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [deductionAmount, setDeductionAmount] = useState("");
  const [deductionReason, setDeductionReason] = useState("");
  const [evidence, setEvidence] = useState("");
  const [tenantNote, setTenantNote] = useState("");

  const escrow = payment.escrow;
  const isManager = role === "landlord" || role === "agent";
  const heldCaution = Number(payment.cautionFeeKobo);
  const unresolved = useMemo(
    () => escrow?.cautionDeductions.filter((deduction) => !deduction.acceptedAt && !deduction.disputedAt && !deduction.resolvedAt) ?? [],
    [escrow?.cautionDeductions],
  );

  if (!escrow || (heldCaution <= 0 && !tenancy?.moveInVerification)) return null;

  const refreshAfter = async () => {
    await onRefresh();
  };

  const handle = async (key: string, operation: () => Promise<unknown>) => {
    setBusy(key);
    setError(null);
    try {
      await operation();
      await refreshAfter();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "The payment-protection action could not be completed.");
    } finally {
      setBusy(null);
    }
  };

  const propose = async () => {
    const amountKobo = validNaira(deductionAmount);
    if (!amountKobo) {
      setError("Enter a valid deduction amount in naira.");
      return;
    }
    if (deductionReason.trim().length < 3) {
      setError("Add a short reason for the proposed deduction.");
      return;
    }
    const evidenceUrls = evidence.split(/[,\n]/).map((item) => item.trim()).filter(Boolean);
    await handle("propose", async () => {
      await api.payments.proposeCautionDeduction(token, payment.id, {
        amountKobo: String(amountKobo),
        reason: deductionReason.trim(),
        ...(evidenceUrls.length ? { evidence: evidenceUrls } : {}),
      });
      setDeductionAmount("");
      setDeductionReason("");
      setEvidence("");
    });
  };

  const transitionTenancy = async (action: "activate" | "complete") => {
    if (!tenancy) return;
    await handle(action, () => action === "activate"
      ? api.tenancies.activate(token, tenancy.id)
      : api.tenancies.complete(token, tenancy.id));
  };

  return <section className="escrow-settlement">
    <header>
      <span><ShieldCheck size={19} /><span><small>Protected caution balance</small><h3>End-of-tenancy settlement</h3></span></span>
      <Status tone={escrow.cautionStatus === "DISPUTED" ? "red" : escrow.cautionStatus === "HELD" ? "gold" : "green"}>{label(escrow.cautionStatus)}</Status>
    </header>
    <p>{heldCaution > 0 ? <>The held caution amount is <b>{formatNaira(heldCaution / 100)}</b>. Rent and caution are kept as separate, traceable balances.</> : "No caution deposit is held for this tenancy."}</p>
    {error && <p className="rental-alert error" role="alert"><CircleAlert size={15} /> {error}</p>}

    {tenancy ? <div className="tenancy-settlement-state">
      <span><b>Tenancy status</b><small>{label(tenancy.status)} · ends {new Intl.DateTimeFormat("en-NG", { dateStyle: "medium" }).format(new Date(tenancy.endsAt))}</small></span>
      {isManager && tenancy.status === "PENDING_MOVE_IN" && <Button size="sm" disabled={busy === "activate"} onClick={() => void transitionTenancy("activate")}>{busy === "activate" ? <LoaderCircle className="spin" size={14} /> : "Mark tenancy active"}</Button>}
      {isManager && tenancy.status === "ACTIVE" && <Button size="sm" variant="outline" disabled={busy === "complete"} onClick={() => void transitionTenancy("complete")}>{busy === "complete" ? <LoaderCircle className="spin" size={14} /> : "Complete tenancy"}</Button>}
      {tenancy.status === "ENDED" && <Status tone="green"><BadgeCheck size={13} /> Settlement open</Status>}
    </div> : <p className="escrow-settlement-note">A tenancy record will appear after the rent release is authorized. Caution cannot be settled before that tenancy is completed.</p>}

    {escrow.cautionDeductions.length > 0 && <div className="caution-deduction-list">
      <h4>Caution activity</h4>
      {escrow.cautionDeductions.map((deduction) => <article key={deduction.id}>
        <span><b>{formatNaira(Number(deduction.amountKobo) / 100)} proposed deduction</b><small>{deduction.reason}</small><small>{deductionState(deduction)}</small></span>
        {deduction.evidence?.length ? <small className="caution-evidence">Evidence: {deduction.evidence.length} link{deduction.evidence.length === 1 ? "" : "s"}</small> : null}
        {role === "tenant" && unresolved.some((item) => item.id === deduction.id) && <div className="tenant-deduction-actions">
          <label>Optional note<textarea value={tenantNote} onChange={(event) => setTenantNote(event.target.value)} maxLength={1000} placeholder="Add context for the landlord or admin" /></label>
          <span><Button size="sm" variant="outline" disabled={Boolean(busy)} onClick={() => void handle(`dispute-${deduction.id}`, () => api.payments.disputeCautionDeduction(token, payment.id, deduction.id, tenantNote.trim() || undefined))}>{busy === `dispute-${deduction.id}` ? <LoaderCircle className="spin" size={14} /> : "Dispute"}</Button><Button size="sm" disabled={Boolean(busy)} onClick={() => void handle(`accept-${deduction.id}`, () => api.payments.acceptCautionDeduction(token, payment.id, deduction.id, tenantNote.trim() || undefined))}>{busy === `accept-${deduction.id}` ? <LoaderCircle className="spin" size={14} /> : "Accept deduction"}</Button></span>
        </div>}
      </article>)}
    </div>}

    {isManager && tenancy?.status === "ENDED" && <div className="caution-manager-actions">
      {escrow.cautionStatus === "HELD" && unresolved.length === 0 && <>
        <div className="caution-return"><span><WalletCards size={18} /><span><b>Return remaining caution</b><small>Schedules a secure bank transfer to the tenant’s saved account.</small></span></span><Button size="sm" variant="outline" disabled={Boolean(busy)} onClick={() => void handle("return", () => api.payments.returnRemainingCaution(token, payment.id))}>{busy === "return" ? <LoaderCircle className="spin" size={14} /> : "Return balance"}</Button></div>
        <details className="caution-propose"><summary>Propose a documented deduction instead</summary><div><label>Amount (₦)<input inputMode="decimal" value={deductionAmount} onChange={(event) => setDeductionAmount(event.target.value)} placeholder="0.00" /></label><label>Reason<textarea value={deductionReason} onChange={(event) => setDeductionReason(event.target.value)} maxLength={1000} placeholder="Describe the verified damage, arrears, or repair" /></label><label>Evidence links <small>Optional; one URL per line or comma-separated</small><textarea value={evidence} onChange={(event) => setEvidence(event.target.value)} placeholder="https://…" /></label><Button size="sm" disabled={Boolean(busy)} onClick={() => void propose()}>{busy === "propose" ? <LoaderCircle className="spin" size={14} /> : "Send to tenant for review"}</Button></div></details>
      </>}
      {escrow.cautionStatus === "DEDUCTION_PROPOSED" && <p className="escrow-settlement-note">The tenant can accept or dispute the proposed deduction. A dispute is sent to an authorized administrator for a recorded decision.</p>}
      {escrow.cautionStatus === "DISPUTED" && <p className="escrow-settlement-note">This caution deduction is waiting for an authorized admin’s resolution. Both parties can see the final decision in this transaction.</p>}
    </div>}
  </section>;
}
