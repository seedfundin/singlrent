"use client";

import { useSearchParams } from "next/navigation";
import { AccountType, KycFlow, SignIn, SignUp } from "@/features/auth/auth";
import { useAppNavigation, useAppSession } from "@/features/app/app-provider";
import type { AccountRole } from "@/lib/account";
import { api, registrationDraftStore, sessionStore, type ApiSession } from "@/lib/api";
import type { View } from "@/lib/routes";

function destinationFor(session: ApiSession): View {
  if (session.user.roles.includes("SUPER_ADMIN") || session.user.roles.includes("ADMIN")) return "admin";
  if (session.user.roles.includes("LANDLORD")) return "landlord";
  if (session.user.roles.includes("AGENT")) return "agent";
  return "tenant";
}

export function SignInPage() {
  const { go } = useAppNavigation();
  const { setSession } = useAppSession();
  return <SignIn go={go} onAuthenticated={(session) => { setSession(session); go(destinationFor(session)); }} />;
}

export function SignUpPage() {
  const { go } = useAppNavigation();
  return <SignUp go={go} />;
}

export function AccountTypePage() {
  const { go } = useAppNavigation();
  const { setSession } = useAppSession();
  const chooseRole = async (role: AccountRole) => {
    const draft = registrationDraftStore.get();
    if (!draft) {
      go("sign-up");
      throw new Error("Your registration details expired. Please complete the sign-up form again.");
    }
    const session = await api.auth.register({ ...draft, role: role.toUpperCase() as "TENANT" | "LANDLORD" | "AGENT" });
    registrationDraftStore.clear();
    sessionStore.set(session);
    setSession(session);
    go("kyc", { role });
  };
  return <AccountType go={go} onChoose={chooseRole} />;
}

export function KycPage() {
  const { go } = useAppNavigation();
  const searchParams = useSearchParams();
  const role = searchParams.get("role");
  const accountRole: AccountRole = role === "landlord" || role === "agent" || role === "tenant" ? role : "tenant";
  return <KycFlow go={go} role={accountRole} />;
}
