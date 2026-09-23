"use client";

import { useAppNavigation } from "@/features/app/app-provider";
import { SavedHomes } from "@/features/homes/portfolio";
import { TenantDashboardScreen, TenantMaintenanceScreen } from "@/features/legacy/legacy-screens";

export function TenantDashboardPage() { const { go } = useAppNavigation(); return <TenantDashboardScreen go={go} />; }
export function SavedHomesPage() { const { go } = useAppNavigation(); return <SavedHomes go={go} />; }
export function TenantMaintenancePage() { const { go } = useAppNavigation(); return <TenantMaintenanceScreen go={go} />; }
