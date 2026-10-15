import { Inject, Injectable, Logger } from '@nestjs/common';
import type { PrismaClient } from '@prisma/client';
import { PrismaService } from '@shared/database/prisma.service';
import {
  DI_V0_P2_AUTO_PROJECTION_V2_TUNING,
  isDiV0P2AutoProjectionV2Configured,
  type DiV0P2AutoProjectionV2Config,
} from './di-v0-p2-auto-projection-v2.config';
import { DiV0P2AutoProjectionOutboxRepository } from './di-v0-p2-auto-projection-outbox.repository';
import { DI_V0_P2_AUTO_PROJECTION_V2_CONFIG } from './di-v0-p2-auto-projection-v2.tokens';
import { DiV0TripSpeedQualityProjectionError } from './di-v0-trip-speed-quality-projection.errors';
import { DiV0TripSpeedQualityProjectionService } from './di-v0-trip-speed-quality-projection.service';

const SKIP_ERROR_CODES = new Set<DiV0TripSpeedQualityProjectionError['code']>([
  'NOT_ACTIVE_PRIMARY',
  'WORK_ITEM_SUPERSEDED',
  'WORK_ITEM_NOT_ELIGIBLE',
  'WORK_ITEM_NOT_FOUND',
  'TENANT_SCOPE_MISMATCH',
]);

export interface DiV0P2AutoProjectionV2PassResult {
  configured: boolean;
  discovered: number;
  claimed: number;
  succeeded: number;
  skipped: number;
  failedRetryable: number;
  staleAckIgnored: number;
}

@Injectable()
export class DiV0P2AutoProjectionV2Service {
  private readonly logger = new Logger(DiV0P2AutoProjectionV2Service.name);
  private readonly outbox: DiV0P2AutoProjectionOutboxRepository;

  constructor(
    private readonly prisma: PrismaService,
    private readonly projectionService: DiV0TripSpeedQualityProjectionService,
    @Inject(DI_V0_P2_AUTO_PROJECTION_V2_CONFIG) private readonly config: DiV0P2AutoProjectionV2Config,
  ) {
    this.outbox = new DiV0P2AutoProjectionOutboxRepository(this.prisma as PrismaClient);
  }

  isConfigured(): boolean {
    return isDiV0P2AutoProjectionV2Configured(this.config);
  }

  getConfig(): DiV0P2AutoProjectionV2Config {
    return this.config;
  }

  async runPass(now = new Date()): Promise<DiV0P2AutoProjectionV2PassResult> {
    const empty: DiV0P2AutoProjectionV2PassResult = {
      configured: false,
      discovered: 0,
      claimed: 0,
      succeeded: 0,
      skipped: 0,
      failedRetryable: 0,
      staleAckIgnored: 0,
    };
    if (!this.isConfigured() || !this.config.enabledSince) {
      return empty;
    }

    const discovered = await this.outbox.discoverEligible({
      qcPolicyVersion: this.config.qcPolicyVersion,
      enabledSince: this.config.enabledSince,
      limit: this.config.batchLimit * 5,
      now,
    });

    const claimed = await this.outbox.claimBatch(this.config.batchLimit, now);
    const result: DiV0P2AutoProjectionV2PassResult = {
      configured: true,
      discovered,
      claimed: claimed.length,
      succeeded: 0,
      skipped: 0,
      failedRetryable: 0,
      staleAckIgnored: 0,
    };

    for (const row of claimed) {
      try {
        await this.projectionService.projectForWorkItem(row.organizationId, row.workItemId, {
          qcPolicyVersion: this.config.qcPolicyVersion,
        });
        const acked = await this.outbox.markSucceeded(row.workItemId, row.claimToken);
        if (acked) {
          result.succeeded += 1;
        } else {
          result.staleAckIgnored += 1;
        }
      } catch (error) {
        const code = this.resolveErrorCode(error);
        if (code !== 'UNKNOWN' && SKIP_ERROR_CODES.has(code)) {
          const acked = await this.outbox.markSkipped(row.workItemId, row.claimToken, code);
          if (acked) {
            result.skipped += 1;
          } else {
            result.staleAckIgnored += 1;
          }
          continue;
        }
        const nextAttempt = this.computeNextAttempt(row.attemptCount + 1, now);
        const errCode = code === 'UNKNOWN' ? 'UNKNOWN' : code;
        const acked = await this.outbox.markFailedRetryable(row.workItemId, row.claimToken, errCode, nextAttempt);
        if (acked) {
          result.failedRetryable += 1;
          this.logger.warn(
            `P2 auto projection V2 failed workItemId=${row.workItemId} code=${errCode} nextAttemptAt=${nextAttempt.toISOString()}`,
          );
        } else {
          result.staleAckIgnored += 1;
        }
      }
    }

    if (result.claimed > 0) {
      this.logger.log(
        `P2 auto projection V2 pass discovered=${result.discovered} claimed=${result.claimed} ok=${result.succeeded} skipped=${result.skipped} retry=${result.failedRetryable} staleAck=${result.staleAckIgnored}`,
      );
    }

    return result;
  }

  private resolveErrorCode(error: unknown): DiV0TripSpeedQualityProjectionError['code'] | 'UNKNOWN' {
    if (error instanceof DiV0TripSpeedQualityProjectionError) {
      return error.code;
    }
    return 'UNKNOWN';
  }

  private computeNextAttempt(attemptCount: number, now: Date): Date {
    const delay = Math.min(
      DI_V0_P2_AUTO_PROJECTION_V2_TUNING.baseRetryDelayMs * 2 ** Math.max(0, attemptCount - 1),
      DI_V0_P2_AUTO_PROJECTION_V2_TUNING.maxRetryDelayMs,
    );
    return new Date(now.getTime() + delay);
  }
}
