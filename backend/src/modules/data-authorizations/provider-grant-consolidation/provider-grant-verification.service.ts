import { Injectable, Logger } from '@nestjs/common';
import { ProviderAccessGrantStatus } from '@prisma/client';
import { PrismaService } from '@shared/database/prisma.service';

const DEFAULT_VERIFICATION_INTERVAL_MS = 24 * 60 * 60 * 1000;

/**
 * Periodic provider status verification — refreshes lastVerifiedAt without auto-activating grants.
 */
@Injectable()
export class ProviderGrantVerificationService {
  private readonly logger = new Logger(ProviderGrantVerificationService.name);

  constructor(private readonly prisma: PrismaService) {}

  async verifyStaleGrants(params?: {
    organizationId?: string;
    olderThanMs?: number;
    limit?: number;
  }): Promise<{ verified: number; skipped: number }> {
    const olderThanMs = params?.olderThanMs ?? DEFAULT_VERIFICATION_INTERVAL_MS;
    const cutoff = new Date(Date.now() - olderThanMs);
    const limit = params?.limit ?? 100;

    const grants = await this.prisma.providerAccessGrant.findMany({
      where: {
        providerStatus: ProviderAccessGrantStatus.ACTIVE,
        ...(params?.organizationId ? { organizationId: params.organizationId } : {}),
        OR: [{ lastVerifiedAt: null }, { lastVerifiedAt: { lt: cutoff } }],
      },
      take: limit,
      orderBy: { lastVerifiedAt: 'asc' },
    });

    let verified = 0;
    let skipped = 0;
    const now = new Date();

    for (const grant of grants) {
      if (grant.expiresAt && grant.expiresAt.getTime() <= now.getTime()) {
        await this.markExpired(grant.id, grant.organizationId, grant.providerStatus);
        verified++;
        continue;
      }

      await this.prisma.providerAccessGrant.update({
        where: { id: grant.id },
        data: { lastVerifiedAt: now },
      });
      verified++;
    }

    if (verified > 0) {
      this.logger.log(`Provider grant verification: verified=${verified} skipped=${skipped}`);
    }

    return { verified, skipped };
  }

  private async markExpired(
    grantId: string,
    organizationId: string,
    fromStatus: ProviderAccessGrantStatus,
  ): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      await tx.providerAccessGrant.update({
        where: { id: grantId },
        data: { providerStatus: ProviderAccessGrantStatus.EXPIRED },
      });
      await tx.providerAccessGrantStatusEvent.create({
        data: {
          organizationId,
          providerAccessGrantId: grantId,
          fromStatus,
          toStatus: ProviderAccessGrantStatus.EXPIRED,
          actorType: 'SYSTEM',
          reason: 'grant expiry detected during verification',
        },
      });
    });
  }
}
