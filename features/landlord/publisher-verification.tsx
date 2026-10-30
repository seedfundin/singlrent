"use client";

import { useEffect, useRef, useState } from "react";
import { BadgeCheck, Camera, CheckCircle2, CircleAlert, Clock3, Fingerprint, LoaderCircle, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Status } from "@/features/app/shell";
import { api, type ApiPublisherVerification, type ApiSession, type PublisherVerificationMethod } from "@/lib/api";
import "./publisher-verification.css";

type DojahConnectOptions = {
  app_id: string;
  p_key: string;
  type: "custom";
  config: { widget_id: string };
  reference_id: string;
  user_data: { first_name: string; last_name: string; email?: string; residence_country: "NG" };
  gov_data: { nin: string; bvn: string };
  metadata: Record<string, string>;
  onSuccess: (data: unknown) => void;
  onError: (error: unknown) => void;
  onClose: () => void;
};

type DojahConnectInstance = { setup: () => void; open: () => void };
type DojahConnectConstructor = new (options: DojahConnectOptions) => DojahConnectInstance;

declare global {
  interface Window {
    Connect?: DojahConnectConstructor;
  }
}

let widgetLoader: Promise<DojahConnectConstructor> | null = null;

function loadDojahWidget(): Promise<DojahConnectConstructor> {
  if (typeof window === "undefined") return Promise.reject(new Error("Dojah can only be started in a browser."));
  if (window.Connect) return Promise.resolve(window.Connect);
  if (widgetLoader) return widgetLoader;

  widgetLoader = new Promise((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>('script[data-singlerent-dojah-widget="true"]');
    const finish = () => window.Connect ? resolve(window.Connect) : reject(new Error("Dojah's verification widget did not load correctly."));
    if (existing) {
      existing.addEventListener("load", finish, { once: true });
      existing.addEventListener("error", () => reject(new Error("Dojah's verification widget could not be loaded.")), { once: true });
      return;
    }
    const script = document.createElement("script");
    script.src = "https://widget.dojah.io/widget.js";
    script.dataset.singlerentDojahWidget = "true";
    script.onload = finish;
    script.onerror = () => reject(new Error("Dojah's verification widget could not be loaded."));
    document.head.appendChild(script);
  }).catch((error) => {
    widgetLoader = null;
    throw error;
  });
  return widgetLoader;
}

function readableStatus(status: ApiPublisherVerification["status"]) {
  if (status === "NOT_STARTED") return "Not started";
  if (status === "PENDING") return "In progress";
  if (status === "UNDER_REVIEW") return "Name review required";
  if (status === "VERIFIED") return "Verified";
  if (status === "REJECTED") return "Needs another attempt";
  return "Could not complete";
}

export function PublisherVerificationGate({
  session,
  role,
  onVerified,
}: {
  session: ApiSession;
  role: "landlord" | "agent";
  onVerified: () => void;
}) {
  const [verification, setVerification] = useState<ApiPublisherVerification | null>(null);
  const [method, setMethod] = useState<PublisherVerificationMethod>("NIN");
  const [loading, setLoading] = useState(true);
  const [opening, setOpening] = useState(false);
  const [checking, setChecking] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const successCallback = useRef(false);

  const widgetConfigured = Boolean(
    process.env.NEXT_PUBLIC_DOJAH_APP_ID
    && process.env.NEXT_PUBLIC_DOJAH_PUBLIC_KEY
    && process.env.NEXT_PUBLIC_DOJAH_PUBLISHER_WIDGET_ID,
  );

  const refresh = async () => {
    const next = await api.users.getPublisherVerification(session.accessToken);
    setVerification(next);
    if (next.method) setMethod(next.method);
    if (next.verified) onVerified();
    return next;
  };

  useEffect(() => {
    let active = true;
    refresh()
      .catch((cause: unknown) => active && setError(cause instanceof Error ? cause.message : "Unable to check publisher verification."))
      .finally(() => active && setLoading(false));
    return () => { active = false; };
    // The access token is deliberately the only changing input. The callback
    // simply unlocks this screen after a provider-confirmed result.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session.accessToken]);

  const reconcile = async (verificationId = verification?.id) => {
    if (!verificationId) return;
    setChecking(true);
    setError("");
    try {
      const next = await api.users.reconcilePublisherVerification(session.accessToken, verificationId);
      setVerification(next);
      if (next.verified) {
        setNotice("Dojah confirmed your identity, name match and liveness. You can now create a listing.");
        onVerified();
      } else if (next.status === "UNDER_REVIEW") {
        setNotice("Dojah confirmed the identity record, but its name needs an administrator review before listing access can be granted.");
      } else if (next.status === "PENDING") {
        setNotice("Dojah has received your flow. We are waiting for its verified result—do not start a second attempt yet.");
      } else {
        setNotice("");
        setError(next.failureReason ?? "Dojah could not verify the selected identity and liveness. Please try again.");
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to confirm the Dojah result yet.");
    } finally {
      setChecking(false);
    }
  };

  const openDojah = async () => {
    if (!widgetConfigured) {
      setError("Publisher verification is not configured yet. Add the three NEXT_PUBLIC_DOJAH publisher widget values, then restart the frontend.");
      return;
    }
    setOpening(true);
    setError("");
    setNotice("");
    successCallback.current = false;
    try {
      const next = await api.users.startPublisherVerification(session.accessToken, method);
      setVerification(next);
      if (!next.id || !next.providerReference) throw new Error("SingleRent could not start a secure Dojah verification session.");
      const Connect = await loadDojahWidget();
      const connect = new Connect({
        app_id: process.env.NEXT_PUBLIC_DOJAH_APP_ID!,
        p_key: process.env.NEXT_PUBLIC_DOJAH_PUBLIC_KEY!,
        type: "custom",
        config: { widget_id: process.env.NEXT_PUBLIC_DOJAH_PUBLISHER_WIDGET_ID! },
        reference_id: next.providerReference,
        user_data: {
          first_name: session.user.firstName,
          last_name: session.user.lastName,
          ...(session.user.email ? { email: session.user.email } : {}),
          residence_country: "NG",
        },
        // The person enters the chosen number only inside Dojah's secure flow.
        gov_data: { nin: "", bvn: "" },
        metadata: { user_id: session.user.id, publisher_verification_id: next.id, selected_method: method },
        onSuccess: () => {
          successCallback.current = true;
          setNotice("Dojah has completed the flow. Confirming the result securely…");
          void reconcile(next.id);
        },
        onError: () => setError("Dojah could not complete this verification. Check the identity details and camera permissions, then try again."),
        onClose: () => {
          if (!successCallback.current) setNotice("Verification was closed before completion. Resume this same secure session when you are ready; do not start another one.");
        },
      });
      connect.setup();
      connect.open();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to open Dojah verification.");
    } finally {
      setOpening(false);
    }
  };

  if (loading) {
    return <div className="page publisher-verification-page"><section className="publisher-verification-card loading"><LoaderCircle className="spin" size={22} /><h1>Checking publisher verification…</h1></section></div>;
  }

  if (verification?.verified) {
    return <div className="page publisher-verification-page"><section className="publisher-verification-card success"><BadgeCheck size={28} /><div><Status>Publisher identity verified</Status><h1>You can list a property</h1><p>Dojah has confirmed the selected identity method, legal-name match and live selfie. This check is retained for future listings.</p></div></section></div>;
  }

  const pending = verification?.status === "PENDING" && verification.id;
  return <div className="page publisher-verification-page">
    <div className="publisher-verification-heading"><span><small>Required before listing</small><h1>Verify your {role} account</h1><p>Before you can create or submit a property, Dojah must confirm a NIN or BVN, your legal first and last name, and that you are physically present.</p></span><Status tone="gold"><ShieldCheck size={13} /> {verification ? readableStatus(verification.status) : "Not started"}</Status></div>
    <section className="publisher-verification-card">
      <div className="publisher-verification-steps"><span><i><Fingerprint size={17} /></i><b>1. Identity</b><small>Choose NIN or BVN</small></span><span><i><Camera size={17} /></i><b>2. Liveness</b><small>Complete Dojah's live selfie check</small></span><span><i><CheckCircle2 size={17} /></i><b>3. Listing access</b><small>Unlocked only after Dojah confirms both</small></span></div>
      {error && <p className="publisher-verification-alert error"><CircleAlert size={16} /> {error}</p>}
      {notice && <p className="publisher-verification-alert"><Clock3 size={16} /> {notice}</p>}
      <fieldset disabled={opening || checking}>
        <legend>Choose an identity method</legend>
        <p>Dojah will ask for the selected number directly in its secure verification screen. SingleRent never stores the NIN or BVN.</p>
        <div className="publisher-methods">
          {(["NIN", "BVN"] as PublisherVerificationMethod[]).map((item) => <label key={item} className={method === item ? "selected" : ""}><input type="radio" name="publisher-method" value={item} checked={method === item} onChange={() => setMethod(item)} /><span><b>{item}</b><small>{item === "NIN" ? "National Identity Number" : "Bank Verification Number"}</small></span></label>)}
        </div>
      </fieldset>
      <div className="publisher-verification-actions">
        {pending && <Button variant="outline" disabled={checking || opening} onClick={() => void reconcile()}>{checking ? <><LoaderCircle className="spin" size={15} /> Checking Dojah…</> : <>Check verification result</>}</Button>}
        <Button disabled={opening || checking} onClick={() => void openDojah()}>{opening ? <><LoaderCircle className="spin" size={15} /> Opening Dojah…</> : <><ShieldCheck size={15} /> {pending ? "Resume secure verification" : `Verify with ${method} and liveness`}</>}</Button>
      </div>
      <p className="publisher-verification-footnote">Your Dojah EasyOnboard flow must be published with both <b>NIN</b> and <b>BVN</b> government-data options plus the <b>Liveness</b> fraud check. The legal first and last name returned by Dojah must match the name on this account; material differences are held for admin review. A completed browser screen alone never grants listing access.</p>
    </section>
  </div>;
}
