import { Status } from "@/features/app/shell";
import type { ApiApplicationStatus } from "@/lib/api";

export function ApplicationStatusBadge({ status }: { status: ApiApplicationStatus }) {
  const tone = status === "REJECTED" || status === "CANCELLED" ? "red" : status === "AWAITING_PAYMENT" ? "gold" : status === "PAYMENT_HELD" || status === "ACTIVE" ? "green" : "slate";
  return <Status tone={tone}>{status.replace(/_/g, " ").toLowerCase()}</Status>;
}
