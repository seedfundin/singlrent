"use client";

import { useAppNavigation } from "@/features/app/app-provider";
import { ManagedHomeDetails, ManagedHomes, PropertyMaintenance } from "@/features/homes/portfolio";
import { LandlordDashboardScreen, LandlordQuestionsScreen } from "@/features/legacy/legacy-screens";
import { ListingWizard } from "@/features/landlord/listing-wizard";

export function LandlordDashboardPage() { const { go } = useAppNavigation(); return <LandlordDashboardScreen go={go} />; }
export function LandlordHomesPage() { const { go } = useAppNavigation(); return <ManagedHomes go={go} manager="landlord" />; }
export function LandlordHomePage() { const { go } = useAppNavigation(); return <ManagedHomeDetails go={go} manager="landlord" />; }
export function LandlordMaintenancePage() { const { go } = useAppNavigation(); return <PropertyMaintenance go={go} manager="landlord" />; }
export function ListPropertyPage() { const { go } = useAppNavigation(); return <ListingWizard go={go} />; }
export function LandlordQuestionsPage() { const { go } = useAppNavigation(); return <LandlordQuestionsScreen go={go} />; }
