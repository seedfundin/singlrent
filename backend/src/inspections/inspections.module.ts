import { BullModule, Processor, WorkerHost } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { Job } from 'bullmq';
import { NotificationsModule } from '../notifications/notifications.module';
import { InspectionsController } from './inspections.controller';
import { INSPECTION_QUEUE, InspectionsService } from './inspections.service';

@Processor(INSPECTION_QUEUE)
class InspectionsProcessor extends WorkerHost {
  constructor(private readonly service: InspectionsService) { super(); }
  async process(job: Job<{ bookingId: string; startsAt: string; hours: number }>) { await this.service.timer(job.data.bookingId, job.data.startsAt, job.data.hours); }
}

@Module({ imports: [NotificationsModule, BullModule.registerQueue({ name: INSPECTION_QUEUE })], controllers: [InspectionsController], providers: [InspectionsService, InspectionsProcessor] })
export class InspectionsModule {}
