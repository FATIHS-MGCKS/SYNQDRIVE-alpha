import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ProcessingActivityRegisterExportService } from './processing-activity-register-export.service';

const DEFAULT_PURGE_MS = 60 * 60 * 1000;

@Injectable()
export class ProcessingActivityRegisterExportPurgeSchedulerService
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(ProcessingActivityRegisterExportPurgeSchedulerService.name);
  private timer: ReturnType<typeof setInterval> | null = null;

  constructor(private readonly exports: ProcessingActivityRegisterExportService) {}

  onModuleInit(): void {
    if (process.env.DATA_AUTH_REGISTER_EXPORT_PURGE_ENABLED === 'false') return;
    const intervalMs = Number(process.env.DATA_AUTH_REGISTER_EXPORT_PURGE_MS ?? DEFAULT_PURGE_MS);
    this.timer = setInterval(() => {
      void this.exports.purgeExpiredExports().catch((err) => {
        this.logger.error(
          'Register export purge failed',
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
