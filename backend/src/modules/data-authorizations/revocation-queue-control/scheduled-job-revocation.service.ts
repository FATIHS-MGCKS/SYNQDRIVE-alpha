import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '@shared/database/prisma.service';
import {
  REVOCATION_SCHEDULER_KEYS,
  type RevocationSchedulerKey,
} from './revocation-queue-catalog';
import { buildSchedulerPauseIdempotencyKey } from './revocation-queue-control.constants';

@Injectable()
export class ScheduledJobRevocationService {
  private readonly logger = new Logger(ScheduledJobRevocationService.name);
  private readonly localPauseCache = new Map<string, number>();

  constructor(private readonly prisma: PrismaService) {}

  async pauseSchedulersForOrganization(input: {
    organizationId: string;
    correlationId: string;
    schedulerKeys?: readonly RevocationSchedulerKey[];
  }): Promise<number> {
    const keys = input.schedulerKeys ?? REVOCATION_SCHEDULER_KEYS;
    let paused = 0;

    for (const schedulerKey of keys) {
      const idempotencyKey = buildSchedulerPauseIdempotencyKey({
        organizationId: input.organizationId,
        schedulerKey,
        correlationId: input.correlationId,
      });

      const existing = await this.prisma.dataAuthorizationScheduledJobPause.findUnique({
        where: { idempotencyKey },
      });
      if (existing) {
        this.localPauseCache.set(`${input.organizationId}:${schedulerKey}`, Date.now());
        continue;
      }

      await this.prisma.dataAuthorizationScheduledJobPause.create({
        data: {
          organizationId: input.organizationId,
          schedulerKey,
          correlationId: input.correlationId,
          idempotencyKey,
        },
      });
      this.localPauseCache.set(`${input.organizationId}:${schedulerKey}`, Date.now());
      paused++;
    }

    if (paused > 0) {
      this.logger.log(
        `Paused ${paused} schedulers for org=${input.organizationId} correlation=${input.correlationId}`,
      );
    }

    return paused;
  }

  async isSchedulerPaused(
    organizationId: string,
    schedulerKey: RevocationSchedulerKey,
  ): Promise<boolean> {
    const cacheKey = `${organizationId}:${schedulerKey}`;
    if (this.localPauseCache.has(cacheKey)) return true;

    const row = await this.prisma.dataAuthorizationScheduledJobPause.findFirst({
      where: {
        organizationId,
        schedulerKey,
        OR: [{ pausedUntil: null }, { pausedUntil: { gt: new Date() } }],
      },
      orderBy: { createdAt: 'desc' },
    });
    if (row) {
      this.localPauseCache.set(cacheKey, Date.now());
      return true;
    }
    return false;
  }

  async isAnySchedulerPaused(organizationId: string): Promise<boolean> {
    const count = await this.prisma.dataAuthorizationScheduledJobPause.count({
      where: {
        organizationId,
        OR: [{ pausedUntil: null }, { pausedUntil: { gt: new Date() } }],
      },
      take: 1,
    });
    return count > 0;
  }
}
