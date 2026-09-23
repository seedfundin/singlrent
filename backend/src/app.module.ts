import { Module } from '@nestjs/common';
import { APP_FILTER, APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { AuthModule } from './auth/auth.module';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { AppConfigModule } from './config/config.module';
import { PrismaModule } from './common/database/prisma.module';
import { HttpExceptionFilter } from './common/filters/http-exception.filter';
import { JwtAuthGuard } from './common/guards/jwt-auth.guard';
import { PermissionsGuard } from './common/guards/permissions.guard';
import { RolesGuard } from './common/guards/roles.guard';
import { RequestLoggingInterceptor } from './common/interceptors/request-logging.interceptor';
import { BigIntSerializationInterceptor } from './common/interceptors/bigint-serialization.interceptor';
import { RedisModule } from './common/redis/redis.module';
import { JobsModule } from './jobs/jobs.module';
import { PermissionsModule } from './permissions/permissions.module';
import { RolesModule } from './roles/roles.module';
import { UsersModule } from './users/users.module';
import { WebsocketModule } from './websocket/websocket.module';
import { MediaModule } from './media/media.module';
import { ListingsModule } from './listings/listings.module';
import { NotificationsModule } from './notifications/notifications.module';
import { ConversationsModule } from './conversations/conversations.module';
import { ApplicationsModule } from './applications/applications.module';
import { MaintenanceModule } from './maintenance/maintenance.module';
import { IntegrationsModule } from './integrations/integrations.module';
import { FinancialsModule } from './financials/financials.module';
import { PaymentsModule } from './payments/payments.module';
import { AdminModule } from './admin/admin.module';
import { TenanciesModule } from './tenancies/tenancies.module';
import { ReviewsModule } from './reviews/reviews.module';
import { IncidentsModule } from './incidents/incidents.module';
import { DashboardModule } from './dashboard/dashboard.module';
import { GeocodingModule } from './geocoding/geocoding.module';

@Module({
  imports: [
    AppConfigModule,
    PrismaModule,
    RedisModule,
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 100 }]),
    UsersModule,
    RolesModule,
    PermissionsModule,
    AuthModule,
    JobsModule,
    WebsocketModule,
    MediaModule,
    ListingsModule,
    NotificationsModule,
    ConversationsModule,
    ApplicationsModule,
    MaintenanceModule,
    IntegrationsModule,
    FinancialsModule,
    PaymentsModule,
    AdminModule,
    TenanciesModule,
    ReviewsModule,
    IncidentsModule,
    DashboardModule,
    GeocodingModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    { provide: APP_FILTER, useClass: HttpExceptionFilter },
    { provide: APP_INTERCEPTOR, useClass: RequestLoggingInterceptor },
    { provide: APP_INTERCEPTOR, useClass: BigIntSerializationInterceptor },
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
    { provide: APP_GUARD, useClass: PermissionsGuard },
  ],
})
export class AppModule {}
