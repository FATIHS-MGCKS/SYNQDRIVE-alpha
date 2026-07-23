import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { DATA_AUTHORIZATION_AUDIT_OUTBOX } from './data-authorization-audit.constants';
import { DataAuthorizationAuditOutboxProcessorService } from './data-authorization-audit-outbox.processor';

@Injectable()
export class DataAuthorizationAuditOutboxSchedulerService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(DataAuthorizationAuditOutboxSchedulerService.name);
  private timer: ReturnType<typeof setInterval> | null = null;

  constructor(private readonly processor: DataAuthorizationAuditOutboxProcessorService) {}

  onModuleInit(): void {
    if (process.env.DATA_AUTH_AUDIT_OUTBOX_POLL_ENABLED === 'false') return;
    const intervalMs = Number(process.env.DATA_AUTH_AUDIT_OUTBOX_POLL_MS ?? 5_000);
    this.timer = setInterval(() => {
      void this.processor.processDue(DATA_AUTHORIZATION_AUDIT_OUTBOX.pollBatchSize).catch((err) => {
        this.logger.error('Audit outbox poll failed', err instanceof Error ? err.stack : String(err));
      });
    }, intervalMs);
    this.timer.unref?.();
  }

  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer);
  }
}
