import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  PlatformPermissionKey,
  Prisma,
  UserPlatformRole,
  UserStatus,
} from '@prisma/client';
import { PrismaService } from '@shared/database/prisma.service';
import type { MasterAdminAuditRecordInput } from '@modules/activity-log/master-admin-audit.contract';
import {
  PLATFORM_PERMISSION_JWT_VALUES,
  PLATFORM_PERMISSION_KEY_TO_JWT,
} from './platform-permission.constants';
import { persistPlatformPermissionMandatoryAuditTx } from './platform-permission-mandatory-audit.util';

export type PlatformPermissionGrantResult = {
  granted: boolean;
  idempotent: boolean;
  grantId: string | null;
};

export type PlatformPermissionRevokeResult = {
  revoked: boolean;
  idempotent: boolean;
  grantId: string | null;
};

const GRANT_MASTER_BILLING_SAVEPOINT = 'p3b0_grant_master_billing_insert';

@Injectable()
export class PlatformPermissionService {
  constructor(private readonly prisma: PrismaService) {}

  async hasActiveMasterBillingGrant(userId: string): Promise<boolean> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { status: true },
    });
    if (!user || user.status !== UserStatus.ACTIVE) {
      return false;
    }
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

  async grantMasterBillingWithMandatoryAudit(
    targetUserId: string,
    actorUserId: string,
    buildAudit: (result: PlatformPermissionGrantResult) => MasterAdminAuditRecordInput,
  ): Promise<PlatformPermissionGrantResult> {
    return this.prisma.$transaction(async (tx) => {
      const result = await this.grantMasterBillingInTx(tx, targetUserId, actorUserId);
      await persistPlatformPermissionMandatoryAuditTx(tx, buildAudit(result));
      return result;
    });
  }

  async revokeMasterBillingWithMandatoryAudit(
    targetUserId: string,
    actorUserId: string,
    buildAudit: (result: PlatformPermissionRevokeResult) => MasterAdminAuditRecordInput,
  ): Promise<PlatformPermissionRevokeResult> {
    return this.prisma.$transaction(async (tx) => {
      const result = await this.revokeMasterBillingInTx(tx, targetUserId, actorUserId);
      await persistPlatformPermissionMandatoryAuditTx(tx, buildAudit(result));
      return result;
    });
  }

  /** Grant without mandatory audit — short transaction for P2002 SAVEPOINT safety. */
  async grantMasterBilling(
    targetUserId: string,
    actorUserId: string,
  ): Promise<PlatformPermissionGrantResult> {
    return this.prisma.$transaction((tx) =>
      this.grantMasterBillingInTx(tx, targetUserId, actorUserId),
    );
  }

  /** Revoke without mandatory audit — short transaction for consistency with grant. */
  async revokeMasterBilling(
    targetUserId: string,
    actorUserId: string,
  ): Promise<PlatformPermissionRevokeResult> {
    return this.prisma.$transaction((tx) =>
      this.revokeMasterBillingInTx(tx, targetUserId, actorUserId),
    );
  }

  private async grantMasterBillingInTx(
    tx: Prisma.TransactionClient,
    targetUserId: string,
    actorUserId: string,
  ): Promise<PlatformPermissionGrantResult> {
    await this.assertGrantTargetEligibleInTx(tx, targetUserId);

    const existing = await tx.userPlatformPermissionGrant.findFirst({
      where: {
        userId: targetUserId,
        permissionKey: PlatformPermissionKey.MASTER_BILLING,
        revokedAt: null,
      },
    });
    if (existing) {
      return { granted: true, idempotent: true, grantId: existing.id };
    }

    await tx.$executeRawUnsafe(`SAVEPOINT ${GRANT_MASTER_BILLING_SAVEPOINT}`);
    try {
      const grant = await tx.userPlatformPermissionGrant.create({
        data: {
          userId: targetUserId,
          permissionKey: PlatformPermissionKey.MASTER_BILLING,
          grantedByUserId: actorUserId,
        },
      });
      await tx.$executeRawUnsafe(`RELEASE SAVEPOINT ${GRANT_MASTER_BILLING_SAVEPOINT}`);
      return { granted: true, idempotent: false, grantId: grant.id };
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        await tx.$executeRawUnsafe(`ROLLBACK TO SAVEPOINT ${GRANT_MASTER_BILLING_SAVEPOINT}`);
        const raced = await tx.userPlatformPermissionGrant.findFirst({
          where: {
            userId: targetUserId,
            permissionKey: PlatformPermissionKey.MASTER_BILLING,
            revokedAt: null,
          },
        });
        if (raced) {
          return { granted: true, idempotent: true, grantId: raced.id };
        }
      }
      throw error;
    }
  }

  private async revokeMasterBillingInTx(
    tx: Prisma.TransactionClient,
    targetUserId: string,
    actorUserId: string,
  ): Promise<PlatformPermissionRevokeResult> {
    const active = await tx.userPlatformPermissionGrant.findFirst({
      where: {
        userId: targetUserId,
        permissionKey: PlatformPermissionKey.MASTER_BILLING,
        revokedAt: null,
      },
    });
    if (!active) {
      return { revoked: false, idempotent: true, grantId: null };
    }

    const updated = await tx.userPlatformPermissionGrant.update({
      where: { id: active.id },
      data: {
        revokedAt: new Date(),
        revokedByUserId: actorUserId,
      },
    });
    return { revoked: true, idempotent: false, grantId: updated.id };
  }

  private async assertGrantTargetEligibleInTx(
    tx: Prisma.TransactionClient,
    targetUserId: string,
  ): Promise<void> {
    const user = await tx.user.findUnique({
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

  async grantUiAuditPermission(
    targetUserId: string,
    actorUserId: string,
    permissionKey:
      | typeof PlatformPermissionKey.UI_AUDIT_MASTER
      | typeof PlatformPermissionKey.UI_AUDIT_RENTAL
      | typeof PlatformPermissionKey.UI_AUDIT_OPERATOR,
  ): Promise<PlatformPermissionGrantResult> {
    return this.prisma.$transaction((tx) =>
      this.grantUiAuditPermissionInTx(tx, targetUserId, actorUserId, permissionKey),
    );
  }

  async revokeUiAuditPermission(
    targetUserId: string,
    actorUserId: string,
    permissionKey:
      | typeof PlatformPermissionKey.UI_AUDIT_MASTER
      | typeof PlatformPermissionKey.UI_AUDIT_RENTAL
      | typeof PlatformPermissionKey.UI_AUDIT_OPERATOR,
  ): Promise<PlatformPermissionRevokeResult> {
    return this.prisma.$transaction((tx) =>
      this.revokeUiAuditPermissionInTx(tx, targetUserId, actorUserId, permissionKey),
    );
  }

  private async grantUiAuditPermissionInTx(
    tx: Prisma.TransactionClient,
    targetUserId: string,
    actorUserId: string,
    permissionKey: PlatformPermissionKey,
  ): Promise<PlatformPermissionGrantResult> {
    await this.assertUiAuditGrantTargetEligibleInTx(tx, targetUserId);

    const existing = await tx.userPlatformPermissionGrant.findFirst({
      where: { userId: targetUserId, permissionKey, revokedAt: null },
    });
    if (existing) {
      return { granted: true, idempotent: true, grantId: existing.id };
    }

    const grant = await tx.userPlatformPermissionGrant.create({
      data: { userId: targetUserId, permissionKey, grantedByUserId: actorUserId },
    });
    return { granted: true, idempotent: false, grantId: grant.id };
  }

  private async revokeUiAuditPermissionInTx(
    tx: Prisma.TransactionClient,
    targetUserId: string,
    actorUserId: string,
    permissionKey: PlatformPermissionKey,
  ): Promise<PlatformPermissionRevokeResult> {
    const active = await tx.userPlatformPermissionGrant.findFirst({
      where: { userId: targetUserId, permissionKey, revokedAt: null },
    });
    if (!active) {
      return { revoked: false, idempotent: true, grantId: null };
    }
    const updated = await tx.userPlatformPermissionGrant.update({
      where: { id: active.id },
      data: { revokedAt: new Date(), revokedByUserId: actorUserId },
    });
    if (
      permissionKey === PlatformPermissionKey.UI_AUDIT_MASTER ||
      permissionKey === PlatformPermissionKey.UI_AUDIT_RENTAL ||
      permissionKey === PlatformPermissionKey.UI_AUDIT_OPERATOR
    ) {
      await tx.user.update({
        where: { id: targetUserId },
        data: { sessionVersion: { increment: 1 } },
      });
    }
    return { revoked: true, idempotent: false, grantId: updated.id };
  }

  private async assertUiAuditGrantTargetEligibleInTx(
    tx: Prisma.TransactionClient,
    targetUserId: string,
  ): Promise<void> {
    const user = await tx.user.findUnique({
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
        'UI audit grants are not permitted for MASTER_ADMIN identities',
      );
    }

    const orgAdmin = await tx.organizationMembership.findFirst({
      where: { userId: targetUserId, role: 'ORG_ADMIN', status: 'ACTIVE' },
      select: { id: true },
    });
    if (orgAdmin) {
      throw new BadRequestException(
        'UI audit grants are not permitted for ORG_ADMIN memberships',
      );
    }
  }
}