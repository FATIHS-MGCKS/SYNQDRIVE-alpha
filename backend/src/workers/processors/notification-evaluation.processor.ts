import { Injectable, Logger } from '@nestjs/common';
import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { QUEUE_NAMES } from '@workers/queues/queue-names';
import { NotificationEvaluationService } from '@modules/notifications/runtime/notification-evaluation.service';
import { NotificationEvaluationObservabilityService } from '@modules/notifications/runtime/notification-evaluation-observability.service';
import type { NotificationEvaluationJobData } from '@modules/notifications/runtime/notification-evaluation.types';

@Injectable()
@Processor(QUEUE_NAMES.NOTIFICATION_EVALUATION, {
  concurrency: 2,
  lockDuration: 300_000,
})
export class NotificationEvaluationProcessor extends WorkerHost {
  private readonly logger = new Logger(NotificationEvaluationProcessor.name);

  constructor(
    private readonly evaluationService: NotificationEvaluationService,
    private readonly observability: NotificationEvaluationObservabilityService,
  ) {
    super();
  }

  async process(job: Job<NotificationEvaluationJobData>): Promise<void> {
    const attempt = job.attemptsMade + 1;
    try {
      await this.evaluationService.executeRun(job.data);
    } catch (err) {
      const message = (err as Error).message ?? String(err);
      if (attempt < (job.opts.attempts ?? 1)) {
        this.observability.logJobRetried(
          job.data.organizationId,
          job.data.runId,
          attempt,
          message,
        );
      } else {
        this.observability.logJobFailed(
          job.data.organizationId,
          job.data.runId,
          message,
          attempt,
        );
      }
      throw err;
    }
  }
}
