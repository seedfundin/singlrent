"use client";

import { useEffect, useState } from "react";
import { Building2, CircleAlert, Landmark, LoaderCircle, WalletCards } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Status } from "@/features/app/shell";
import { useAppSession } from "@/features/app/app-provider";
import { api, type ApiBank, type ApiPayout, type ApiPayoutAccount } from "@/lib/api";
import { formatNaira } from "@/lib/pricing";

type PayoutRole = "tenant" | "landlord" | "agent";

function payoutFailureMessage(reason: string | null) {
  if (!reason || reason === "Payment service request failed") {
    return "The bank-transfer service could not complete this payout. Retry to see the next required step.";
  }
  return reason;
}

export function PayoutCenter({ role }: { role: PayoutRole }) {
  const { session } = useAppSession();
  const [account, setAccount] = useState<ApiPayoutAccount | null>(null);
  const [payouts, setPayouts] = useState<ApiPayout[]>([]);
  const [banks, setBanks] = useState<ApiBank[]>([]);
  const [bankCode, setBankCode] = useState("");
  const [accountNumber, setAccountNumber] = useState("");
  const [editing, setEditing] = useState(false);
  const [loading, setLoading] = useState(Boolean(session));
  const [saving, setSaving] = useState(false);
  const [withdrawingId, setWithdrawingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = async () => {
    if (!session) return;
    const [destination, nextPayouts] = await Promise.all([
      api.payoutAccounts.mine(session.accessToken),
      api.payouts.list(session.accessToken),
    ]);
    setAccount(destination.account);
    setPayouts(nextPayouts);
  };

  useEffect(() => {
    if (!session) return;
    let active = true;
    setLoading(true);
    setError(null);
    refresh()
      .catch((cause: unknown) => active && setError(cause instanceof Error ? cause.message : "Unable to load payout details."))
      .finally(() => active && setLoading(false));
    return () => { active = false; };
  // The session token changes on refresh; that is when this data must reload.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session?.accessToken]);

  const openDestinationForm = async () => {
    if (!session) return;
    setError(null);
    setEditing(true);
    if (banks.length) return;
    try {
      const availableBanks = await api.payoutAccounts.banks(session.accessToken);
      setBanks(availableBanks);
      setBankCode((current) => current || availableBanks[0]?.code || "");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to load the available banks.");
    }
  };

  const saveDestination = async () => {
    if (!session || !/^\d{10}$/.test(accountNumber) || !bankCode) return;
    setSaving(true);
    setError(null);
    try {
      const result = await api.payoutAccounts.save(session.accessToken, { accountNumber, bankCode });
      setAccount(result.account);
      setAccountNumber("");
      setEditing(false);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to save this payout destination.");
    } finally {
      setSaving(false);
    }
  };

  const requestWithdrawal = async (payoutId: string) => {
    if (!session) return;
    setWithdrawingId(payoutId);
    setError(null);
    try {
      await api.payouts.withdraw(session.accessToken, payoutId);
      await refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to request this payout.");
    } finally {
      setWithdrawingId(null);
    }
  };

  const title = role === "tenant" ? "Refund destination" : "Payout center";
  const description = role === "tenant"
    ? "Add a bank account now so any approved refund can be sent securely to you."
    : "Set your bank account once, then request each released payout when you are ready.";
  const pending = payouts.filter((payout) => payout.status === "PENDING");
  const processing = payouts.filter((payout) => payout.status === "SCHEDULED" || payout.status === "PROCESSING");
  const failed = payouts.filter((payout) => payout.status === "FAILED");

  if (!session) return null;
  return <section className="payout-center">
    <header><span><WalletCards size={19} /><span><small>Secure bank transfers</small><h2>{title}</h2></span></span>{loading ? <LoaderCircle className="spin" size={16} /> : account ? <Status>Destination ready</Status> : <Status tone="gold">Action needed</Status>}</header>
    <p>{description}</p>
    {error && <p className="rental-alert error"><CircleAlert size={15} /> {error}</p>}

    {account && !editing ? <div className="payout-destination"><Landmark size={18} /><span><b>{account.bankName} · •••• {account.accountLast4}</b><small>{account.accountName} · {account.currency}</small></span><Button variant="outline" size="sm" onClick={() => void openDestinationForm()}>Change</Button></div> : <div className="payout-destination-form">
      <div><Building2 size={18} /><span><b>Add a Nigerian bank account</b><small>Your account is validated securely. SingleRent stores only the details needed to send a payment and your last four digits.</small></span></div>
      {editing ? <><label>Bank<select value={bankCode} onChange={(event) => setBankCode(event.target.value)} disabled={!banks.length}>{banks.length ? banks.map((bank) => <option key={bank.code} value={bank.code}>{bank.name}</option>) : <option>Loading banks…</option>}</select></label><label>Account number<input inputMode="numeric" autoComplete="off" value={accountNumber} onChange={(event) => setAccountNumber(event.target.value.replace(/\D/g, "").slice(0, 10))} placeholder="10-digit account number" /></label><div className="payout-destination-actions"><Button variant="outline" onClick={() => { setEditing(false); setAccountNumber(""); }}>Cancel</Button><Button disabled={saving || !bankCode || !/^\d{10}$/.test(accountNumber)} onClick={() => void saveDestination()}>{saving ? <><LoaderCircle className="spin" size={14} /> Validating…</> : "Save bank account"}</Button></div></> : <Button onClick={() => void openDestinationForm()}>Add bank account</Button>}</div>}

    {role !== "tenant" && <section className="payout-withdrawals">
      <h3>Released payouts</h3>
      <p>Your listing account has already been verified. Add a bank account, then choose Withdraw when a payout is released.</p>
      {pending.length ? <ul>{pending.map((payout) => <li key={payout.id}><span><b>{formatNaira(Number(payout.amountKobo) / 100)}</b><small>{payout.payment.listing.title} · <code>{payout.payment.reference}</code></small></span><Button disabled={!account || withdrawingId === payout.id} onClick={() => void requestWithdrawal(payout.id)}>{withdrawingId === payout.id ? <LoaderCircle className="spin" size={14} /> : "Withdraw"}</Button></li>)}</ul> : <small>No released payouts are waiting for withdrawal.</small>}
      {processing.length ? <p><LoaderCircle className="spin" size={14} /> {processing.length === 1 ? "One payout is being sent to your bank account." : `${processing.length} payouts are being sent to your bank account.`}</p> : null}
      {failed.length ? <ul>{failed.map((payout) => <li key={payout.id}><span><b>Transfer needs attention</b><small>{payoutFailureMessage(payout.failureReason)}</small></span><Button disabled={!account || Boolean(payout.providerReference) || withdrawingId === payout.id} onClick={() => void requestWithdrawal(payout.id)}>{withdrawingId === payout.id ? <LoaderCircle className="spin" size={14} /> : payout.providerReference ? "Contact support" : "Retry withdrawal"}</Button></li>)}</ul> : null}
    </section>}
  </section>;
}
