import {
  BadRequestException,
  Injectable,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import {
  ProcessingActivityDeletionDecisionType,
  ProcessingActivityDeletionJobStatus,
  ProcessingActivityDeletionMethod,
  ProcessingActivityDeletionStepStatus,
} from '@prisma/client';
import { createHash, randomUUID } from 'crypto';
import { PrismaService } from '@shared/database/prisma.service';
import { DeletionStoreRegistry } from './deletion-store.adapters';
import { RETENTION_DELETION_CONFIG } from './retention-deletion.config';
import { RetentionDeletionAuditService } from './retention-deletion-audit.service';
import { DataAuthMetricsService } from '../observability/data-auth-metrics.service';
import type { RunDeletionJobDto } from './dto/retention-deletion.dto';

@Injectable()
export class RetentionDeletionExecutorService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly stores: DeletionStoreRegistry,
    private readonly audit: RetentionDeletionAuditService,
    @Optional() private readonly dataAuthMetrics?: DataAuthMetricsService,
  ) {}

  async runJob(
    orgId: string,
    processingActivityId: string,
    dto: RunDeletionJobDto,
    actorUserId?: string,
  ) {
    const dryRun = dto.dryRun ?? RETENTION_DELETION_CONFIG.defaultDryRun;
    const policy = dto.retentionPolicyId
      ? await this.prisma.processingActivityRetentionPolicy.findFirst({
          where: { id: dto.retentionPolicyId, organizationId: orgId, processingActivityId },
        })
      : await this.prisma.processingActivityRetentionPolicy.findFirst({
          where: { organizationId: orgId, processingActivityId, isConfigured: true },
          orderBy: { updatedAt: 'desc' },
        });

    if (!policy) {
      throw new NotFoundException({ message: 'No retention policy configured' });
    }

    if (policy.legalHold) {
      throw new BadRequestException({
        code: 'LEGAL_HOLD_BLOCKS_DELETION',
        message: 'Deletion blocked by legal hold',
      });
    }

    const idempotencyKey = this.buildIdempotencyKey(orgId, processingActivityId, policy.id, dryRun);

    const existing = await this.prisma.processingActivityDeletionJob.findUnique({
      where: { idempotencyKey },
      include: { steps: true, evidence: true },
    });
    if (existing && ['COMPLETED', 'DRY_RUN_COMPLETED', 'PARTIAL_FAILURE'].includes(existing.status)) {
      return { ...existing, idempotentReplay: true };
    }

    const job = await this.prisma.$transaction(async (tx) => {
      const job =
        existing ??
        (await tx.processingActivityDeletionJob.create({
          data: {
            id: randomUUID(),
            organizationId: orgId,
            processingActivityId,
            retentionPolicyId: policy.id,
            idempotencyKey,
            dryRun,
            status: ProcessingActivityDeletionJobStatus.IN_PROGRESS,
            trigger: dto.trigger ?? 'manual',
            deletionDueAt: policy.deletionDueAt,
            startedAt: new Date(),
          },
        }));

      const stepResults = [];
      let partialFailure = false;

      const priorSteps =
        'steps' in job && Array.isArray(job.steps)
          ? job.steps
          : await tx.processingActivityDeletionJobStep.findMany({ where: { jobId: job.id } });

      for (const adapter of this.stores.all()) {
        const prior = priorSteps.find(
          (s: { target: string; stepKey: string }) => s.target === adapter.target && s.stepKey === 'v1',
        );
        if (prior?.status === ProcessingActivityDeletionStepStatus.COMPLETED) {
          stepResults.push(prior);
          continue;
        }

        const result = await adapter.execute({
          organizationId: orgId,
          processingActivityId,
          dataCategory: policy.dataCategory,
          dryRun,
          deletionMethod: policy.deletionMethod,
          anonymizationAllowed: policy.anonymizationAllowed,
        });

        const step = await tx.processingActivityDeletionJobStep.upsert({
          where: {
            jobId_target_stepKey: {
              jobId: job.id,
              target: adapter.target,
              stepKey: 'v1',
            },
          },
          create: {
            id: randomUUID(),
            organizationId: orgId,
            jobId: job.id,
            target: adapter.target,
            status: result.status as ProcessingActivityDeletionStepStatus,
            rowsAffected: result.rowsAffected,
            errorCode: result.errorCode,
            errorMessage: result.errorMessage,
            executedAt: new Date(),
            stepKey: 'v1',
            metadata: result.metadata as object,
          },
          update: {
            status: result.status as ProcessingActivityDeletionStepStatus,
            rowsAffected: result.rowsAffected,
            errorCode: result.errorCode,
            errorMessage: result.errorMessage,
            executedAt: new Date(),
            metadata: result.metadata as object,
          },
        });

        for (const ev of result.evidence ?? []) {
          await tx.processingActivityDeletionEvidence.create({
            data: {
              id: randomUUID(),
              organizationId: orgId,
              jobId: job.id,
              evidenceType: ev.type,
              evidenceValue: ev.value,
            },
          });
        }

        if (result.status === 'FAILED') partialFailure = true;
        stepResults.push(step);
      }

      const finalStatus = dryRun
        ? ProcessingActivityDeletionJobStatus.DRY_RUN_COMPLETED
        : partialFailure
          ? ProcessingActivityDeletionJobStatus.PARTIAL_FAILURE
          : ProcessingActivityDeletionJobStatus.COMPLETED;

      const updatedJob = await tx.processingActivityDeletionJob.update({
        where: { id: job.id },
        data: {
          status: finalStatus,
          partialFailure,
          completedAt: new Date(),
          report: { steps: stepResults.length, partialFailure } as object,
        },
        include: { steps: true, evidence: true },
      });

      await this.audit.recordDecision(tx, {
        organizationId: orgId,
        processingActivityId,
        retentionPolicyId: policy.id,
        decisionType: dryRun
          ? ProcessingActivityDeletionDecisionType.DRY_RUN_COMPLETED
          : partialFailure
            ? ProcessingActivityDeletionDecisionType.DELETION_DEFERRED
            : ProcessingActivityDeletionDecisionType.DELETION_EXECUTED,
        actorUserId,
        outcome: finalStatus,
        metadata: {
          jobId: job.id,
          partialFailure,
          deletionMethod: policy.deletionMethod,
          anonymization:
            policy.deletionMethod === ProcessingActivityDeletionMethod.ANONYMIZE,
        },
      });

      if (!dryRun && !partialFailure) {
        await tx.processingActivityRetentionPolicy.update({
          where: { id: policy.id },
          data: { deletionCompletedAt: new Date() },
        });
      }

      return updatedJob;
    });

    if (job.partialFailure) {
      this.dataAuthMetrics?.recordRetentionError('deletion_job');
    }

    return job;
  }

  private buildIdempotencyKey(
    orgId: string,
    activityId: string,
    policyId: string,
    dryRun: boolean,
  ): string {
    return createHash('sha256')
      .update(`${orgId}:${activityId}:${policyId}:${dryRun ? 'dry' : 'apply'}:v1`)
      .digest('hex');
  }
}
