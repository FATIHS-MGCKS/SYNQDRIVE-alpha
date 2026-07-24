import { Injectable, Logger, Optional } from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';
import { getQueueToken } from '@nestjs/bullmq';
import type { Queue, Job } from 'bullmq';
import { PrismaService } from '@shared/database/prisma.service';
import {
  REVOCATION_QUEUE_CATALOG,
  type RevocationJobScope,
} from './revocation-queue-catalog';
import { buildQueueActionIdempotencyKey } from './revocation-queue-control.constants';
import type {
  RevocationQueueControlContext,
  RevocationQueueControlResult,
} from './revocation-queue-control.types';

const JOB_SCAN_LIMIT = 200;

@Injectable()
export class RevocationQueueControlService {
  private readonly logger = new Logger(RevocationQueueControlService.name);
  private readonly queueCache = new Map<string, Queue>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly moduleRef: ModuleRef,
  ) {}

  /**
   * Scoped, idempotent queue cancellation — never flushes entire queues.
   */
  async cancelScopedJobs(ctx: RevocationQueueControlContext): Promise<RevocationQueueControlResult> {
    const result: RevocationQueueControlResult = {
      removed: 0,
      suppressed: 0,
      checkpointRequired: 0,
      alreadyRemoved: 0,
      enqueueBlocked: 0,
      byQueue: {},
    };

    for (const entry of REVOCATION_QUEUE_CATALOG) {
      const queue = await this.resolveQueue(entry.queueName);
      if (!queue) continue;

      const queueStats = { removed: 0, checkpointRequired: 0 };
      result.byQueue[entry.queueName] = queueStats;

      for (const state of entry.cancellableStates) {
        const jobs = await this.safeGetJobs(queue, [state], JOB_SCAN_LIMIT);
        for (const job of jobs) {
          const scope = entry.extractScope((job.data ?? {}) as Record<string, unknown>);
          if (!scope || !this.matchesRevocationScope(scope, ctx)) continue;

          const resolvedOrgId = await this.resolveOrganizationId(scope);
          if (resolvedOrgId !== ctx.organizationId) continue;

          const action = await this.removeJobIdempotent({
            workflowId: ctx.workflowId,
            organizationId: ctx.organizationId,
            correlationId: ctx.correlationId,
            queueName: entry.queueName,
            job,
            jobState: state.toUpperCase() as 'WAITING' | 'DELAYED' | 'PAUSED',
            scope,
          });
          if (action === 'REMOVED') {
            result.removed++;
            queueStats.removed++;
          } else if (action === 'ALREADY_REMOVED') {
            result.alreadyRemoved++;
          }
        }
      }

      for (const state of entry.checkpointStates) {
        const jobs = await this.safeGetJobs(queue, [state], JOB_SCAN_LIMIT);
        for (const job of jobs) {
          const scope = entry.extractScope((job.data ?? {}) as Record<string, unknown>);
          if (!scope || !this.matchesRevocationScope(scope, ctx)) continue;
          const resolvedOrgId = await this.resolveOrganizationId(scope);
          if (resolvedOrgId !== ctx.organizationId) continue;

          await this.recordQueueAction({
            workflowId: ctx.workflowId,
            organizationId: ctx.organizationId,
            correlationId: ctx.correlationId,
            queueName: entry.queueName,
            jobId: job.id ?? 'unknown',
            jobState: 'ACTIVE',
            action: 'CHECKPOINT_REQUIRED',
            scope,
          });
          result.checkpointRequired++;
          queueStats.checkpointRequired++;
        }
      }
    }

    this.logger.log(
      `Revocation queue control workflow=${ctx.workflowId} org=${ctx.organizationId} removed=${result.removed} checkpoint=${result.checkpointRequired}`,
    );

    return result;
  }

  private async removeJobIdempotent(input: {
    workflowId: string;
    organizationId: string;
    correlationId: string;
    queueName: string;
    job: Job;
    jobState: 'WAITING' | 'DELAYED' | 'PAUSED';
    scope: RevocationJobScope;
  }): Promise<'REMOVED' | 'ALREADY_REMOVED'> {
    const jobId = input.job.id ?? 'unknown';
    const idempotencyKey = buildQueueActionIdempotencyKey({
      workflowId: input.workflowId,
      queueName: input.queueName,
      jobId,
      action: 'REMOVED',
    });

    const existing = await this.prisma.dataAuthorizationRevocationQueueAction.findUnique({
      where: { idempotencyKey },
    });
    if (existing) return 'ALREADY_REMOVED';

    try {
      await input.job.remove();
      await this.recordQueueAction({
        workflowId: input.workflowId,
        organizationId: input.organizationId,
        correlationId: input.correlationId,
        queueName: input.queueName,
        jobId,
        jobState: input.jobState,
        action: 'REMOVED',
        scope: input.scope,
        idempotencyKey,
      });
      return 'REMOVED';
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (/missing|not found|locked/i.test(message)) {
        await this.recordQueueAction({
          workflowId: input.workflowId,
          organizationId: input.organizationId,
          correlationId: input.correlationId,
          queueName: input.queueName,
          jobId,
          jobState: input.jobState,
          action: 'ALREADY_REMOVED',
          scope: input.scope,
          idempotencyKey,
          errorMessage: message,
        });
        return 'ALREADY_REMOVED';
      }
      throw err;
    }
  }

  private async recordQueueAction(input: {
    workflowId: string;
    organizationId: string;
    correlationId: string;
    queueName: string;
    jobId: string;
    jobState: 'WAITING' | 'DELAYED' | 'PAUSED' | 'ACTIVE' | 'RETRY';
    action: 'REMOVED' | 'SUPPRESSED' | 'CHECKPOINT_REQUIRED' | 'ALREADY_REMOVED' | 'ENQUEUE_BLOCKED';
    scope: RevocationJobScope;
    idempotencyKey?: string;
    errorMessage?: string;
  }): Promise<void> {
    const idempotencyKey =
      input.idempotencyKey ??
      buildQueueActionIdempotencyKey({
        workflowId: input.workflowId,
        queueName: input.queueName,
        jobId: input.jobId,
        action: input.action,
      });

    try {
      await this.prisma.dataAuthorizationRevocationQueueAction.create({
        data: {
          organizationId: input.organizationId,
          workflowId: input.workflowId,
          correlationId: input.correlationId,
          queueName: input.queueName,
          jobId: input.jobId,
          jobState: input.jobState,
          action: input.action,
          scopeEntityType: input.scope.vehicleId ? 'VEHICLE' : 'ORGANIZATION',
          scopeEntityId: input.scope.vehicleId ?? input.organizationId,
          idempotencyKey,
          errorMessage: input.errorMessage ?? null,
        },
      });
    } catch (err) {
      const code = (err as { code?: string })?.code;
      if (code !== 'P2002') throw err;
    }
  }

  private matchesRevocationScope(
    scope: RevocationJobScope,
    ctx: RevocationQueueControlContext,
  ): boolean {
    if (scope.organizationId !== '__vehicle_lookup__' && scope.organizationId !== ctx.organizationId) {
      return false;
    }
    if (ctx.processingActivityId && scope.processingActivityId) {
      if (scope.processingActivityId !== ctx.processingActivityId) return false;
    }
    if (ctx.enforcementPolicyId && scope.enforcementPolicyId) {
      if (scope.enforcementPolicyId !== ctx.enforcementPolicyId) return false;
    }
    if (ctx.vehicleIds?.length && scope.vehicleId) {
      return ctx.vehicleIds.includes(scope.vehicleId);
    }
    return true;
  }

  private async resolveOrganizationId(scope: RevocationJobScope): Promise<string | null> {
    if (scope.organizationId !== '__vehicle_lookup__') {
      return scope.organizationId;
    }
    if (!scope.vehicleId) return null;
    const vehicle = await this.prisma.vehicle.findUnique({
      where: { id: scope.vehicleId },
      select: { organizationId: true },
    });
    return vehicle?.organizationId ?? null;
  }

  private async resolveQueue(queueName: string): Promise<Queue | undefined> {
    if (this.queueCache.has(queueName)) {
      return this.queueCache.get(queueName);
    }
    try {
      const queue = this.moduleRef.get<Queue>(getQueueToken(queueName), { strict: false });
      if (queue) this.queueCache.set(queueName, queue);
      return queue;
    } catch {
      return undefined;
    }
  }

  private async safeGetJobs(
    queue: Queue,
    states: ('waiting' | 'delayed' | 'paused' | 'active' | 'waiting-children')[],
    limit: number,
  ): Promise<Job[]> {
    try {
      return await queue.getJobs(states, 0, limit);
    } catch (err) {
      this.logger.warn(
        `getJobs failed queue=${queue.name}: ${err instanceof Error ? err.message : String(err)}`,
      );
      return [];
    }
  }
}
