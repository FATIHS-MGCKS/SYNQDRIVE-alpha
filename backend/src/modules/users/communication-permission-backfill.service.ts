import { Injectable, Logger } from '@nestjs/common';
import { MembershipRole, MembershipStatus, Prisma } from '@prisma/client';
import { PrismaService } from '@shared/database/prisma.service';
import {
  mergeCommunicationPermissionBackfill,
} from '@modules/users/communication-permission.defaults';
import {
  normalizeMembershipPermissions,
} from '@shared/auth/permission.util';

export type CommunicationPermissionBackfillResult = {
  scanned: number;
  updated: number;
  skipped: number;
  skippedDriver: number;
  skippedExplicitCommunication: number;
};

@Injectable()
export class CommunicationPermissionBackfillService {
  private readonly logger = new Logger(CommunicationPermissionBackfillService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Idempotent membership backfill:
   * - maps legacy ai-assistant → communication / voice-assistant when module keys absent
   * - never overwrites explicit communication/voice-assistant keys (including explicit revoke)
   * - never grants communication.manage from ai-assistant alone
   */
  async backfillOrganization(
    organizationId: string,
    options: { dryRun?: boolean } = {},
  ): Promise<CommunicationPermissionBackfillResult> {
    const memberships = await this.prisma.organizationMembership.findMany({
      where: {
        organizationId,
        status: MembershipStatus.ACTIVE,
        role: { not: MembershipRole.ORG_ADMIN },
      },
      select: {
        id: true,
        role: true,
        permissions: true,
      },
    });

    const result: CommunicationPermissionBackfillResult = {
      scanned: memberships.length,
      updated: 0,
      skipped: 0,
      skippedDriver: 0,
      skippedExplicitCommunication: 0,
    };

    for (const membership of memberships) {
      const normalized = normalizeMembershipPermissions(membership.permissions);
      if (membership.role === MembershipRole.DRIVER) {
        result.skippedDriver += 1;
        result.skipped += 1;
        continue;
      }

      const hasExplicitCommunication =
        normalized &&
        Object.prototype.hasOwnProperty.call(normalized, 'communication');

      if (hasExplicitCommunication) {
        result.skippedExplicitCommunication += 1;
        result.skipped += 1;
        continue;
      }

      const { next, changed } = mergeCommunicationPermissionBackfill(normalized);
      if (!changed || !next) {
        result.skipped += 1;
        continue;
      }

      if (!options.dryRun) {
        await this.prisma.organizationMembership.update({
          where: { id: membership.id },
          data: { permissions: next as unknown as Prisma.InputJsonValue },
        });
      }

      result.updated += 1;
    }

    if (result.updated > 0) {
      this.logger.log(
        `Communication permission backfill org=${organizationId} updated=${result.updated} dryRun=${options.dryRun === true}`,
      );
    }

    return result;
  }
}
