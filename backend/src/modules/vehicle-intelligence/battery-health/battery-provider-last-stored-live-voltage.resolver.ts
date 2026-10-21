import { Injectable } from '@nestjs/common';
import { BatteryMeasurementType } from '@prisma/client';
import { PrismaService } from '@shared/database/prisma.service';
import type { BatteryProviderStoredObservationContext } from './battery-provider-observation.policy';

/**
 * Canonical last-stored LIVE_VOLTAGE context for provider observation dedup / STALE_REPLAY.
 * Source of truth: `battery_measurements` (not legacy `battery_health_snapshots`).
 */
@Injectable()
export class BatteryProviderLastStoredLiveVoltageResolver {
  constructor(private readonly prisma: PrismaService) {}

  async resolveLastStoredLiveVoltageObservation(
    organizationId: string,
    vehicleId: string,
  ): Promise<BatteryProviderStoredObservationContext | null> {
    const lastMeasurement = await this.prisma.batteryMeasurement.findFirst({
      where: {
        organizationId,
        vehicleId,
        type: BatteryMeasurementType.LIVE_VOLTAGE,
      },
      orderBy: { observedAt: 'desc' },
      select: {
        observedAt: true,
        numericValue: true,
        receivedAt: true,
        idempotencyKey: true,
      },
    });

    if (lastMeasurement?.numericValue == null) {
      return null;
    }

    return {
      observedAt: lastMeasurement.observedAt,
      normalizedValue: lastMeasurement.numericValue,
      receivedAt: lastMeasurement.receivedAt,
      idempotencyKey: lastMeasurement.idempotencyKey,
    };
  }
}
