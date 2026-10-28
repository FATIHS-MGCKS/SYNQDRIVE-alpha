import { Injectable, Logger } from '@nestjs/common';
import type { PrismaClient } from '@prisma/client';
import { PrismaService } from '@shared/database/prisma.service';
import { Ds4AssessmentOutboxRepositoryV1 } from './ds4-assessment-outbox.repository.v1';
import {
  DI_V0_DS4_ASSESSMENT_TUNING,
  isDiV0Ds4AssessmentWorkerRunnable,
  parseDiV0Ds4AssessmentRuntimeConfig,
  type DiV0Ds4AssessmentRuntimeConfig,
} from './ds4-assessment.config';
import { Ds4AssessmentProcessorServiceV1 } from './ds4-assessment-processor.service.v1';

export type Ds4AssessmentPassResult = {
  configured: boolean;
  discovered: number;
  claimed: number;
  succeeded: number;
  failedRetryable: number;
  skipped: number;
};

@Injectable()
export class Ds4AssessmentServiceV1 {
  private readonly logger = new Logger(Ds4AssessmentServiceV1.name);
  private readonly runtimeConfig: DiV0Ds4AssessmentRuntimeConfig;
  private readonly outbox: Ds4AssessmentOutboxRepositoryV1;

  constructor(
    private readonly prisma: PrismaService,
    private readonly processor: Ds4AssessmentProcessorServiceV1,
  ) {
    this.runtimeConfig = parseDiV0Ds4AssessmentRuntimeConfig(process.env);
    this.outbox = new Ds4AssessmentOutboxRepositoryV1(prisma as unknown as PrismaClient);
  }

  isConfigured(): boolean {
    return isDiV0Ds4AssessmentWorkerRunnable(this.runtimeConfig);
  }

  getRuntimeConfig(): DiV0Ds4AssessmentRuntimeConfig {
    return this.runtimeConfig;
  }

  async runPass(now = new Date()): Promise<Ds4AssessmentPassResult> {
    if (!this.isConfigured()) {
      return {
        configured: false,
        discovered: 0,
        claimed: 0,
        succeeded: 0,
        failedRetryable: 0,
        skipped: 0,
      };
    }

    const discovered = await this.outbox.discoverFromSucceededMotionRuns({
      limit: this.runtimeConfig.batchLimit,
      now,
    });

    const claimedRows = await this.outbox.claimBatch({
      limit: this.runtimeConfig.batchLimit,
      now,
      leaseMs: DI_V0_DS4_ASSESSMENT_TUNING.claimLeaseMs,
    });

    let succeeded = 0;
    let failedRetryable = 0;
    let skipped = 0;

    for (const row of claimedRows) {
      try {
        const result = await this.processor.processMotionRun({
          organizationId: row.organizationId,
          vehicleId: row.vehicleId,
          tripId: row.tripId,
          sourceMotionRunId: row.sourceMotionRunId,
        });
        if (result.status === 'ok') {
          await this.outbox.markSucceeded(row.outboxId, row.claimToken);
          succeeded += 1;
        } else if (result.status === 'skipped') {
          await this.outbox.markSkipped(row.outboxId, row.claimToken, result.code);
          skipped += 1;
        } else {
          const delay = Math.min(
            DI_V0_DS4_ASSESSMENT_TUNING.baseRetryDelayMs * 2,
            DI_V0_DS4_ASSESSMENT_TUNING.maxRetryDelayMs,
          );
          await this.outbox.markFailedRetryable(row.outboxId, row.claimToken, {
            nextAttemptAt: new Date(now.getTime() + delay),
            errorCode: result.code,
            now,
          });
          failedRetryable += 1;
        }
      } catch (error) {
        const delay = DI_V0_DS4_ASSESSMENT_TUNING.baseRetryDelayMs;
        await this.outbox.markFailedRetryable(row.outboxId, row.claimToken, {
          nextAttemptAt: new Date(now.getTime() + delay),
          errorCode: error instanceof Error ? error.message.slice(0, 120) : 'UNKNOWN',
          now,
        });
        failedRetryable += 1;
      }
    }

    return {
      configured: true,
      discovered,
      claimed: claimedRows.length,
      succeeded,
      failedRetryable,
      skipped,
    };
  }
}
