"use client";

import { useAppNavigation } from "@/features/app/app-provider";
import { AdminListingReview, LiveAdminDashboard, LiveAdminEscrow, LiveAdminIdentityReviews, LiveAdminManagement, LiveAdminPermissions, LiveAdminTransactions } from "@/features/admin/live-admin";
import { AdminOperations, AdminSystemStates } from "@/features/admin/operations";
import { AdminMaintenance } from "@/features/admin/maintenance";

export function AdminDashboardPage() { const { go } = useAppNavigation(); return <LiveAdminDashboard go={go} />; }
export function AdminListingReviewPage() { const { go } = useAppNavigation(); return <AdminListingReview go={go} />; }
export function AdminTransactionsPage() { const { go } = useAppNavigation(); return <LiveAdminTransactions go={go} />; }
export function AdminManagementPage() { const { go } = useAppNavigation(); return <LiveAdminManagement go={go} />; }
export function AdminPermissionsPage() { const { go } = useAppNavigation(); return <LiveAdminPermissions go={go} />; }
export function AdminEscrowPage() { const { go } = useAppNavigation(); return <LiveAdminEscrow go={go} />; }
export function AdminIdentityReviewsPage() { const { go } = useAppNavigation(); return <LiveAdminIdentityReviews go={go} />; }
export function AdminSystemStatesPage() { const { go } = useAppNavigation(); return <AdminSystemStates go={go} />; }
export function AdminOperationsPage() { const { go } = useAppNavigation(); return <AdminOperations go={go} />; }
export function AdminMaintenancePage() { const { go } = useAppNavigation(); return <AdminMaintenance go={go} />; }
