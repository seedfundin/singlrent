-- Administrative maintenance oversight: a private owner, escalation marker and
-- response deadline. Case notes and every action remain in audit_logs so that
-- internal commentary is never exposed through the tenant/manager endpoints.
ALTER TABLE "maintenance_requests"
  ADD COLUMN "admin_owner_id" UUID,
  ADD COLUMN "escalated_at" TIMESTAMP(3),
  ADD COLUMN "response_due_at" TIMESTAMP(3);

ALTER TABLE "maintenance_requests"
  ADD CONSTRAINT "maintenance_requests_admin_owner_id_fkey"
  FOREIGN KEY ("admin_owner_id") REFERENCES "users"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "maintenance_requests_admin_owner_id_status_idx"
  ON "maintenance_requests"("admin_owner_id", "status");

CREATE INDEX "maintenance_requests_response_due_at_idx"
  ON "maintenance_requests"("response_due_at");
