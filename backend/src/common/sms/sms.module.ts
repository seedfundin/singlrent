import { Module } from "@nestjs/common";
import { SmsDeliveryService } from "./sms-delivery.service";

@Module({
  providers: [SmsDeliveryService],
  exports: [SmsDeliveryService],
})
export class SmsModule {}
