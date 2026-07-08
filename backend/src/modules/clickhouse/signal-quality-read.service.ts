import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '@shared/database/prisma.service';
import { ClickHouseHfService } from './clickhouse-hf.service';
import type { TripSignalQualityResult } from './clickhouse-hf.types';
import {
  assessTripSignalQuality,
  signalAvailabilityFromWindows,
} from './signal-quality-assess';
import { deriveVehicleCapabilityProfile } from '@modules/vehicle-intelligence/vehicle-capabilities';

/**
 * Read-only trip signal quality diagnostics from ClickHouse HF windows/points.
 * Never writes canonical trip scores — evidence for Data Analyse / monitoring only.
 */
@Injectable()
export class SignalQualityReadService {
  private readonly logger = new Logger(SignalQualityReadService.name);

  constructor(
    private readonly clickHouseHf: ClickHouseHfService,
    private readonly prisma: PrismaService,
  ) {}

  async getTripSignalQuality(
    orgId: string,
    vehicleId: string,
    tripId: string,
  ): Promise<TripSignalQualityResult> {
    const trip = await this.prisma.vehicleTrip.findFirst({
      where: {
        id: tripId,
        vehicleId,
        vehicle: { organizationId: orgId },
      },
      select: {
        id: true,
        vehicle: {
          select: { hardwareType: true, fuelType: true },
        },
      },
    });

    if (!trip) {
      return {
        available: false,
        degraded: false,
        overallQuality: 'unavailable',
        hfAvailability: 'missing',
        signalCoverage: [],
        missingKeySignals: [],
        detectorFeasibilityHints: [],
        windowCount: 0,
        hfPointCount: 0,
        reasons: ['Trip not found for org/vehicle.'],
        internalDebug: true,
        readOnly: true,
      };
    }

    const [windowsResult, hfPointCount] = await Promise.all([
      this.clickHouseHf.getTripHfWindows(vehicleId, tripId),
      this.clickHouseHf.countTripHfPoints(vehicleId, tripId),
    ]);

    const degraded = !windowsResult.available || Boolean(windowsResult.degradedReason);
    const capabilityProfile = deriveVehicleCapabilityProfile({
      hardwareType: trip.vehicle.hardwareType,
      fuelType: trip.vehicle.fuelType,
      hasHfWaypoints: hfPointCount > 0,
    });

    const signalAvailability =
      windowsResult.windows.length > 0
        ? signalAvailabilityFromWindows(windowsResult.windows)
        : {
            rpmAvailable: false,
            throttleAvailable: false,
            coolantAvailable: false,
            loadAvailable: false,
            tractionBatteryPowerAvailable: false,
          };

    try {
      return assessTripSignalQuality({
        windows: windowsResult.windows,
        hfPointCount,
        capabilityProfile,
        signalAvailability,
        degraded,
        degradedReason: windowsResult.degradedReason,
      });
    } catch (err: unknown) {
      this.logger.warn(
        `getTripSignalQuality assess failed for trip ${tripId}: ${(err as Error).message}`,
      );
      return {
        available: false,
        degraded: true,
        degradedReason: (err as Error).message,
        overallQuality: 'unavailable',
        hfAvailability: 'unknown',
        signalCoverage: [],
        missingKeySignals: [],
        detectorFeasibilityHints: [],
        windowCount: 0,
        hfPointCount,
        reasons: ['Signal quality assessment failed — degraded response.'],
        internalDebug: true,
        readOnly: true,
      };
    }
  }
}
