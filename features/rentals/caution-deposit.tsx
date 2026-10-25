"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { CircleAlert, Landmark, LoaderCircle, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAppSession } from "@/features/app/app-provider";
import { Shell, Status, type Navigate } from "@/features/app/shell";
import { api, type ApiPayment, type ApiTenancy } from "@/lib/api";
import { formatNaira } from "@/lib/pricing";
import { EscrowSettlement } from "./escrow-settlement";
import "./rental-flow.css";

type WorkspaceRole = "tenant" | "landlord" | "agent";

function roleFor(roles: string[]): WorkspaceRole {
  if (roles.includes("AGENT")) return "agent";
  if (roles.includes("LANDLORD")) return "landlord";
  return "tenant";
}

function label(value: string) {
  return value.replaceAll("_", " ").toLowerCase();
}

function tone(status: string) {
  if (status === "RELEASED" || status === "PAID" || status === "RETURNED") return "green" as const;
  if (status === "DISPUTED" || status === "FAILED" || status === "REFUNDED") return "red" as const;
  if (status === "HELD" || status === "PENDING") return "gold" as const;
  return "slate" as const;
}

export function CautionDeposit({ go }: { go: Navigate }) {
  const { session } = useAppSession();
  const [payments, setPayments] = useState<ApiPayment[]>([]);
  const [tenancies, setTenancies] = useState<ApiTenancy[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(Boolean(session));
  const [error, setError] = useState<string | null>(null);
  const role = roleFor(session?.user.roles ?? []);

  const load = useCallback(async () => {
    if (!session) {
      setPayments([]);
      setTenancies([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const [paymentResponse, tenancyResponse] = await Promise.all([
        api.payments.list(session.accessToken, { pageSize: 50 }),
        api.tenancies.list(session.accessToken, { pageSize: 50 }),
      ]);
      const cautionPayments = paymentResponse.items.filter((payment) => payment.escrow && Number(payment.cautionFeeKobo) > 0);
      setPayments(cautionPayments);
      setTenancies(tenancyResponse.items);
      setSelectedId((current) => cautionPayments.some((payment) => payment.id === current) ? current : cautionPayments[0]?.id ?? null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to load caution deposit records.");
    } finally {
      setLoading(false);
    }
  }, [session]);

  useEffect(() => {
    void load();
  }, [load]);

  const selected = useMemo(() => payments.find((payment) => payment.id === selectedId) ?? null, [payments, selectedId]);

  if (!session) {
    return <Shell go={go} role="tenant" title="Caution deposit"><div className="page rental-flow"><section className="rental-empty"><ShieldCheck size={24} /><h1>Sign in to view caution deposits</h1><p>Only transaction participants can view their protected caution records.</p><Button onClick={() => go("sign-in")}>Sign in</Button></section></div></Shell>;
  }

  return <Shell go={go} role={role} title="Caution deposit"><div className="page rental-flow caution-deposit-live">
    <div className="rental-flow-heading"><span><small>Protected caution</small><h1>Caution deposit records</h1><p>These records are taken directly from completed rental payments and their protected-payment records.</p></span></div>
    {error && <p className="rental-alert error"><CircleAlert size={15} /> {error}</p>}
    {loading ? <section className="rental-empty"><LoaderCircle className="spin" size={24} /><h1>Loading caution deposits…</h1></section> : payments.length ? <div className="caution-live-layout">
      <section className="panel caution-live-list">
        <div className="subhead"><span><small>Related payments</small><h2>Caution deposits</h2></span></div>
        {payments.map((payment) => <button key={payment.id} type="button" className={payment.id === selectedId ? "active" : ""} onClick={() => setSelectedId(payment.id)}>
          <span><b>{payment.listing.title}</b><small>{formatNaira(Number(payment.cautionFeeKobo) / 100)} · <code>{payment.transactionReference}</code></small></span>
          <Status tone={tone(payment.escrow?.cautionStatus ?? "")}>{label(payment.escrow?.cautionStatus ?? "unknown")}</Status>
        </button>)}
      </section>
      {selected && <section className="panel caution-live-detail">
        <div className="subhead"><span><small>Selected deposit</small><h2>{selected.listing.title}</h2></span><Status tone={tone(selected.escrow?.cautionStatus ?? "")}>{label(selected.escrow?.cautionStatus ?? "unknown")}</Status></div>
        <dl className="transaction-summary"><div><dt>Caution held</dt><dd>{formatNaira(Number(selected.cautionFeeKobo) / 100)}</dd></div><div><dt>SingleRent reference</dt><dd><code>{selected.transactionReference}</code></dd></div><div><dt>Payment protection status</dt><dd>{label(selected.escrow?.status ?? "not created")}</dd></div></dl>
        <EscrowSettlement payment={selected} tenancy={tenancies.find((tenancy) => tenancy.applicationId === selected.applicationId)} role={role} token={session.accessToken} onRefresh={load} />
      </section>}
    </div> : <section className="rental-empty"><Landmark size={24} /><h1>No protected caution records yet</h1><p>Records appear here after a rental payment includes a caution fee and its protected-payment record is created.</p></section>}
  </div></Shell>;
}
