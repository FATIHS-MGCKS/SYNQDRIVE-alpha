import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PlatformPermissionKey, UserPlatformRole, UserStatus } from '@prisma/client';
import { PrismaService } from '@shared/database/prisma.service';
import {
  PLATFORM_PERMISSION_JWT_VALUES,
  PLATFORM_PERMISSION_KEY_TO_JWT,
} from './platform-permission.constants';

@Injectable()
export class PlatformPermissionService {
  constructor(private readonly prisma: PrismaService) {}

  async hasActiveMasterBillingGrant(userId: string): Promise<boolean> {
    return this.hasActiveGrant(userId, PlatformPermissionKey.MASTER_BILLING);
  }

  async hasActiveGrant(userId: string, permissionKey: PlatformPermissionKey): Promise<boolean> {
    const row = await this.prisma.userPlatformPermissionGrant.findFirst({
      where: { userId, permissionKey, revokedAt: null },
      select: { id: true },
    });
    return row != null;
  }

  async resolveJwtPermissions(userId: string): Promise<string[]> {
    const grants = await this.prisma.userPlatformPermissionGrant.findMany({
      where: { userId, revokedAt: null },
      select: { permissionKey: true },
    });
    return grants.map((g) => PLATFORM_PERMISSION_KEY_TO_JWT[g.permissionKey]);
  }

  async grantMasterBilling(
    targetUserId: string,
    actorUserId: string,
  ): Promise<{ granted: boolean; idempotent: boolean; grantId: string | null }> {
    await this.assertGrantTargetEligible(targetUserId);

    const existing = await this.prisma.userPlatformPermissionGrant.findFirst({
      where: {
        userId: targetUserId,
        permissionKey: PlatformPermissionKey.MASTER_BILLING,
        revokedAt: null,
      },
    });
    if (existing) {
      return { granted: true, idempotent: true, grantId: existing.id };
    }

    const grant = await this.prisma.userPlatformPermissionGrant.create({
      data: {
        userId: targetUserId,
        permissionKey: PlatformPermissionKey.MASTER_BILLING,
        grantedByUserId: actorUserId,
      },
    });
    return { granted: true, idempotent: false, grantId: grant.id };
  }

  async revokeMasterBilling(
    targetUserId: string,
    actorUserId: string,
  ): Promise<{ revoked: boolean; idempotent: boolean; grantId: string | null }> {
    const active = await this.prisma.userPlatformPermissionGrant.findFirst({
      where: {
        userId: targetUserId,
        permissionKey: PlatformPermissionKey.MASTER_BILLING,
        revokedAt: null,
      },
    });
    if (!active) {
      return { revoked: false, idempotent: true, grantId: null };
    }

    const updated = await this.prisma.userPlatformPermissionGrant.update({
      where: { id: active.id },
      data: {
        revokedAt: new Date(),
        revokedByUserId: actorUserId,
      },
    });
    return { revoked: true, idempotent: false, grantId: updated.id };
  }

  private async assertGrantTargetEligible(targetUserId: string): Promise<void> {
    const user = await this.prisma.user.findUnique({
      where: { id: targetUserId },
      select: { id: true, status: true, platformRole: true },
    });
    if (!user) {
      throw new NotFoundException('Target user not found');
    }
    if (user.status !== UserStatus.ACTIVE) {
      throw new BadRequestException('Target user is not active');
    }
    if (user.platformRole === UserPlatformRole.MASTER_ADMIN) {
      throw new BadRequestException(
        'MASTER_ADMIN does not require delegated platform permissions',
      );
    }
  }

  assertMasterBillingJwtAllowlist(permissions: string[]): void {
    for (const p of permissions) {
      if (p !== PLATFORM_PERMISSION_JWT_VALUES.MASTER_BILLING) {
        throw new ConflictException(`Unsupported platform permission: ${p}`);
      }
    }
  }
}