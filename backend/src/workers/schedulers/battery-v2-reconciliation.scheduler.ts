import { Injectable, Logger } from '@nestjs/common';
import { Interval } from '@nestjs/schedule';
import {
  getBatteryV2ReconciliationIntervalMs,
  isBatteryV2ReconciliationEnabled,
} from '@config/battery-health-v2.config';
import { canEnqueueQueue } from '@shared/queue/queue-producer.util';
import { BatteryV2ReconciliationService } from '@modules/vehicle-intelligence/battery-health/jobs/battery-v2-reconciliation.service';
import { BatteryV2JobObservabilityService } from '@modules/vehicle-intelligence/battery-health/jobs/battery-v2-job-observability.service';
import { BatteryV2JobDeadLetterService } from '@modules/vehicle-intelligence/battery-health/jobs/battery-v2-job-dead-letter.service';

@Injectable()
export class BatteryV2ReconciliationScheduler {
  private readonly logger = new Logger(BatteryV2ReconciliationScheduler.name);
  private reconcileInProgress = false;

  constructor(
    private readonly reconciliation: BatteryV2ReconciliationService,
    private readonly observability: BatteryV2JobObservabilityService,
    private readonly deadLetters: BatteryV2JobDeadLetterService,
  ) {}

  @Interval(getBatteryV2ReconciliationIntervalMs())
  async reconcileBatteryV2Pipeline(): Promise<void> {
    if (!isBatteryV2ReconciliationEnabled()) return;
    if (!canEnqueueQueue(this.logger, 'battery-v2-reconciliation')) return;
    if (this.reconcileInProgress) return;

    this.reconcileInProgress = true;
    try {
      const backlog = await this.deadLetters.countBacklog();
      this.observability.setDeadLetterBacklog(backlog);
      await this.reconciliation.reconcileAll();
    } catch (err) {
      this.logger.warn(
        `Battery V2 reconciliation tick failed: ${err instanceof Error ? err.message : err}`,
      );
    } finally {
      this.reconcileInProgress = false;
    }
  }
}
