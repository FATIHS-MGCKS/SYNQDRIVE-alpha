import { Injectable } from '@nestjs/common';
import { RentalHealthService } from './rental-health.service';
import type { VehicleHealth } from './rental-health.types';
import { RentalHealthSummaryCacheService } from './rental-health-summary-cache.service';
import { projectFleetHealthRow } from './rental-health-summary.projection';
import type { FleetVehicleHealthRow } from './rental-health-summary.types';

@Injectable()
export class RentalHealthSummaryService {
  constructor(
    private readonly rentalHealth: RentalHealthService,
    private readonly cache: RentalHealthSummaryCacheService,
  ) {}

  async getFleetRow(orgId: string, vehicleId: string): Promise<FleetVehicleHealthRow> {
    const cached = await this.cache.get(orgId, vehicleId);
    if (cached) {
      return projectFleetHealthRow(cached.health, {
        cachedAt: cached.cached_at,
        fromCache: true,
      });
    }

    const health = await this.rentalHealth.getVehicleHealth(orgId, vehicleId);
    await this.cache.set(orgId, vehicleId, health);
    return projectFleetHealthRow(health, {
      cachedAt: new Date().toISOString(),
      fromCache: false,
    });
  }

  async getFleetRowSafe(orgId: string, vehicleId: string): Promise<FleetVehicleHealthRow> {
    try {
      return await this.getFleetRow(orgId, vehicleId);
    } catch (err) {
      return projectFleetHealthRow(this.degradedVehicleHealth(orgId, vehicleId, err), {
        cachedAt: null,
        fromCache: false,
      });
    }
  }

  async getFleetRowsBatch(
    orgId: string,
    vehicleIds: string[],
  ): Promise<FleetVehicleHealthRow[]> {
    const BATCH = 5;
    const results: FleetVehicleHealthRow[] = [];

    for (let i = 0; i < vehicleIds.length; i += BATCH) {
      const slice = vehicleIds.slice(i, i + BATCH);
      const batchResults = await Promise.all(
        slice.map((vehicleId) => this.getFleetRowSafe(orgId, vehicleId)),
      );
      results.push(...batchResults);
    }

    return results;
  }

  private degradedVehicleHealth(
    orgId: string,
    vehicleId: string,
    err: unknown,
  ): VehicleHealth & { _error: string } {
    return {
      vehicle_id: vehicleId,
      organization_id: orgId,
      overall_state: 'unknown',
      rental_blocked: false,
      blocking_reasons: [],
      modules: {
        battery: stubUnknown(),
        tires: stubUnknown(),
        brakes: stubUnknown(),
        error_codes: stubUnknown(),
        service_compliance: stubUnknown(),
        complaints: stubUnknown(),
        vehicle_alerts: stubUnknown(),
      },
      generated_at: new Date().toISOString(),
      _error: err instanceof Error ? err.message : String(err),
    };
  }
}

function stubUnknown() {
  return {
    state: 'unknown' as const,
    reason: 'Daten nicht verfügbar',
    last_updated_at: null,
    data_stale: true,
  };
}
