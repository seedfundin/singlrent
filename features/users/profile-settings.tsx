"use client";

import { useCallback, useEffect, useState } from "react";
import { CheckCircle2, CircleAlert, LoaderCircle, Save, UserRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAppSession } from "@/features/app/app-provider";
import { Shell, type Navigate } from "@/features/app/shell";
import { ApiFieldError } from "@/features/forms/api-field-error";
import { api, apiFieldErrors, apiFormError, type ApiFieldErrors, type ApiUserProfile } from "@/lib/api";
import "@/features/rentals/rental-flow.css";

type WorkspaceRole = "tenant" | "landlord" | "agent" | "admin";

function roleFor(roles: string[]): WorkspaceRole {
  if (roles.includes("SUPER_ADMIN") || roles.includes("ADMIN")) return "admin";
  if (roles.includes("AGENT")) return "agent";
  if (roles.includes("LANDLORD")) return "landlord";
  return "tenant";
}

type Form = {
  firstName: string;
  lastName: string;
  bio: string;
  occupation: string;
  defaultOccupants: string;
  businessName: string;
  companyName: string;
  licenceNumber: string;
};

function formFrom(profile: ApiUserProfile): Form {
  return {
    firstName: profile.firstName,
    lastName: profile.lastName,
    bio: profile.bio ?? "",
    occupation: profile.tenantProfile?.occupation ?? "",
    defaultOccupants: String(profile.tenantProfile?.defaultOccupants ?? 1),
    businessName: profile.landlordProfile?.businessName ?? "",
    companyName: profile.agentProfile?.companyName ?? "",
    licenceNumber: profile.agentProfile?.licenceNumber ?? "",
  };
}

export function ProfileSettings({ go }: { go: Navigate }) {
  const { session, setSession } = useAppSession();
  const [profile, setProfile] = useState<ApiUserProfile | null>(null);
  const [form, setForm] = useState<Form | null>(null);
  const [loading, setLoading] = useState(Boolean(session));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<ApiFieldErrors>({});
  const [notice, setNotice] = useState<string | null>(null);
  const [deactivationPassword, setDeactivationPassword] = useState("");
  const [deactivationConfirmation, setDeactivationConfirmation] = useState("");
  const [deactivating, setDeactivating] = useState(false);
  const role = roleFor(session?.user.roles ?? []);

  const load = useCallback(async () => {
    if (!session) {
      setProfile(null);
      setForm(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const current = await api.users.profile(session.accessToken);
      setProfile(current);
      setForm(formFrom(current));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to load your profile.");
    } finally {
      setLoading(false);
    }
  }, [session]);

  useEffect(() => {
    void load();
  }, [load]);

  const update = <K extends keyof Form>(key: K, value: Form[K]) => {
    setForm((current) => current ? { ...current, [key]: value } : current);
    setFieldErrors((current) => {
      const { [key]: _cleared, ...remaining } = current;
      return remaining;
    });
    setError(null);
  };

  const save = async () => {
    if (!session || !form || !profile) return;
    const defaultOccupants = Number(form.defaultOccupants);
    if (!Number.isInteger(defaultOccupants) || defaultOccupants < 1 || defaultOccupants > 20) {
      setFieldErrors({ defaultOccupants: ["Default occupants must be a whole number between 1 and 20."] });
      setError("Please correct the highlighted fields and try again.");
      return;
    }
    setSaving(true);
    setError(null);
    setFieldErrors({});
    setNotice(null);
    try {
      const saved = await api.users.updateProfile(session.accessToken, {
        firstName: form.firstName.trim(),
        lastName: form.lastName.trim(),
        bio: form.bio.trim() || null,
        occupation: profile.tenantProfile ? form.occupation.trim() || null : undefined,
        defaultOccupants: profile.tenantProfile ? defaultOccupants : undefined,
        businessName: profile.landlordProfile ? form.businessName.trim() || null : undefined,
        companyName: profile.agentProfile ? form.companyName.trim() || null : undefined,
        licenceNumber: profile.agentProfile ? form.licenceNumber.trim() || null : undefined,
      }) as ApiUserProfile;
      setProfile(saved);
      setForm(formFrom(saved));
      setSession({ ...session, user: { ...session.user, firstName: saved.firstName, lastName: saved.lastName } });
      setNotice("Your profile has been saved.");
    } catch (cause) {
      const nextFieldErrors = apiFieldErrors(cause);
      setFieldErrors(nextFieldErrors);
      setError(apiFormError(cause, nextFieldErrors, "Unable to save your profile."));
    } finally {
      setSaving(false);
    }
  };

  const deactivate = async () => {
    if (!session || deactivationConfirmation !== "DEACTIVATE") {
      setError('Type DEACTIVATE to confirm account deactivation.');
      return;
    }
    setDeactivating(true);
    setError(null);
    try {
      await api.auth.deactivate(session.accessToken, { confirmation: "DEACTIVATE", currentPassword: deactivationPassword || undefined });
      setSession(null);
      go("home");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to deactivate your account.");
    } finally {
      setDeactivating(false);
    }
  };

  if (!session) {
    return <Shell go={go} role="tenant" title="Profile"><div className="page rental-flow"><section className="rental-empty"><UserRound size={24} /><h1>Sign in to manage your profile</h1><p>Profile information is available only to your signed-in account.</p><Button onClick={() => go("sign-in")}>Sign in</Button></section></div></Shell>;
  }

  return <Shell go={go} role={role} title="Profile"><div className="page rental-flow profile-settings-live">
    <div className="rental-flow-heading"><span><small>Account settings</small><h1>Your profile</h1><p>Only details saved to your authenticated SingleRent account appear here.</p></span></div>
    {error && <p className="rental-alert error" role="alert"><CircleAlert size={15} /> {error}</p>}
    {notice && <p className="rental-alert"><CheckCircle2 size={15} /> {notice}</p>}
    {loading ? <section className="rental-empty"><LoaderCircle className="spin" size={24} /><h1>Loading your profile…</h1></section> : form && profile ? <section className="panel live-data-form">
      <div className="subhead"><span><small>Personal details</small><h2>Profile information</h2></span></div>
      <div className="live-form-grid"><label>First name<input aria-invalid={Boolean(fieldErrors.firstName)} value={form.firstName} maxLength={100} required onChange={(event) => update("firstName", event.target.value)} /><ApiFieldError errors={fieldErrors} field="firstName" /></label><label>Last name<input aria-invalid={Boolean(fieldErrors.lastName)} value={form.lastName} maxLength={100} required onChange={(event) => update("lastName", event.target.value)} /><ApiFieldError errors={fieldErrors} field="lastName" /></label></div>
      <label>Email<input value={profile.email} disabled /></label>
      <label>About you<textarea aria-invalid={Boolean(fieldErrors.bio)} value={form.bio} maxLength={1000} onChange={(event) => update("bio", event.target.value)} placeholder="Add a short profile description" /><ApiFieldError errors={fieldErrors} field="bio" /></label>
      {profile.tenantProfile && <><label>Occupation<input aria-invalid={Boolean(fieldErrors.occupation)} value={form.occupation} maxLength={150} onChange={(event) => update("occupation", event.target.value)} /><ApiFieldError errors={fieldErrors} field="occupation" /></label><label>Default occupants<input aria-invalid={Boolean(fieldErrors.defaultOccupants)} type="number" min="1" max="20" value={form.defaultOccupants} onChange={(event) => update("defaultOccupants", event.target.value)} /><ApiFieldError errors={fieldErrors} field="defaultOccupants" /></label></>}
      {profile.landlordProfile && <label>Business name<input aria-invalid={Boolean(fieldErrors.businessName)} value={form.businessName} maxLength={200} onChange={(event) => update("businessName", event.target.value)} /><ApiFieldError errors={fieldErrors} field="businessName" /></label>}
      {profile.agentProfile && <><label>Company name<input aria-invalid={Boolean(fieldErrors.companyName)} value={form.companyName} maxLength={200} onChange={(event) => update("companyName", event.target.value)} /><ApiFieldError errors={fieldErrors} field="companyName" /></label><label>Licence number<input aria-invalid={Boolean(fieldErrors.licenceNumber)} value={form.licenceNumber} maxLength={100} onChange={(event) => update("licenceNumber", event.target.value)} /><ApiFieldError errors={fieldErrors} field="licenceNumber" /></label></>}
      <Button disabled={saving || !form.firstName.trim() || !form.lastName.trim()} onClick={() => void save()}>{saving ? <><LoaderCircle className="spin" size={14} /> Saving…</> : <><Save size={14} /> Save profile</>}</Button>
    </section> : <section className="rental-empty"><CircleAlert size={24} /><h1>Profile data is unavailable</h1><p>Try loading your profile again.</p><Button variant="outline" onClick={() => void load()}>Try again</Button></section>}
    {!loading && profile && <section className="panel live-data-form profile-deactivation"><div className="subhead"><span><small>Account access</small><h2>Deactivate account</h2></span></div><p>Deactivation signs you out on every device and stops future sign-ins. Your records are retained for legal, payment and safety obligations; permanent deletion may require a support request.</p><label>Current password (required for password accounts)<input type="password" autoComplete="current-password" value={deactivationPassword} onChange={(event) => setDeactivationPassword(event.target.value)} /></label><label>Type <b>DEACTIVATE</b> to confirm<input value={deactivationConfirmation} onChange={(event) => setDeactivationConfirmation(event.target.value)} /></label><Button variant="destructive" disabled={deactivating || deactivationConfirmation !== "DEACTIVATE"} onClick={() => void deactivate()}>{deactivating ? <><LoaderCircle className="spin" size={14} /> Deactivating…</> : "Deactivate my account"}</Button></section>}
  </div></Shell>;
}
