"use client";

import { useAppNavigation } from "@/features/app/app-provider";
import { PaymentCallback, RentalApplicationFlow, RentalConfirmation, RentalPaymentFlow, TenantApplications } from "@/features/rentals/rental-flow";
import { TransactionHistory } from "@/features/rentals/transaction-history";

export function ApplicationPage() { const { go } = useAppNavigation(); return <RentalApplicationFlow go={go} />; }
export function TenantApplicationsPage() { const { go } = useAppNavigation(); return <TenantApplications go={go} />; }
export function PaymentPage() { const { go } = useAppNavigation(); return <RentalPaymentFlow go={go} />; }
export function PaymentCallbackPage() { const { go } = useAppNavigation(); return <PaymentCallback go={go} />; }
export function BookingConfirmationPage() { const { go } = useAppNavigation(); return <RentalConfirmation go={go} />; }
export function TenantTransactionsPage() { const { go } = useAppNavigation(); return <TransactionHistory go={go} role="tenant" />; }
