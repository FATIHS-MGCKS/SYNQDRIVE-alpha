import { Injectable, Optional } from '@nestjs/common';
import { FleetHealthObservabilityService } from '@modules/fleet-health-observability/fleet-health-observability.service';
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
    @Optional() private readonly fleetHealthObservability?: FleetHealthObservabilityService,
  ) {}

  async getFleetRow(orgId: string, vehicleId: string): Promise<FleetVehicleHealthRow> {
    const started = performance.now();
    try {
      const cached = await this.cache.get(orgId, vehicleId);
      if (cached) {
        const row = projectFleetHealthRow(cached.health, {
          cachedAt: cached.cached_at,
          fromCache: true,
        });
        this.fleetHealthObservability?.observeFleetSummary(
          'row',
          'success',
          (performance.now() - started) / 1000,
        );
        return row;
      }

      const health = await this.rentalHealth.getVehicleHealth(orgId, vehicleId);
      await this.cache.set(orgId, vehicleId, health);
      const row = projectFleetHealthRow(health, {
        cachedAt: new Date().toISOString(),
        fromCache: false,
      });
      this.fleetHealthObservability?.observeFleetSummary(
        'row',
        'success',
        (performance.now() - started) / 1000,
      );
      return row;
    } catch (err) {
      this.fleetHealthObservability?.observeFleetSummary(
        'row',
        'error',
        (performance.now() - started) / 1000,
      );
      throw err;
    }
  }

  async getFleetRowSafe(orgId: string, vehicleId: string): Promise<FleetVehicleHealthRow> {
    try {
      return await this.getFleetRow(orgId, vehicleId);
    } catch (err) {
      this.fleetHealthObservability?.recordPartialRefreshFailure('summary_batch');
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
    const started = performance.now();
    const BATCH = 5;
    const results: FleetVehicleHealthRow[] = [];

    try {
      for (let i = 0; i < vehicleIds.length; i += BATCH) {
        const slice = vehicleIds.slice(i, i + BATCH);
        const batchResults = await Promise.all(
          slice.map((vehicleId) => this.getFleetRowSafe(orgId, vehicleId)),
        );
        results.push(...batchResults);
      }

      this.fleetHealthObservability?.recordFleetRows(results);
      this.fleetHealthObservability?.observeFleetSummary(
        'batch',
        'success',
        (performance.now() - started) / 1000,
      );
      return results;
    } catch (err) {
      this.fleetHealthObservability?.observeFleetSummary(
        'batch',
        'error',
        (performance.now() - started) / 1000,
      );
      throw err;
    }
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
