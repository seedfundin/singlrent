ALTER TABLE "push_deliveries" DROP CONSTRAINT "push_deliveries_deviceId_fkey";
ALTER TABLE "push_deliveries" ALTER COLUMN "deviceId" DROP NOT NULL;
ALTER TABLE "push_deliveries" ADD CONSTRAINT "push_deliveries_deviceId_fkey" FOREIGN KEY ("deviceId") REFERENCES "push_devices"("id") ON DELETE SET NULL ON UPDATE CASCADE;
