import { Injectable, NotFoundException } from '@nestjs/common';
import { Role, RoleCode } from '@prisma/client';
import { PrismaService } from '../common/database/prisma.service';

@Injectable()
export class RolesService {
  constructor(private readonly prisma: PrismaService) {}

  async findByCodeOrThrow(code: RoleCode): Promise<Role> {
    const role = await this.prisma.role.findUnique({ where: { code } });
    if (!role) {
      throw new NotFoundException(`Role ${code} has not been seeded`);
    }
    return role;
  }
}
