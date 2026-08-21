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
  skippedExplicitVoiceAssistant: number;
  backfilledCommunication: number;
  backfilledVoiceAssistant: number;
};

@Injectable()
export class CommunicationPermissionBackfillService {
  private readonly logger = new Logger(CommunicationPermissionBackfillService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Idempotent membership backfill with independent domain evaluation:
   * - explicit communication key → never infer/overwrite communication; voice-assistant still evaluated if missing
   * - explicit voice-assistant key → never infer/overwrite voice-assistant; communication still evaluated if missing
   * - both explicit → no mutation
   * - neither explicit → evaluate both from legacy ai-assistant mapping
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
      skippedExplicitVoiceAssistant: 0,
      backfilledCommunication: 0,
      backfilledVoiceAssistant: 0,
    };

    for (const membership of memberships) {
      const normalized = normalizeMembershipPermissions(membership.permissions);
      if (membership.role === MembershipRole.DRIVER) {
        result.skippedDriver += 1;
        result.skipped += 1;
        continue;
      }

      const { next, changed, meta } = mergeCommunicationPermissionBackfill(normalized);

      if (meta.hasExplicitCommunication) {
        result.skippedExplicitCommunication += 1;
      }
      if (meta.hasExplicitVoiceAssistant) {
        result.skippedExplicitVoiceAssistant += 1;
      }

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
      if (meta.patchedCommunication) {
        result.backfilledCommunication += 1;
      }
      if (meta.patchedVoiceAssistant) {
        result.backfilledVoiceAssistant += 1;
      }
    }

    if (result.updated > 0) {
      this.logger.log(
        `Communication permission backfill org=${organizationId} updated=${result.updated} communication=${result.backfilledCommunication} voiceAssistant=${result.backfilledVoiceAssistant} dryRun=${options.dryRun === true}`,
      );
    }

    return result;
  }
}
