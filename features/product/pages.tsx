"use client";

import { ArrowRight, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAppNavigation, useAppSession } from "@/features/app/app-provider";
import { PublicHeader } from "@/features/app/shell";
import { PropertyAssistant } from "@/features/conversations/property-assistant";
import { CautionDeposit } from "@/features/rentals/caution-deposit";
import { IncidentReports } from "@/features/incidents/incident-reports";
import { NotificationSettings } from "@/features/notifications/notification-settings";
import { ReviewsHub } from "@/features/reviews/reviews-hub";

export function PropertyAssistantPage() {
  const { go } = useAppNavigation();
  const { session } = useAppSession();

  if (!session) {
    return <>
      <PublicHeader go={go} />
      <main className="public">
        <section className="listing-state">
          <Sparkles size={18} />
          <span>
            <strong>Sign in to ask property questions</strong>
            <small>Ask questions about a home and message its landlord after you sign in. KYC is not required.</small>
          </span>
          <Button onClick={() => go("sign-in")}>Sign in <ArrowRight size={14} /></Button>
        </section>
      </main>
    </>;
  }

  return <PropertyAssistant go={go} />;
}
export function ReviewsPage() { const { go } = useAppNavigation(); return <ReviewsHub go={go} />; }
export function ReportsPage() { const { go } = useAppNavigation(); return <IncidentReports go={go} />; }
export function CautionDepositPage() { const { go } = useAppNavigation(); return <CautionDeposit go={go} />; }
export function NotificationSettingsPage() { const { go } = useAppNavigation(); return <NotificationSettings go={go} />; }
