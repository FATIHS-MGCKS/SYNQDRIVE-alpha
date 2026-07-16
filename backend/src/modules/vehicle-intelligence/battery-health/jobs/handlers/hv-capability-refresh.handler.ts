import { Injectable, Logger } from '@nestjs/common';
import { DriveProfileResolverService } from '../../../drive-profile/drive-profile-resolver.service';
import { isHvMeasurementSupported } from '../../../drive-profile/drive-profile-resolver';
import type { BatteryV2JobHandler } from '../battery-v2-job.handler';
import type { HvCapabilityRefreshPayload } from '../battery-v2-job.types';

@Injectable()
export class HvCapabilityRefreshHandler implements BatteryV2JobHandler<'HV_CAPABILITY_REFRESH'> {
  readonly jobType = 'HV_CAPABILITY_REFRESH' as const;
  private readonly logger = new Logger(HvCapabilityRefreshHandler.name);

  constructor(
    private readonly driveProfileResolver: DriveProfileResolverService,
  ) {}

  async handle(payload: HvCapabilityRefreshPayload): Promise<void> {
    const resolved = await this.driveProfileResolver.resolveForVehicle(
      payload.vehicleId,
    );
    if (!isHvMeasurementSupported(resolved.profile)) {
      this.logger.debug(
        `Skipping ${this.jobType}: drive profile ${resolved.profile} does not support HV measurement (source=${resolved.source})`,
      );
      return;
    }

    this.logger.debug(
      `Battery V2 stub: ${this.jobType} org=${payload.organizationId} vehicle=${payload.vehicleId} profile=${resolved.profile}`,
    );
  }
}
