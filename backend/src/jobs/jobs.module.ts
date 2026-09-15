import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PAYOUTS_QUEUE, NOTIFICATIONS_QUEUE } from './queue.constants';
import { FinancialsModule } from '../financials/financials.module';
import { PayoutJobsService } from './payout-jobs.service';
import { PayoutProcessor } from './payout.processor';
import { NotificationProcessor } from './notification.processor';
import { NotificationJobsService } from './notification-jobs.service';

@Module({
  imports: [
    BullModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => {
        const redisUrl = new URL(configService.getOrThrow<string>('REDIS_URL'));
        return {
          connection: {
            host: redisUrl.hostname,
            port: Number(redisUrl.port || 6379),
            username: redisUrl.username || undefined,
            password: redisUrl.password || undefined,
          },
        };
      },
    }),
    BullModule.registerQueue({ name: NOTIFICATIONS_QUEUE }, { name: PAYOUTS_QUEUE }),
    FinancialsModule,
  ],
  providers: [NotificationJobsService, NotificationProcessor, PayoutJobsService, PayoutProcessor],
  exports: [NotificationJobsService, PayoutJobsService],
})
export class JobsModule {}
