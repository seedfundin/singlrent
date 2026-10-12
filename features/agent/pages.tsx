"use client";

import { useAppNavigation } from "@/features/app/app-provider";
import { WorkspaceDashboard } from "@/features/dashboard/workspace-dashboard";
import { ManagedHomeDetails, ManagedHomes, PropertyMaintenance } from "@/features/homes/portfolio";
import { ListingEditor } from "@/features/homes/listing-editor";
import { ManagerApplications } from "@/features/rentals/manager-applications";
import { TransactionHistory } from "@/features/rentals/transaction-history";

export function AgentDashboardPage() { const { go } = useAppNavigation(); return <WorkspaceDashboard go={go} role="agent" />; }
export function AgentHomesPage() { const { go } = useAppNavigation(); return <ManagedHomes go={go} manager="agent" />; }
export function AgentHomePage() { const { go } = useAppNavigation(); return <ManagedHomeDetails go={go} manager="agent" />; }
export function AgentEditListingPage() { const { go } = useAppNavigation(); return <ListingEditor go={go} manager="agent" />; }
export function AgentMaintenancePage() { const { go } = useAppNavigation(); return <PropertyMaintenance go={go} manager="agent" />; }
// Commission figures must come from real payment and payout records. The old
// fee checkout showed fabricated sample amounts, so this route now opens the
// same live financial history used by the agent workspace.
export function AgentFeesPage() { const { go } = useAppNavigation(); return <TransactionHistory go={go} role="agent" />; }
export function AgentApplicationsPage() { const { go } = useAppNavigation(); return <ManagerApplications go={go} role="agent" />; }
export function AgentTransactionsPage() { const { go } = useAppNavigation(); return <TransactionHistory go={go} role="agent" />; }
