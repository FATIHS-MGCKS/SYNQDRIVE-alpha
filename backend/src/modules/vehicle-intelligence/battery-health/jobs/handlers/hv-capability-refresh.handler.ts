import { Injectable, Logger } from '@nestjs/common';
import { BatteryCapabilityPreflightService } from '../../capability-preflight/battery-capability-preflight.service';
import type { BatteryV2JobHandler } from '../battery-v2-job.handler';
import type { HvCapabilityRefreshPayload } from '../battery-v2-job.types';

@Injectable()
export class HvCapabilityRefreshHandler implements BatteryV2JobHandler<'HV_CAPABILITY_REFRESH'> {
  readonly jobType = 'HV_CAPABILITY_REFRESH' as const;
  private readonly logger = new Logger(HvCapabilityRefreshHandler.name);

  constructor(
    private readonly capabilityPreflight: BatteryCapabilityPreflightService,
  ) {}

  async handle(payload: HvCapabilityRefreshPayload): Promise<void> {
    const result = await this.capabilityPreflight.runForVehicle(
      payload.organizationId,
      payload.vehicleId,
    );

    if (!result) {
      this.logger.debug(
        `Skipping ${this.jobType}: no DIMO token org=${payload.organizationId} vehicle=${payload.vehicleId}`,
      );
      return;
    }

    const availableCount = result.signals.filter(
      (signal) =>
        signal.preflightStatus === 'AVAILABLE_WITH_DATA' ||
        signal.preflightStatus === 'STALE',
    ).length;

    this.logger.debug(
      `${this.jobType} completed org=${payload.organizationId} vehicle=${payload.vehicleId} signals=${result.signals.length} withData=${availableCount} queryError=${result.queryError ?? 'none'}`,
    );
  }
}
