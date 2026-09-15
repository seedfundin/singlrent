import { SetMetadata } from '@nestjs/common';
import { RoleCode } from '@prisma/client';

export const ROLES_KEY = 'roles';
export const Roles = (...roles: RoleCode[]): ReturnType<typeof SetMetadata> =>
  SetMetadata(ROLES_KEY, roles);
