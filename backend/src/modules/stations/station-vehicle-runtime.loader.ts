import { Injectable } from '@nestjs/common';
import { RentalHealthService } from '@modules/rental-health/rental-health.service';
import { VehiclesService } from '@modules/vehicles/vehicles.service';
import type { VehicleHealth } from '@modules/rental-health/rental-health.types';
import type { VehicleRuntimeProjectionInput } from '@shared/vehicle-runtime-state/vehicle-runtime-state.contract';
import type { StationSummaryVehicleRow } from '@shared/stations/station-summary-read-model.assembly';

export type StationRuntimeVehicleLoadRow = StationSummaryVehicleRow & {
  cleaningStatus: import('@prisma/client').CleaningStatus;
  latestState: {
    lastSeenAt: Date | null;
    odometerKm: number | null;
    speedKmh: number | null;
    isIgnitionOn: boolean | null;
  } | null;
};

const HEALTH_BATCH_SIZE = 10;

@Injectable()
export class StationVehicleRuntimeLoader {
  constructor(
    private readonly vehiclesService: VehiclesService,
    private readonly rentalHealthService: RentalHealthService,
  ) {}

  async loadRuntimeSnapshots(
    organizationId: string,
    vehicles: StationRuntimeVehicleLoadRow[],
  ): Promise<VehicleRuntimeProjectionInput[]> {
    if (vehicles.length === 0) return [];

    const healthByVehicleId = await this.loadHealthMap(organizationId, vehicles.map((v) => v.id));

    return this.vehiclesService.buildVehicleRuntimeProjectionInputs(
      organizationId,
      vehicles.map((vehicle) => ({
        id: vehicle.id,
        status: vehicle.status,
        cleaningStatus: vehicle.cleaningStatus,
        latestState: vehicle.latestState,
      })),
      healthByVehicleId,
    );
  }

  private async loadHealthMap(
    organizationId: string,
    vehicleIds: string[],
  ): Promise<Map<string, VehicleHealth | null>> {
    const healthByVehicleId = new Map<string, VehicleHealth | null>();
    for (let index = 0; index < vehicleIds.length; index += HEALTH_BATCH_SIZE) {
      const batch = vehicleIds.slice(index, index + HEALTH_BATCH_SIZE);
      const results = await Promise.all(
        batch.map(async (vehicleId) => {
          try {
            return await this.rentalHealthService.getVehicleHealth(organizationId, vehicleId);
          } catch {
            return null;
          }
        }),
      );
      batch.forEach((vehicleId, batchIndex) => {
        healthByVehicleId.set(vehicleId, results[batchIndex]);
      });
    }
    return healthByVehicleId;
  }
}
