import { Injectable } from '@nestjs/common';
import type { VehicleBatteryCapability } from '@prisma/client';
import { RECHARGE_SEGMENTS_SIGNAL_KEY } from '../capability-preflight/battery-capability-signals.registry';
import { BatteryCapabilityPreflightRepository } from '../capability-preflight/battery-capability-preflight.repository';
import {
  resolveHvMethodProfile,
  type HvMethodProfile,
} from './hv-method-profile.resolver';
import type { HvMethodProfileCapabilityInput } from './hv-method-profile.types';

@Injectable()
export class HvMethodProfileService {
  constructor(
    private readonly capabilityRepository: BatteryCapabilityPreflightRepository,
  ) {}

  mapCapabilityRow(row: VehicleBatteryCapability): HvMethodProfileCapabilityInput {
    return {
      signalKey: row.signalKey,
      status: row.status,
      checkedAt: row.checkedAt,
      lastSeenAt: row.lastSeenAt,
      sourceTimestamp: row.sourceTimestamp,
      lastValue: row.lastValue,
    };
  }

  filterHvCapabilities(
    rows: VehicleBatteryCapability[],
  ): HvMethodProfileCapabilityInput[] {
    return rows
      .filter(
        (row) =>
          row.signalKey.startsWith('hv.') ||
          row.signalKey === RECHARGE_SEGMENTS_SIGNAL_KEY,
      )
      .map((row) => this.mapCapabilityRow(row));
  }

  async resolveForVehicle(input: {
    organizationId: string;
    vehicleId: string;
    now?: Date;
  }): Promise<HvMethodProfile> {
    const rows = await this.capabilityRepository.listForVehicle(
      input.organizationId,
      input.vehicleId,
    );

    return resolveHvMethodProfile({
      vehicleId: input.vehicleId,
      capabilities: this.filterHvCapabilities(rows),
      now: input.now,
    });
  }
}
