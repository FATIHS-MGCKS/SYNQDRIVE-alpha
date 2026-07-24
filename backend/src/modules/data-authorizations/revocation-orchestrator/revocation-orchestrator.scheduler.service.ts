import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { REVOCATION_ORCHESTRATOR } from './revocation-orchestrator.constants';
import { RevocationOrchestratorService } from './revocation-orchestrator.service';

@Injectable()
export class RevocationOrchestratorSchedulerService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RevocationOrchestratorSchedulerService.name);
  private timer: ReturnType<typeof setInterval> | null = null;

  constructor(private readonly orchestrator: RevocationOrchestratorService) {}

  onModuleInit(): void {
    if (process.env.DATA_AUTH_REVOCATION_POLL_ENABLED === 'false') return;
    const intervalMs = Number(process.env.DATA_AUTH_REVOCATION_POLL_MS ?? 5_000);
    this.timer = setInterval(() => {
      void this.orchestrator.processDue(REVOCATION_ORCHESTRATOR.pollBatchSize).catch((err) => {
        this.logger.error(
          'Revocation orchestrator poll failed',
          err instanceof Error ? err.stack : String(err),
        );
      });
    }, intervalMs);
    this.timer.unref?.();
  }

  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer);
  }
}
