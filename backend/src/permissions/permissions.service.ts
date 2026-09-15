import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PermissionEffect, PermissionKey, RoleCode, UserStatus } from '@prisma/client';
import { PrismaService } from '../common/database/prisma.service';

export interface AuthorizationContext {
  roles: RoleCode[];
  permissions: PermissionKey[];
}

@Injectable()
export class PermissionsService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Permission evaluation stays in one place. A direct DENY takes precedence over
   * a role grant, which lets a Super Admin safely restrict an individual admin.
   */
  async getAuthorizationContext(userId: string): Promise<AuthorizationContext> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        status: true,
        userRoles: {
          select: {
            role: {
              select: {
                code: true,
                permissions: { select: { permission: { select: { key: true } } } },
              },
            },
          },
        },
        directPermissions: {
          select: { effect: true, permission: { select: { key: true } } },
        },
      },
    });

    if (!user || user.status !== UserStatus.ACTIVE) {
      throw new UnauthorizedException('User is not active');
    }

    const roles = user.userRoles.map(({ role }) => role.code);
    const effectivePermissions = new Set<PermissionKey>();

    for (const { role } of user.userRoles) {
      for (const { permission } of role.permissions) {
        effectivePermissions.add(permission.key);
      }
    }

    for (const { effect, permission } of user.directPermissions) {
      if (effect === PermissionEffect.DENY) {
        effectivePermissions.delete(permission.key);
      } else {
        effectivePermissions.add(permission.key);
      }
    }

    return { roles, permissions: [...effectivePermissions] };
  }
}
