import { Injectable } from '@nestjs/common';

@Injectable()
export class AppService {
  health(): { status: 'ok'; timestamp: string } {
    return { status: 'ok', timestamp: new Date().toISOString() };
  }
}
