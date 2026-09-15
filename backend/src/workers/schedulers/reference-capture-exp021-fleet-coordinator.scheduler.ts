import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ReferenceCaptureConfig } from '../../modules/vehicle-intelligence/reference-capture/reference-capture.config';
import { ReferenceCaptureExp021FleetCoordinatorService } from '../../modules/vehicle-intelligence/reference-capture/exp021-fleet/reference-capture-exp021-fleet-coordinator.service';
import { SchedulerLeaderGuardService } from '@shared/scheduler-leader/scheduler-leader-guard.service';

@Injectable()
export class ReferenceCaptureExp021FleetCoordinatorScheduler implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(ReferenceCaptureExp021FleetCoordinatorScheduler.name);
  private timer: ReturnType<typeof setInterval> | null = null;

  constructor(
    private readonly config: ReferenceCaptureConfig,
    private readonly coordinator: ReferenceCaptureExp021FleetCoordinatorService,
    private readonly leaderGuard: SchedulerLeaderGuardService,
  ) {}

  onModuleInit(): void {
    if (!this.config.isFleetCoordinatorEnabled()) return;

    const intervalMs = this.config.getFleetCoordinatorIntervalMs();
    this.timer = setInterval(() => {
      void this.evaluateFleetDryRun();
    }, intervalMs);
    this.logger.log(
      `EXP-021 fleet coordinator scheduler active (dryRun=${this.config.isFleetDryRun()}, intervalMs=${intervalMs})`,
    );
  }

  onModuleDestroy(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  async evaluateFleetDryRun(): Promise<void> {
    if (!this.config.isFleetCoordinatorEnabled()) return;
    if (!this.leaderGuard.shouldRun('reference_capture_exp021_fleet_coordinator')) return;
    await this.coordinator.evaluateFleetDryRunTick();
  }
}
