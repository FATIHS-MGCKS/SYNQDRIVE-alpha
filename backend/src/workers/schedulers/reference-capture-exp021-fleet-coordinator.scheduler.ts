import { Injectable, Logger, OnModuleInit, Optional } from '@nestjs/common';
import { Interval } from '@nestjs/schedule';
import { ReferenceCaptureConfig } from '../../modules/vehicle-intelligence/reference-capture/reference-capture.config';
import { ReferenceCaptureExp021FleetCoordinatorService } from '../../modules/vehicle-intelligence/reference-capture/exp021-fleet/reference-capture-exp021-fleet-coordinator.service';
import { SchedulerLeaderGuardService } from '@shared/scheduler-leader/scheduler-leader-guard.service';

@Injectable()
export class ReferenceCaptureExp021FleetCoordinatorScheduler implements OnModuleInit {
  private readonly logger = new Logger(ReferenceCaptureExp021FleetCoordinatorScheduler.name);

  constructor(
    private readonly config: ReferenceCaptureConfig,
    private readonly coordinator: ReferenceCaptureExp021FleetCoordinatorService,
    @Optional() private readonly leaderGuard?: SchedulerLeaderGuardService,
  ) {}

  onModuleInit(): void {
    if (this.config.isFleetCoordinatorEnabled()) {
      this.logger.log(
        `EXP-021 fleet coordinator scheduler registered (dryRun=${this.config.isFleetDryRun()})`,
      );
    }
  }

  @Interval(45_000)
  async evaluateFleetDryRun(): Promise<void> {
    if (!this.config.isFleetCoordinatorEnabled()) return;
    if (this.leaderGuard && !this.leaderGuard.shouldRun('reference_capture_exp021_fleet_coordinator')) {
      return;
    }
    await this.coordinator.evaluateFleetDryRunTick();
  }
}
