"use client";

import { useAppNavigation } from "@/features/app/app-provider";
import { ApplicationScreen, BookingConfirmationScreen, PaymentScreen } from "@/features/legacy/legacy-screens";

export function ApplicationPage() { const { go } = useAppNavigation(); return <ApplicationScreen go={go} />; }
export function PaymentPage() { const { go } = useAppNavigation(); return <PaymentScreen go={go} />; }
export function BookingConfirmationPage() { const { go } = useAppNavigation(); return <BookingConfirmationScreen go={go} />; }
