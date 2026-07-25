import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron } from '@nestjs/schedule';
import { WorkflowRunWorkerService } from './workflow-run-worker.service';
import { WorkflowApprovalResumeService } from './approval/workflow-approval-resume.service';
import { WorkflowRunCancellationService } from './cancellation/workflow-run-cancellation.service';
import { WorkflowTimerRepository } from './cancellation/workflow-timer.repository';
import { WorkflowRunRuntimeRepository } from './workflow-run-runtime.repository';
import { PrismaService } from '@shared/database/prisma.service';

@Injectable()
export class WorkflowRuntimeSchedulerService {
  private readonly logger = new Logger(WorkflowRuntimeSchedulerService.name);

  constructor(
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
    private readonly worker: WorkflowRunWorkerService,
    private readonly approvalResume: WorkflowApprovalResumeService,
    private readonly cancellation: WorkflowRunCancellationService,
    private readonly timers: WorkflowTimerRepository,
    private readonly runs: WorkflowRunRuntimeRepository,
  ) {}

  isEnabled(): boolean {
    return this.config.get<boolean>('workflowRuntime.schedulerEnabled', true);
  }

  @Cron('*/60 * * * * *')
  async pollRuntimeMaintenance(): Promise<void> {
    if (!this.isEnabled()) return;

    try {
      const staleRecovered = await this.worker.recoverStaleRunningActions();
      if (staleRecovered > 0) {
        this.logger.log(`Recovered ${staleRecovered} stale RUNNING action(s)`);
      }

      const expiredApprovals = await this.approvalResume.processExpiredBatch(
        this.config.get<number>('workflowRuntime.pollBatchSize', 25),
      );
      if (expiredApprovals > 0) {
        this.logger.log(`Expired ${expiredApprovals} pending approval(s)`);
      }

      const maxDurationCancelled = await this.worker.cancelExpiredRuns();
      if (maxDurationCancelled > 0) {
        this.logger.log(`Cancelled ${maxDurationCancelled} run(s) for max duration`);
      }

      await this.processDueTimers();
      await this.cancelRunsForLockedOrganizations();
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.error(`Runtime maintenance poll failed: ${message}`);
    }
  }

  private async processDueTimers() {
    const batch = await this.timers.findDueBatch(
      new Date(),
      this.config.get<number>('workflowRuntime.pollBatchSize', 25),
    );

    for (const timer of batch) {
      const fired = await this.timers.markFired(timer.id);
      if (fired.count === 0) continue;

      if (timer.timerType === 'RETRY_BACKOFF' && timer.workflowRunId) {
        await this.worker.processRun(timer.organizationId, timer.workflowRunId);
      }
    }
  }

  private async cancelRunsForLockedOrganizations() {
    const lockedOrgs = await this.prisma.organization.findMany({
      where: { status: { in: ['ARCHIVED', 'SUSPENDED'] } },
      select: { id: true, status: true },
      take: this.config.get<number>('workflowRuntime.pollBatchSize', 25),
    });

    for (const org of lockedOrgs) {
      const result = await this.cancellation.cancelRunsForLockedOrg(org.id, org.status);
      if (result.cancelled > 0) {
        this.logger.log(
          `Cancelled ${result.cancelled} active run(s) for locked org ${org.id} (${org.status})`,
        );
      }
    }
  }

  async resumeResumableRuns(orgId: string) {
    const resumable = await this.runs.listResumable(orgId);
    let processed = 0;
    for (const run of resumable) {
      const result = await this.worker.processRun(orgId, run.id);
      if (result.processed) processed += 1;
    }
    return processed;
  }
}
