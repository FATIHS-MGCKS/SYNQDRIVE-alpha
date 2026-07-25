import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';

/**
 * Stub retention job for fleet warning artefacts (VW-F-019 / WP-16).
 * Full implementation will prune notifications, complaints, and inactive insights
 * per org policy — not enabled until GDPR retention matrix is signed off.
 */
@Injectable()
export class VehicleWarningRetentionScheduler {
  private readonly logger = new Logger(VehicleWarningRetentionScheduler.name);

  @Cron('0 4 * * *')
  async scheduledRun(): Promise<void> {
    if (process.env.VEHICLE_WARNING_RETENTION_ENABLED !== 'true') {
      this.logger.debug(
        'Vehicle warning retention stub skipped (VEHICLE_WARNING_RETENTION_ENABLED!=true)',
      );
      return;
    }
    await this.runOnce('cron');
  }

  async runOnce(trigger: 'cron' | 'manual' = 'manual'): Promise<{ status: 'stub' }> {
    this.logger.warn(
      `Vehicle warning retention is a stub — no rows deleted (trigger=${trigger}). ` +
        'Implement per-table policies before enabling VEHICLE_WARNING_RETENTION_ENABLED.',
    );
    return { status: 'stub' };
  }
}
