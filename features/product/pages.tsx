"use client";

import { useAppNavigation } from "@/features/app/app-provider";
import { PropertyAssistantScreen } from "@/features/legacy/legacy-screens";
import { CautionDeposit, IncidentReports, NotificationSettings, ReviewsRatings } from "@/features/product/expansion";

export function PropertyAssistantPage() { const { go } = useAppNavigation(); return <PropertyAssistantScreen go={go} />; }
export function ReviewsPage() { const { go } = useAppNavigation(); return <ReviewsRatings go={go} />; }
export function ReportsPage() { const { go } = useAppNavigation(); return <IncidentReports go={go} />; }
export function CautionDepositPage() { const { go } = useAppNavigation(); return <CautionDeposit go={go} />; }
export function NotificationSettingsPage() { const { go } = useAppNavigation(); return <NotificationSettings go={go} />; }
