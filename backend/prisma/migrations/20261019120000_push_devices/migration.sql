CREATE TABLE "push_devices" (
  "id" UUID NOT NULL,
  "userId" UUID NOT NULL,
  "provider" VARCHAR(16) NOT NULL,
  "credentialHash" CHAR(64) NOT NULL,
  "encryptedData" TEXT NOT NULL,
  "label" VARCHAR(120),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "push_devices_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "push_devices_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "push_devices_credentialHash_key" ON "push_devices"("credentialHash");
CREATE INDEX "push_devices_userId_idx" ON "push_devices"("userId");
CREATE TABLE "push_deliveries" (
  "id" UUID NOT NULL,
  "notificationId" UUID NOT NULL,
  "deviceId" UUID NOT NULL,
  "status" VARCHAR(24) NOT NULL,
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "push_deliveries_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "push_deliveries_deviceId_fkey" FOREIGN KEY ("deviceId") REFERENCES "push_devices"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "push_deliveries_notificationId_deviceId_key" ON "push_deliveries"("notificationId", "deviceId");
CREATE INDEX "push_deliveries_status_updatedAt_idx" ON "push_deliveries"("status", "updatedAt");
