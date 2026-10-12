"use client";

import { useAppNavigation } from "@/features/app/app-provider";
import { SavedHomes } from "@/features/homes/portfolio";
import { WorkspaceDashboard } from "@/features/dashboard/workspace-dashboard";
import { TenantMaintenance } from "@/features/tenant/maintenance";

export function TenantDashboardPage() { const { go } = useAppNavigation(); return <WorkspaceDashboard go={go} role="tenant" />; }
export function SavedHomesPage() { const { go } = useAppNavigation(); return <SavedHomes go={go} />; }
export function TenantMaintenancePage() { const { go } = useAppNavigation(); return <TenantMaintenance go={go} />; }
