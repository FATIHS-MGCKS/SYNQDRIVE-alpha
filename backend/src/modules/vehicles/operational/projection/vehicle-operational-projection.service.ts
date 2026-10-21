/**
 * P0.2 application service — canonical VehicleOperationalProjection authority.
 *
 * Composes authoritative domain loaders and delegates to the pure builder.
 * No consumer surfaces are wired here.
 */
import { Injectable, Inject, Logger, NotFoundException, Optional, forwardRef } from '@nestjs/common';
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
import type { VehicleConnectivityRuntimeState } from '../../connectivity/domain/connectivity-domain.types';

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

export interface ProjectWithConnectivityOverrideInput
  extends GetVehicleOperationalProjectionInput {
  connectivityOverride: VehicleConnectivityRuntimeState;
}

@Injectable()
export class VehicleOperationalProjectionService {
  private readonly logger = new Logger(VehicleOperationalProjectionService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Inject(forwardRef(() => VehiclesService))
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

  /**
   * Shadow/read-only path: canonical business + health + episode evidence with an
   * explicit connectivity override (e.g. simulated provider-link remediation).
   */
  async projectWithConnectivityOverride(
    input: ProjectWithConnectivityOverrideInput,
  ): Promise<VehicleOperationalProjection> {
    const now = input.now ?? new Date();
    const generatedAt = now.toISOString();

    const vehicle = await this.prisma.vehicle.findFirst({
      where: {
        id: input.vehicleId,
        organizationId: input.organizationId,
      },
      select: PROJECTION_VEHICLE_SELECT,
    });
    if (!vehicle) {
      throw new NotFoundException('Vehicle not found');
    }

    const episodeEvidenceReliable = this.resolveEpisodeEvidenceReliability();

    let healthRows: FleetVehicleHealthRow[] = [];
    try {
      healthRows = await this.rentalHealthSummary.getFleetRowsBatch(
        input.organizationId,
        [input.vehicleId],
      );
    } catch (err) {
      this.logger.warn({
        msg: 'vehicle_operational_projection.shadow_health_load_failed',
        organizationId: input.organizationId,
        vehicleId: input.vehicleId,
        error: err instanceof Error ? err.message : String(err),
      });
    }

    const businessContextMap = await this.vehiclesService.deriveFleetBusinessContextBatch(
      input.organizationId,
      [vehicle as VehicleOperationalProjectionVehicleRow],
    );
    const businessContext = businessContextMap.get(vehicle.id);
    if (!businessContext) {
      throw new Error(
        `Business context missing for vehicle ${vehicle.id} in org ${input.organizationId}`,
      );
    }

    const health = this.resolveHealthEvidenceSnapshot(healthRows[0]);

    return buildVehicleOperationalProjection({
      vehicleId: vehicle.id,
      organizationId: input.organizationId,
      generatedAt,
      businessState: businessStateFromFleetContext({
        vehicleStatus: vehicle.status,
        operationalState: businessContext,
      }),
      connectivity: input.connectivityOverride,
      health,
      episodeEvidenceReliable,
    });
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
