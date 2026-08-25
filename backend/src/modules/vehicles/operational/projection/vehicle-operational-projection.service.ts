/**
 * P0.2 application service — canonical VehicleOperationalProjection authority.
 *
 * Composes authoritative domain loaders and delegates to the pure builder.
 * No consumer surfaces are wired here.
 */
import { Injectable, Logger, NotFoundException, Optional } from '@nestjs/common';
import { VehicleStatus } from '@prisma/client';
import { PrismaService } from '@shared/database/prisma.service';
import { ConnectivityLifecycleRuntimePolicyService } from '@modules/dimo/connectivity/connectivity-lifecycle-runtime-policy.service';
import { VehicleConnectivityRuntimeProjectionService } from '@modules/dimo/device-connection-episode-resolution/vehicle-connectivity-runtime-projection.service';
import { RentalHealthSummaryService } from '@modules/rental-health/rental-health-summary.service';
import type { FleetVehicleHealthRow } from '@modules/rental-health/rental-health-summary.types';
import { VehiclesService } from '../../vehicles.service';
import { businessStateFromFleetContext } from './business-state.adapter';
import { healthEvidenceFromVehicleHealth } from './health-evidence.adapter';
import {
  buildVehicleOperationalProjection,
  buildVehicleOperationalProjectionBatch,
} from './vehicle-operational-projection.builder';
import type {
  HealthEvidenceSnapshot,
  VehicleOperationalProjection,
} from './vehicle-operational-projection.types';

const PROJECTION_VEHICLE_SELECT = {
  id: true,
  organizationId: true,
  status: true,
  licensePlate: true,
  tankCapacityLiters: true,
  latestState: {
    select: {
      odometerKm: true,
      evSoc: true,
      fuelLevelRelative: true,
      fuelLevelAbsolute: true,
      rawPayloadJson: true,
    },
  },
} as const;

export type VehicleOperationalProjectionVehicleRow = {
  id: string;
  organizationId: string;
  status: VehicleStatus;
  licensePlate: string | null;
  tankCapacityLiters: number | null;
  latestState: {
    odometerKm: number | null;
    evSoc: number | null;
    fuelLevelRelative: number | null;
    fuelLevelAbsolute: number | null;
    rawPayloadJson: unknown;
  } | null;
};

export interface GetVehicleOperationalProjectionInput {
  organizationId: string;
  vehicleId: string;
  now?: Date;
}

export interface GetVehicleOperationalProjectionsInput {
  organizationId: string;
  vehicleIds?: string[];
  now?: Date;
}

@Injectable()
export class VehicleOperationalProjectionService {
  private readonly logger = new Logger(VehicleOperationalProjectionService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly vehiclesService: VehiclesService,
    private readonly connectivityProjection: VehicleConnectivityRuntimeProjectionService,
    private readonly rentalHealthSummary: RentalHealthSummaryService,
    @Optional()
    private readonly lifecyclePolicy?: ConnectivityLifecycleRuntimePolicyService,
  ) {}

  async getVehicleProjection(
    input: GetVehicleOperationalProjectionInput,
  ): Promise<VehicleOperationalProjection> {
    const projections = await this.getVehicleProjections({
      organizationId: input.organizationId,
      vehicleIds: [input.vehicleId],
      now: input.now,
    });

    const projection = projections.get(input.vehicleId);
    if (!projection) {
      throw new NotFoundException('Vehicle not found');
    }
    return projection;
  }

  async getVehicleProjections(
    input: GetVehicleOperationalProjectionsInput,
  ): Promise<Map<string, VehicleOperationalProjection>> {
    if (input.vehicleIds && input.vehicleIds.length === 0) {
      return new Map();
    }

    const now = input.now ?? new Date();
    const generatedAt = now.toISOString();
    const requestedIds = input.vehicleIds?.length
      ? [...new Set(input.vehicleIds)]
      : undefined;

    const vehicles = await this.prisma.vehicle.findMany({
      where: {
        organizationId: input.organizationId,
        ...(requestedIds ? { id: { in: requestedIds } } : {}),
      },
      select: PROJECTION_VEHICLE_SELECT,
    });

    if (requestedIds?.length === 1 && vehicles.length === 0) {
      return new Map();
    }

    const vehicleIds = vehicles.map((v) => v.id);
    if (vehicleIds.length === 0) {
      return new Map();
    }

    const episodeEvidenceReliable = this.resolveEpisodeEvidenceReliability();

    const [businessContextMap, connectivityMap] = await Promise.all([
      this.vehiclesService.deriveFleetBusinessContextBatch(
        input.organizationId,
        vehicles as VehicleOperationalProjectionVehicleRow[],
      ),
      this.connectivityProjection.projectForVehicles(input.organizationId, vehicleIds),
    ]);

    let healthRows: FleetVehicleHealthRow[] = [];

    try {
      healthRows = await this.rentalHealthSummary.getFleetRowsBatch(
        input.organizationId,
        vehicleIds,
      );
    } catch (err) {
      this.logger.warn({
        msg: 'vehicle_operational_projection.health_load_failed',
        organizationId: input.organizationId,
        vehicleCount: vehicleIds.length,
        failedDomain: 'health',
        errorCategory: 'loader_failure',
        error: err instanceof Error ? err.message : String(err),
      });
    }

    const healthByVehicleId = new Map(healthRows.map((row) => [row.vehicle_id, row]));

    const batchInputs = vehicles.map((vehicle) => {
      const connectivity = connectivityMap.get(vehicle.id);
      if (!connectivity) {
        throw new Error(
          `Connectivity runtime missing for vehicle ${vehicle.id} in org ${input.organizationId}`,
        );
      }

      const businessContext = businessContextMap.get(vehicle.id);
      if (!businessContext) {
        throw new Error(
          `Business context missing for vehicle ${vehicle.id} in org ${input.organizationId}`,
        );
      }

      const health = this.resolveHealthEvidenceSnapshot(healthByVehicleId.get(vehicle.id));

      return {
        vehicleId: vehicle.id,
        organizationId: input.organizationId,
        generatedAt,
        businessState: businessStateFromFleetContext({
          vehicleStatus: vehicle.status,
          operationalState: businessContext,
        }),
        connectivity,
        health,
        episodeEvidenceReliable,
      };
    });

    const projections = buildVehicleOperationalProjectionBatch({
      generatedAt,
      projections: batchInputs,
    });

    return new Map(projections.map((p) => [p.vehicleId, p]));
  }

  resolveEpisodeEvidenceReliability(): boolean | null {
    if (!this.lifecyclePolicy) {
      return null;
    }
    return this.lifecyclePolicy.automaticLifecycleReconciliationEnabled;
  }

  private resolveHealthEvidenceSnapshot(
    row: FleetVehicleHealthRow | undefined,
  ): HealthEvidenceSnapshot | null | undefined {
    if (!row) {
      return undefined;
    }
    return healthEvidenceFromVehicleHealth(row);
  }
}
