"use client";

import { useEffect, useState } from "react";
import { CircleAlert, Landmark, LoaderCircle, ReceiptText, WalletCards } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Shell, Status, type Navigate } from "@/features/app/shell";
import { useAppSession } from "@/features/app/app-provider";
import { EscrowSettlement } from "./escrow-settlement";
import { api, type ApiPayment, type ApiPayoutAudit, type ApiTenancy } from "@/lib/api";
import { formatNaira } from "@/lib/pricing";
import { PayoutCenter } from "./payout-center";
import "./rental-flow.css";

type WorkspaceRole = "tenant" | "landlord" | "agent";

function statusTone(status: string) {
  if (status === "SUCCESS" || status === "PAID" || status === "RELEASED") return "green" as const;
  if (status === "FAILED" || status === "REVERSED" || status === "REFUNDED" || status === "CANCELLED") return "red" as const;
  if (status === "PENDING" || status === "INITIALIZED" || status === "SCHEDULED" || status === "PROCESSING") return "gold" as const;
  return "slate" as const;
}

function label(value: string) {
  return value.replace(/_/g, " ").toLowerCase();
}

function displayDate(value: string) {
  return new Intl.DateTimeFormat("en-NG", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}

function PayoutAudit({ payout }: { payout: ApiPayoutAudit }) {
  return <li>
    <span>
      <b>{label(payout.kind)} payout</b>
      <small>{payout.paidAt ? `Paid ${displayDate(payout.paidAt)}` : payout.scheduledAt ? `Scheduled ${displayDate(payout.scheduledAt)}` : "Awaiting release"}</small>
    </span>
    <span className="transaction-payout-amount"><Status tone={statusTone(payout.status)}>{label(payout.status)}</Status><b>{formatNaira(Number(payout.amountKobo) / 100)}</b></span>
    {payout.providerReference && <code>Paystack transfer ref: {payout.providerReference}</code>}
  </li>;
}

export function TransactionHistory({ go, role }: { go: Navigate; role: WorkspaceRole }) {
  const { session } = useAppSession();
  const [payments, setPayments] = useState<ApiPayment[]>([]);
  const [tenancies, setTenancies] = useState<ApiTenancy[]>([]);
  const [loading, setLoading] = useState(Boolean(session));
  const [error, setError] = useState<string | null>(null);
  const [releasingId, setReleasingId] = useState<string | null>(null);

  useEffect(() => {
    if (!session) return;
    let active = true;
    setLoading(true);
    setError(null);
    Promise.all([
      api.payments.list(session.accessToken, { pageSize: 50 }),
      api.tenancies.list(session.accessToken, { pageSize: 50 }),
    ])
      .then(([paymentResponse, tenancyResponse]) => {
        if (!active) return;
        setPayments(paymentResponse.items);
        setTenancies(tenancyResponse.items);
      })
      .catch((cause: unknown) => active && setError(cause instanceof Error ? cause.message : "Unable to load your transactions."))
      .finally(() => active && setLoading(false));
    return () => { active = false; };
  }, [session]);

  const audience = role === "tenant" ? "payments" : "payouts";
  const refreshPayments = async () => {
    if (!session) return;
    const [paymentResponse, tenancyResponse] = await Promise.all([
      api.payments.list(session.accessToken, { pageSize: 50 }),
      api.tenancies.list(session.accessToken, { pageSize: 50 }),
    ]);
    setPayments(paymentResponse.items);
    setTenancies(tenancyResponse.items);
  };
  const authorizeRelease = async (paymentId: string) => {
    if (!session) return;
    setReleasingId(paymentId);
    setError(null);
    try {
      await api.payments.authorizeRelease(session.accessToken, paymentId);
      await refreshPayments();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to authorize this escrow release.");
    } finally {
      setReleasingId(null);
    }
  };
  if (!session) {
    return <Shell go={go} role={role} title="Transactions"><div className="page rental-flow"><section className="rental-empty"><WalletCards size={25} /><h1>Sign in to view transactions</h1><p>Your secure payment and payout records are available only to participants in the transaction.</p></section></div></Shell>;
  }

  return <Shell go={go} role={role} title="Transactions"><div className="page rental-flow transaction-history-page">
    <div className="rental-flow-heading"><span><small>Financial history</small><h1>{role === "tenant" ? "Your payments" : "Your payouts"}</h1><p>Use the SingleRent Transaction Reference when contacting support. It connects the payment, escrow record and any payout related to the rental.</p></span></div>
    {error && <p className="rental-alert error"><CircleAlert size={15} /> {error}</p>}
    <PayoutCenter role={role} />
    {loading ? <section className="rental-empty"><LoaderCircle className="spin" size={24} /><h1>Loading transactions…</h1></section> : payments.length ? <section className="transaction-list">
      {payments.map((payment) => <article key={payment.id}>
        <header><span><ReceiptText size={18} /><span><small>{payment.listing.source.toLowerCase()} listing</small><h2>{payment.listing.title}</h2></span></span><Status tone={statusTone(payment.status)}>{label(payment.status)}</Status></header>
        <dl>
          <div className="transaction-reference"><dt>SingleRent Transaction Reference</dt><dd><code>{payment.transactionReference}</code></dd></div>
          <div><dt>{role === "tenant" ? "Total paid" : "Rental total"}</dt><dd>{formatNaira(Number(payment.totalAmountKobo) / 100)}</dd></div>
          <div><dt>Created</dt><dd>{displayDate(payment.createdAt)}</dd></div>
          <div><dt>Escrow status</dt><dd>{payment.escrow ? label(payment.escrow.status) : "Not created"}</dd></div>
        </dl>
        <div className="transaction-audit">
          <b>Audit details</b>
          {payment.providerReference && <code>Paystack collection ref: {payment.providerReference}</code>}
          <small>This payment is linked to your application and the secured escrow record.</small>
        </div>
        {payment.payouts.length > 0 && <section className="transaction-payouts"><h3>Related {audience}</h3><ul>{payment.payouts.map((payout) => <PayoutAudit key={payout.id} payout={payout} />)}</ul></section>}
        {role !== "tenant" && payment.status === "SUCCESS" && payment.application.status === "PAYMENT_HELD" && payment.escrow?.status === "HELD" && <div className="transaction-actions"><Button disabled={releasingId === payment.id} onClick={() => void authorizeRelease(payment.id)}>{releasingId === payment.id ? <><LoaderCircle className="spin" size={14} /> Authorizing…</> : "Authorize escrow release"}</Button><small>Creates the released landlord and agent payouts; each recipient then withdraws to their saved bank account.</small></div>}
        <EscrowSettlement payment={payment} tenancy={tenancies.find((tenancy) => tenancy.applicationId === payment.applicationId)} role={role} token={session.accessToken} onRefresh={refreshPayments} />
      </article>)}
    </section> : <section className="rental-empty"><Landmark size={25} /><h1>No transactions yet</h1><p>Completed payments and payouts will appear here with their traceable SingleRent reference.</p></section>}
  </div></Shell>;
}
