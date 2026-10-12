"use client";

import { useAppNavigation } from "@/features/app/app-provider";
import { ManagedHomeDetails, ManagedHomes, PropertyMaintenance } from "@/features/homes/portfolio";
import { WorkspaceDashboard } from "@/features/dashboard/workspace-dashboard";
import { PropertyQuestionsInbox } from "@/features/conversations/property-questions-inbox";
import { ManagerApplications } from "@/features/rentals/manager-applications";
import { ListingWizard } from "@/features/landlord/listing-wizard";
import { ListingEditor } from "@/features/homes/listing-editor";
import { PublisherVerificationGate } from "@/features/landlord/publisher-verification";
import { Shell } from "@/features/app/shell";
import { useAppSession } from "@/features/app/app-provider";
import { Button } from "@/components/ui/button";
import { TransactionHistory } from "@/features/rentals/transaction-history";

export function LandlordDashboardPage() { const { go } = useAppNavigation(); return <WorkspaceDashboard go={go} role="landlord" />; }
export function LandlordHomesPage() { const { go } = useAppNavigation(); return <ManagedHomes go={go} manager="landlord" />; }
export function LandlordHomePage() { const { go } = useAppNavigation(); return <ManagedHomeDetails go={go} manager="landlord" />; }
export function LandlordEditListingPage() { const { go } = useAppNavigation(); return <ListingEditor go={go} manager="landlord" />; }
export function LandlordMaintenancePage() { const { go } = useAppNavigation(); return <PropertyMaintenance go={go} manager="landlord" />; }
export function ListPropertyPage() { const { go } = useAppNavigation(); return <ListingWizard go={go} />; }
export function LandlordQuestionsPage() { const { go } = useAppNavigation(); return <PropertyQuestionsInbox go={go} />; }
export function LandlordApplicationsPage() { const { go } = useAppNavigation(); return <ManagerApplications go={go} role="landlord" />; }
export function LandlordTransactionsPage() { const { go } = useAppNavigation(); return <TransactionHistory go={go} role="landlord" />; }
export function PublisherVerificationPage() {
  const { go } = useAppNavigation();
  const { session } = useAppSession();
  if (!session) {
    return <Shell go={go} role="landlord" title="Publisher verification"><div className="page publisher-verification-page"><section className="publisher-verification-card loading"><h1>Sign in to verify your publisher account</h1><Button onClick={() => go("sign-in")}>Sign in</Button></section></div></Shell>;
  }
  const role = session.user.roles.includes("AGENT") ? "agent" : session.user.roles.includes("LANDLORD") ? "landlord" : null;
  if (!role) {
    return <Shell go={go} title="Publisher verification"><div className="page publisher-verification-page"><section className="publisher-verification-card loading"><h1>Landlord or agent account required</h1></section></div></Shell>;
  }
  return <Shell go={go} role={role} title="Publisher verification"><PublisherVerificationGate session={session} role={role} onVerified={() => go(role === "agent" ? "agent-homes" : "landlord-homes")} /></Shell>;
}
