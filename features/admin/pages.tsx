"use client";

import { useAppNavigation } from "@/features/app/app-provider";
import { AdminManagement, Permissions } from "@/features/admin/management";
import { OperationsAdmin } from "@/features/product/expansion";
import { AdminDashboardScreen, EscrowScreen, SystemStatesScreen } from "@/features/legacy/legacy-screens";

export function AdminDashboardPage() { const { go } = useAppNavigation(); return <AdminDashboardScreen go={go} />; }
export function AdminManagementPage() { const { go } = useAppNavigation(); return <AdminManagement go={go} />; }
export function AdminPermissionsPage() { const { go } = useAppNavigation(); return <Permissions go={go} />; }
export function AdminEscrowPage() { const { go } = useAppNavigation(); return <EscrowScreen go={go} />; }
export function AdminSystemStatesPage() { const { go } = useAppNavigation(); return <SystemStatesScreen go={go} />; }
export function AdminOperationsPage() { const { go } = useAppNavigation(); return <OperationsAdmin go={go} />; }
