import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { BookingPreparationStateRepository } from './booking-preparation-state.repository';
import { BookingPreparationObservabilityService } from './booking-preparation-observability.service';

@Injectable()
export class BookingPreparationMonitoringSchedulerService {
  private readonly logger = new Logger(BookingPreparationMonitoringSchedulerService.name);

  constructor(
    private readonly repo: BookingPreparationStateRepository,
    private readonly observability: BookingPreparationObservabilityService,
  ) {}

  @Cron('*/5 * * * *')
  async refreshFailedMetrics(): Promise<void> {
    try {
      const staleBefore = new Date(Date.now() - 30 * 60_000);
      const grouped = await this.repo.countPersistentlyFailed(staleBefore);
      for (const row of grouped) {
        this.observability.recordPersistentlyFailed(row.artifactType, row._count._all);
      }
    } catch (err) {
      this.logger.warn(
        `Failed to refresh booking preparation metrics: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }
}
