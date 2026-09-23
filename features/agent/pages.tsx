"use client";

import { useAppNavigation } from "@/features/app/app-provider";
import { AgentWorkspace, FeeCheckout } from "@/features/product/expansion";
import { ManagedHomeDetails, ManagedHomes, PropertyMaintenance } from "@/features/homes/portfolio";

export function AgentDashboardPage() { const { go } = useAppNavigation(); return <AgentWorkspace go={go} />; }
export function AgentHomesPage() { const { go } = useAppNavigation(); return <ManagedHomes go={go} manager="agent" />; }
export function AgentHomePage() { const { go } = useAppNavigation(); return <ManagedHomeDetails go={go} manager="agent" />; }
export function AgentMaintenancePage() { const { go } = useAppNavigation(); return <PropertyMaintenance go={go} manager="agent" />; }
export function AgentFeesPage() { const { go } = useAppNavigation(); return <FeeCheckout go={go} />; }
