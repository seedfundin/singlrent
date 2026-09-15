import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { compare, hash } from 'bcryptjs';

@Injectable()
export class PasswordService {
  constructor(private readonly configService: ConfigService) {}

  hash(value: string): Promise<string> {
    return hash(value, this.configService.getOrThrow<number>('PASSWORD_HASH_ROUNDS'));
  }

  verify(value: string, passwordHash: string): Promise<boolean> {
    return compare(value, passwordHash);
  }
}
