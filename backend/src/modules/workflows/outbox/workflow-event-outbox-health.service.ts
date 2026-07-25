import { Inject, Injectable } from '@nestjs/common';
import { ConfigType } from '@nestjs/config';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import workflowEventOutboxConfig from '@config/workflow-event-outbox.config';
import { QUEUE_NAMES } from '@workers/queues/queue-names';
import { WorkflowEventOutboxRepository } from './workflow-event-outbox.repository';
import { WorkflowEventOutboxSchedulerService } from './workflow-event-outbox-scheduler.service';
import { WorkflowEventOutboxObservabilityService } from './workflow-event-outbox-observability.service';
import { WorkflowEventOutboxProcessorService } from './workflow-event-outbox-processor.service';

export interface WorkflowEventOutboxHealthSnapshot {
  status: 'ok' | 'degraded' | 'disabled' | 'error';
  enabled: boolean;
  workerId: string;
  shuttingDown: boolean;
  inFlight: number;
  queueLag: number;
  deadLetterCount: number;
  oldestPendingAgeMs: number | null;
  lastPollAt: string | null;
  lastPollError: string | null;
  queueReachable: boolean | null;
  waitingJobs: number | null;
  activeJobs: number | null;
}

@Injectable()
export class WorkflowEventOutboxHealthService {
  constructor(
    @Inject(workflowEventOutboxConfig.KEY)
    private readonly config: ConfigType<typeof workflowEventOutboxConfig>,
    @InjectQueue(QUEUE_NAMES.WORKFLOW_EVENT_OUTBOX)
    private readonly queue: Queue,
    private readonly outboxRepo: WorkflowEventOutboxRepository,
    private readonly scheduler: WorkflowEventOutboxSchedulerService,
    private readonly processor: WorkflowEventOutboxProcessorService,
    private readonly observability: WorkflowEventOutboxObservabilityService,
  ) {}

  async getHealth(): Promise<WorkflowEventOutboxHealthSnapshot> {
    if (!this.config.enabled) {
      return {
        status: 'disabled',
        enabled: false,
        workerId: this.processor.getWorkerId(),
        shuttingDown: this.processor.isShuttingDown(),
        inFlight: this.processor.getInFlightCount(),
        queueLag: 0,
        deadLetterCount: 0,
        oldestPendingAgeMs: null,
        lastPollAt: null,
        lastPollError: null,
        queueReachable: null,
        waitingJobs: null,
        activeJobs: null,
      };
    }

    try {
      const [queueLag, deadLetterCount, oldestPendingAgeMs] = await Promise.all([
        this.outboxRepo.countQueueLag(),
        this.outboxRepo.countDeadLetter(),
        this.outboxRepo.findOldestPendingAgeMs(),
      ]);
      this.observability.setQueueLag(queueLag);

      let queueReachable: boolean | null = null;
      let waitingJobs: number | null = null;
      let activeJobs: number | null = null;
      try {
        const counts = await this.queue.getJobCounts('waiting', 'active', 'delayed');
        queueReachable = true;
        waitingJobs = (counts.waiting ?? 0) + (counts.delayed ?? 0);
        activeJobs = counts.active ?? 0;
      } catch {
        queueReachable = false;
      }

      const lastPollError = this.scheduler.getLastPollError();
      const status: WorkflowEventOutboxHealthSnapshot['status'] =
        lastPollError || queueReachable === false ? 'degraded' : 'ok';

      return {
        status,
        enabled: true,
        workerId: this.processor.getWorkerId(),
        shuttingDown: this.processor.isShuttingDown(),
        inFlight: this.processor.getInFlightCount(),
        queueLag,
        deadLetterCount,
        oldestPendingAgeMs,
        lastPollAt: this.scheduler.getLastPollAt()?.toISOString() ?? null,
        lastPollError,
        queueReachable,
        waitingJobs,
        activeJobs,
      };
    } catch (err: unknown) {
      return {
        status: 'error',
        enabled: true,
        workerId: this.processor.getWorkerId(),
        shuttingDown: this.processor.isShuttingDown(),
        inFlight: this.processor.getInFlightCount(),
        queueLag: 0,
        deadLetterCount: 0,
        oldestPendingAgeMs: null,
        lastPollAt: this.scheduler.getLastPollAt()?.toISOString() ?? null,
        lastPollError: err instanceof Error ? err.message : String(err),
        queueReachable: null,
        waitingJobs: null,
        activeJobs: null,
      };
    }
  }
}
