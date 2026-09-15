import { ConfigService } from '@nestjs/config';
import { PasswordService } from './password.service';

describe('PasswordService', () => {
  const configService = {
    getOrThrow: jest.fn().mockReturnValue(10),
  } as unknown as ConfigService;
  const service = new PasswordService(configService);

  it('hashes a password and verifies only the matching value', async () => {
    const passwordHash = await service.hash('a-secure-password');

    await expect(service.verify('a-secure-password', passwordHash)).resolves.toBe(true);
    await expect(service.verify('incorrect-password', passwordHash)).resolves.toBe(false);
  });
});
