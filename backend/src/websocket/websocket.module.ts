import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { PermissionsModule } from '../permissions/permissions.module';
import { RealtimeGateway } from './realtime.gateway';

@Module({
  // The gateway verifies the same access tokens used by HTTP endpoints.
  imports: [AuthModule, PermissionsModule],
  providers: [RealtimeGateway],
  exports: [RealtimeGateway],
})
export class WebsocketModule {}
