import { Injectable, Logger, Inject, forwardRef } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { ConfigType } from '@nestjs/config';
import { randomUUID } from 'crypto';
import notificationEvaluationConfig from '@config/notification-evaluation.config';
import { RedisService } from '@shared/redis/redis.service';
import { canEnqueueQueue } from '@shared/queue/queue-producer.util';
import { QUEUE_NAMES } from '@workers/queues/queue-names';
import { BusinessInsightsService } from '@modules/business-insights/business-insights.service';
import { RedisDistributedLockService } from '@shared/redis/redis-distributed-lock.service';
import {
  buildNotificationEvaluationJobId,
  buildNotificationEvaluationJobOptions,
  followUpKey,
  NOTIFICATION_EVALUATION_JOB_NAME,
  pendingEventsKey,
} from './notification-evaluation-queue.util';
import type {
  NotificationEvaluationJobData,
  NotificationEvaluationRunResult,
  NotificationEvaluationTriggerClass,
} from './notification-evaluation.types';
import { EMPTY_RUN_STATS } from './notification-evaluation.types';
import { NotificationEvaluationObservabilityService } from './notification-evaluation-observability.service';
import { runWithNotificationRunContext } from './notification-run-context';

@Injectable()
export class NotificationEvaluationService {
  private readonly logger = new Logger(NotificationEvaluationService.name);
  private heartbeatTimers = new Map<string, NodeJS.Timeout>();

  constructor(
    @InjectQueue(QUEUE_NAMES.NOTIFICATION_EVALUATION) private readonly queue: Queue,
    @Inject(notificationEvaluationConfig.KEY)
    private readonly config: ConfigType<typeof notificationEvaluationConfig>,
    private readonly redis: RedisService,
    private readonly lockService: RedisDistributedLockService,
    private readonly observability: NotificationEvaluationObservabilityService,
    @Inject(forwardRef(() => BusinessInsightsService))
    private readonly insightsService: BusinessInsightsService,
  ) {}

  async executeRun(job: NotificationEvaluationJobData): Promise<NotificationEvaluationRunResult> {
    const startedAt = new Date();
    const stats = EMPTY_RUN_STATS();
    const lockKey = this.lockService.lockKeyForOrganization(job.organizationId);
    const lockResult = await this.lockService.acquire(lockKey, this.config.lockTtlMs);

    if (!lockResult.acquired) {
      if (lockResult.reason === 'contended') {
        this.observability.logLockContention(job.organizationId, job.runId, job.triggerClass);
        await this.markFollowUp(job.organizationId);
        return {
          runId: job.runId,
          organizationId: job.organizationId,
          triggerType: job.triggerType,
          skipped: true,
          skipReason: 'lock_contended',
          followUpScheduled: true,
          stats,
        };
      }

      this.logger.warn(
        `Redis unavailable — cannot acquire eval lock for org ${job.organizationId}`,
      );
      return {
        runId: job.runId,
        organizationId: job.organizationId,
        triggerType: job.triggerType,
        skipped: true,
        skipReason: 'lock_redis_unavailable',
        stats,
      };
    }

    this.observability.logLockAcquired(job.organizationId, job.runId);
    this.startLockHeartbeat(lockKey, lockResult.handle);

    try {
      const coalescedEvents = await this.drainPendingEvents(job.organizationId, job.coalescedEvents);
      const triggerType = this.buildTriggerType(job.triggerType, coalescedEvents);

      const insightsResult = await runWithNotificationRunContext(
        {
          runId: job.runId,
          organizationId: job.organizationId,
          stats,
        },
        () => this.insightsService.runForOrganization(job.organizationId, triggerType),
      );

      stats.candidateCount = insightsResult.published;

      const completedAt = new Date();
      const result: NotificationEvaluationRunResult = {
        runId: job.runId,
        organizationId: job.organizationId,
        triggerType,
        stats,
        durationMs: completedAt.getTime() - startedAt.getTime(),
        insightsRunId: insightsResult.runId,
        publishedCount: insightsResult.published,
      };

      const followUp = await this.consumeFollowUp(job.organizationId);
      if (followUp) {
        result.followUpScheduled = true;
        await this.scheduleFollowUpRun(job.organizationId);
      }

      this.observability.observeRunDuration(result.durationMs ?? 0);
      this.observability.logRunCompleted(result);
      return result;
    } catch (err) {
      stats.failureCount++;
      throw err;
    } finally {
      this.stopLockHeartbeat(lockKey);
      await this.lockService.release(lockResult.handle);
    }
  }

  async scheduleDebouncedEvaluation(organizationId: string, eventSource: string): Promise<void> {
    const pendingKey = pendingEventsKey(organizationId);
    try {
      await this.redis.rpush(pendingKey, eventSource);
    } catch (err) {
      this.logger.error(`Failed to queue pending event for org ${organizationId}: ${err}`);
      return;
    }

    await this.enqueueEvaluation({
      organizationId,
      triggerClass: 'debounced',
      triggerType: 'debounced_event',
      delayMs: this.config.debounceWindowMs,
      coalescedEvents: [eventSource],
    });
  }

  async scheduleScheduledEvaluation(
    organizationId: string,
    triggerClass: Extract<NotificationEvaluationTriggerClass, 'scheduled' | 'scheduled_boot'>,
    triggerType: string,
    delayMs = 0,
  ): Promise<void> {
    await this.enqueueEvaluation({
      organizationId,
      triggerClass,
      triggerType,
      delayMs,
    });
  }

  private async enqueueEvaluation(input: {
    organizationId: string;
    triggerClass: NotificationEvaluationTriggerClass;
    triggerType: string;
    delayMs?: number;
    coalescedEvents?: string[];
  }): Promise<void> {
    if (!this.config.queueEnabled) {
      await this.executeRun({
        organizationId: input.organizationId,
        triggerType: input.triggerType,
        triggerClass: input.triggerClass,
        scheduledAt: new Date().toISOString(),
        runId: randomUUID(),
        coalescedEvents: input.coalescedEvents,
      });
      return;
    }

    if (!canEnqueueQueue(this.logger, 'notification-evaluation')) {
      this.logger.warn(
        `Queue unavailable — running notification evaluation inline for org ${input.organizationId}`,
      );
      await this.executeRun({
        organizationId: input.organizationId,
        triggerType: input.triggerType,
        triggerClass: input.triggerClass,
        scheduledAt: new Date().toISOString(),
        runId: randomUUID(),
        coalescedEvents: input.coalescedEvents,
      });
      return;
    }

    const jobId = buildNotificationEvaluationJobId(input.organizationId, input.triggerClass);
    const existing = await this.queue.getJob(jobId);
    if (existing) {
      const state = await existing.getState();
      if (state === 'active') {
        this.observability.logJobCoalesced(input.organizationId, input.triggerClass, 'active_run');
        await this.markFollowUp(input.organizationId);
        return;
      }
      if (state === 'waiting' || state === 'delayed') {
        this.observability.logJobCoalesced(input.organizationId, input.triggerClass, 'already_queued');
        return;
      }
      if (state === 'completed' || state === 'failed') {
        await existing.remove();
      }
    }

    const runId = randomUUID();
    const data: NotificationEvaluationJobData = {
      organizationId: input.organizationId,
      triggerType: input.triggerType,
      triggerClass: input.triggerClass,
      scheduledAt: new Date().toISOString(),
      runId,
      coalescedEvents: input.coalescedEvents,
    };

    try {
      await this.queue.add(
        NOTIFICATION_EVALUATION_JOB_NAME,
        data,
        buildNotificationEvaluationJobOptions(
          this.config,
          input.organizationId,
          input.triggerClass,
          input.delayMs ?? 0,
        ),
      );
    } catch (err) {
      const message = (err as Error).message ?? String(err);
      if (message.includes('Job') && message.includes('exists')) {
        this.observability.logJobCoalesced(input.organizationId, input.triggerClass, 'duplicate_job_id');
        return;
      }
      throw err;
    }
  }

  private async scheduleFollowUpRun(organizationId: string): Promise<void> {
    await this.enqueueEvaluation({
      organizationId,
      triggerClass: 'debounced',
      triggerType: 'debounced_event_followup',
      delayMs: 1_000,
    });
  }

  private async markFollowUp(organizationId: string): Promise<void> {
    try {
      await this.redis.set(followUpKey(organizationId), '1', 'PX', this.config.debounceWindowMs * 2);
    } catch (err) {
      this.logger.warn(`Failed to mark follow-up for org ${organizationId}: ${(err as Error).message}`);
    }
  }

  private async consumeFollowUp(organizationId: string): Promise<boolean> {
    try {
      const flag = await this.redis.get(followUpKey(organizationId));
      if (!flag) return false;
      await this.redis.del(followUpKey(organizationId));
      return true;
    } catch {
      return false;
    }
  }

  private async drainPendingEvents(
    organizationId: string,
    seed?: string[],
  ): Promise<string[]> {
    const key = pendingEventsKey(organizationId);
    try {
      const events = await this.redis.lrange(key, 0, -1);
      await this.redis.del(key);
      const merged = [...(seed ?? []), ...events];
      return [...new Set(merged)];
    } catch {
      return [...new Set(seed ?? [])];
    }
  }

  private buildTriggerType(base: string, events: string[]): string {
    if (events.length === 0) return base;
    const unique = [...new Set(events)];
    return `debounced_event(${unique.slice(0, 5).join(',')})`;
  }

  private startLockHeartbeat(
    lockKey: string,
    handle: { key: string; token: string; acquiredAt: Date },
  ): void {
    const timer = setInterval(() => {
      void this.lockService.extend(handle, this.config.lockTtlMs);
    }, this.config.lockHeartbeatMs);
    this.heartbeatTimers.set(lockKey, timer);
  }

  private stopLockHeartbeat(lockKey: string): void {
    const timer = this.heartbeatTimers.get(lockKey);
    if (timer) {
      clearInterval(timer);
      this.heartbeatTimers.delete(lockKey);
    }
  }
}
