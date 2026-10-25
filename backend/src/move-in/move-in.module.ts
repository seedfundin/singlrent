import { Module } from '@nestjs/common';
import { DocumentsModule } from '../documents/documents.module';
import { MoveInController } from './move-in.controller';
import { MoveInService } from './move-in.service';
import { MoveInAdminController } from './move-in-admin.controller';
import { MediaModule } from '../media/media.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { BullModule } from '@nestjs/bullmq';
import { MOVE_IN_DEADLINE_QUEUE, MoveInDeadlineProcessor } from './move-in-deadline.processor';
import { JobsModule } from '../jobs/jobs.module';
import { MoveInRecoveryService } from './move-in-recovery.service';

@Module({ imports: [DocumentsModule, MediaModule, NotificationsModule, JobsModule, BullModule.registerQueue({ name: MOVE_IN_DEADLINE_QUEUE })], controllers: [MoveInController, MoveInAdminController], providers: [MoveInService, MoveInDeadlineProcessor, MoveInRecoveryService], exports: [MoveInService] })
export class MoveInModule {}
