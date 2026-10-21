import { NotFoundException } from '@nestjs/common';
import { VehicleStatus } from '@prisma/client';
import {
  AttentionState,
  ConnectivityReasonCode,
  ConnectivityRecommendedAction,
  OverallConnectivityState,
  PhysicalDeviceState,
  type VehicleConnectivityRuntimeState,
} from '../../connectivity/domain/connectivity-domain.types';
import type { FleetVehicleOperationalStateDto } from '../fleet-operational-state.util';
import { VehicleOperationalProjectionService } from './vehicle-operational-projection.service';
import {
  BusinessOperationalState,
  HealthEvaluabilityState,
  OperationalAvailabilityState,
  OperationalProjectionReasonCode,
} from './vehicle-operational-projection.types';
import {
  baseConnectivity,
  fixtureHmueC215,
  fixtureWobL7503,
  fixtureWobL9755,
  FIXTURE_GENERATED_AT,
  FIXTURE_ORG_ID,
} from './vehicle-operational-projection.fixtures';

const NOW = new Date(FIXTURE_GENERATED_AT);

function vehicleRow(id: string, status: VehicleStatus = VehicleStatus.AVAILABLE) {
  return {
    id,
    organizationId: FIXTURE_ORG_ID,
    status,
    licensePlate: `PLATE-${id}`,
    tankCapacityLiters: 50,
    latestState: {
      odometerKm: 1000,
      evSoc: null,
      fuelLevelRelative: 50,
      fuelLevelAbsolute: null,
      rawPayloadJson: {},
    },
  };
}

function operationalDto(
  status: FleetVehicleOperationalStateDto['status'],
): FleetVehicleOperationalStateDto {
  return {
    status,
    reason: null,
    source: 'test',
    derivedAt: FIXTURE_GENERATED_AT,
    dataQualityState: 'RELIABLE',
    dataQualityReasons: [],
    isReliable: true,
  };
}

function healthRow(
  vehicleId: string,
  overrides: Partial<{
    overall_state: string;
    availability: string;
    rental_blocked: boolean;
    generated_at: string | null;
    data_stale: boolean;
  }> = {},
) {
  return {
    vehicle_id: vehicleId,
    organization_id: FIXTURE_ORG_ID,
    overall_state: overrides.overall_state ?? 'good',
    availability: overrides.availability ?? 'ready',
    rental_blocked: overrides.rental_blocked ?? false,
    blocking_reasons: [],
    modules: {},
    generated_at:
      overrides.generated_at === undefined ? FIXTURE_GENERATED_AT : overrides.generated_at,
    ...(overrides.data_stale
      ? {
          modules: {
            battery: { state: 'good', data_stale: true, last_updated_at: '2026-07-01T00:00:00.000Z' },
          },
        }
      : {}),
  };
}

describe('VehicleOperationalProjectionService', () => {
  const prisma = { vehicle: { findMany: jest.fn() } };
  const vehiclesService = { deriveFleetBusinessContextBatch: jest.fn() };
  const connectivityProjection = { projectForVehicles: jest.fn() };
  const rentalHealthSummary = { getFleetRowsBatch: jest.fn() };
  const lifecyclePolicy = { automaticLifecycleReconciliationEnabled: true };

  let svc: VehicleOperationalProjectionService;

  beforeEach(() => {
    jest.clearAllMocks();
    svc = new VehicleOperationalProjectionService(
      prisma as any,
      vehiclesService as any,
      connectivityProjection as any,
      rentalHealthSummary as any,
      lifecyclePolicy as any,
    );
  });

  function stubBatch(input: {
    vehicles: ReturnType<typeof vehicleRow>[];
    business?: Map<string, FleetVehicleOperationalStateDto>;
    connectivity?: Map<string, VehicleConnectivityRuntimeState>;
    health?: ReturnType<typeof healthRow>[];
  }) {
    prisma.vehicle.findMany.mockResolvedValue(input.vehicles);
    vehiclesService.deriveFleetBusinessContextBatch.mockResolvedValue(
      input.business ??
        new Map(
          input.vehicles.map((v) => [v.id, operationalDto('AVAILABLE')]),
        ),
    );
    connectivityProjection.projectForVehicles.mockResolvedValue(
      input.connectivity ??
        new Map(
          input.vehicles.map((v) => [
            v.id,
            baseConnectivity({ vehicleId: v.id }),
          ]),
        ),
    );
    rentalHealthSummary.getFleetRowsBatch.mockResolvedValue(
      input.health ?? input.vehicles.map((v) => healthRow(v.id)),
    );
  }

  describe('P0.1 reuse regression', () => {
    it('delegates connectivity to VehicleConnectivityRuntimeProjectionService without re-deriving', async () => {
      const v = vehicleRow('v-p01');
      const connectivity = baseConnectivity({ vehicleId: 'v-p01', telemetryState: 'live' });
      stubBatch({ vehicles: [v], connectivity: new Map([['v-p01', connectivity]]) });

      const result = await svc.getVehicleProjections({
        organizationId: FIXTURE_ORG_ID,
        vehicleIds: ['v-p01'],
        now: NOW,
      });

      expect(connectivityProjection.projectForVehicles).toHaveBeenCalledTimes(1);
      expect(connectivityProjection.projectForVehicles).toHaveBeenCalledWith(
        FIXTURE_ORG_ID,
        ['v-p01'],
      );
      expect(result.get('v-p01')?.connectivity).toBe(connectivity);
    });
  });

  describe('tenant isolation', () => {
    it('scopes prisma query to organizationId', async () => {
      prisma.vehicle.findMany.mockResolvedValue([]);
      await svc.getVehicleProjections({
        organizationId: FIXTURE_ORG_ID,
        vehicleIds: ['foreign-v'],
      });
      expect(prisma.vehicle.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            organizationId: FIXTURE_ORG_ID,
            id: { in: ['foreign-v'] },
          }),
        }),
      );
    });

    it('does not return projections for vehicles outside the org scope', async () => {
      prisma.vehicle.findMany.mockResolvedValue([]);
      const result = await svc.getVehicleProjections({
        organizationId: FIXTURE_ORG_ID,
        vehicleIds: ['org-b-vehicle'],
      });
      expect(result.size).toBe(0);
    });
  });

  describe('missing vehicle behavior', () => {
    it('throws NotFoundException for single missing vehicle', async () => {
      prisma.vehicle.findMany.mockResolvedValue([]);
      await expect(
        svc.getVehicleProjection({
          organizationId: FIXTURE_ORG_ID,
          vehicleId: 'missing',
          now: NOW,
        }),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('returns empty map for empty vehicle list', async () => {
      const result = await svc.getVehicleProjections({
        organizationId: FIXTURE_ORG_ID,
        vehicleIds: [],
        now: NOW,
      });
      expect(result.size).toBe(0);
      expect(prisma.vehicle.findMany).not.toHaveBeenCalled();
    });

    it('deduplicates vehicle IDs in batch requests', async () => {
      stubBatch({ vehicles: [vehicleRow('v-dup')] });
      await svc.getVehicleProjections({
        organizationId: FIXTURE_ORG_ID,
        vehicleIds: ['v-dup', 'v-dup'],
        now: NOW,
      });
      expect(prisma.vehicle.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ id: { in: ['v-dup'] } }),
        }),
      );
    });
  });

  describe('common generatedAt', () => {
    it('uses one shared generatedAt for all vehicles in a batch', async () => {
      stubBatch({ vehicles: [vehicleRow('v1'), vehicleRow('v2')] });
      const result = await svc.getVehicleProjections({
        organizationId: FIXTURE_ORG_ID,
        vehicleIds: ['v1', 'v2'],
        now: NOW,
      });
      const p1 = result.get('v1');
      const p2 = result.get('v2');
      expect(p1?.generatedAt).toBe(FIXTURE_GENERATED_AT);
      expect(p2?.generatedAt).toBe(FIXTURE_GENERATED_AT);
      expect(p1?.generatedAt).toBe(p2?.generatedAt);
    });
  });

  describe('batch query budget', () => {
    it.each([10, 100])(
      'uses bounded loader calls for %i vehicles (no per-vehicle domain queries)',
      async (count) => {
        const vehicles = Array.from({ length: count }, (_, i) => vehicleRow(`v-${i}`));
        stubBatch({ vehicles });

        await svc.getVehicleProjections({
          organizationId: FIXTURE_ORG_ID,
          vehicleIds: vehicles.map((v) => v.id),
          now: NOW,
        });

        expect(prisma.vehicle.findMany).toHaveBeenCalledTimes(1);
        expect(vehiclesService.deriveFleetBusinessContextBatch).toHaveBeenCalledTimes(1);
        expect(connectivityProjection.projectForVehicles).toHaveBeenCalledTimes(1);
        expect(rentalHealthSummary.getFleetRowsBatch).toHaveBeenCalledTimes(1);
      },
    );
  });

  describe('partial domain failure', () => {
    it('degrades health to UNKNOWN when health batch loader fails', async () => {
      stubBatch({ vehicles: [vehicleRow('v-health-fail')] });
      rentalHealthSummary.getFleetRowsBatch.mockRejectedValue(new Error('health down'));

      const result = await svc.getVehicleProjections({
        organizationId: FIXTURE_ORG_ID,
        vehicleIds: ['v-health-fail'],
        now: NOW,
      });

      expect(result.get('v-health-fail')?.healthEvaluability).toBe(
        HealthEvaluabilityState.UNKNOWN,
      );
      expect(result.get('v-health-fail')?.operationalAvailability).toBe(
        OperationalAvailabilityState.AVAILABLE,
      );
    });
  });

  describe('production reference fixtures (service-level)', () => {
    it('HMÜ C 215 — standby connectivity, business AVAILABLE, health UNKNOWN', async () => {
      const f = fixtureHmueC215();
      stubBatch({
        vehicles: [vehicleRow(f.vehicleId)],
        connectivity: new Map([[f.vehicleId, f.connectivity]]),
        health: [],
      });

      const projection = (
        await svc.getVehicleProjections({
          organizationId: FIXTURE_ORG_ID,
          vehicleIds: [f.vehicleId],
          now: NOW,
        })
      ).get(f.vehicleId)!;

      expect(projection.businessState).toBe(BusinessOperationalState.AVAILABLE);
      expect(projection.operationalAvailability).toBe(OperationalAvailabilityState.AVAILABLE);
      expect(projection.healthEvaluability).toBe(HealthEvaluabilityState.UNKNOWN);
      expect(projection.connectivity.overallState).toBe(OverallConnectivityState.STANDBY);
    });

    it('WOB L 7503 — NEEDS_VERIFICATION + NOT_EVALUABLE health', async () => {
      const f = fixtureWobL7503();
      stubBatch({
        vehicles: [vehicleRow(f.vehicleId)],
        connectivity: new Map([[f.vehicleId, f.connectivity]]),
        health: [healthRow(f.vehicleId, { availability: 'unavailable', data_stale: true, generated_at: null })],
      });

      const projection = (
        await svc.getVehicleProjections({
          organizationId: FIXTURE_ORG_ID,
          vehicleIds: [f.vehicleId],
          now: NOW,
        })
      ).get(f.vehicleId)!;

      expect(projection.businessState).toBe(BusinessOperationalState.AVAILABLE);
      expect(projection.operationalAvailability).toBe(
        OperationalAvailabilityState.NEEDS_VERIFICATION,
      );
      expect(projection.healthEvaluability).toBe(HealthEvaluabilityState.NOT_EVALUABLE);
      expect(projection.operatorSummary.recommendedAction).toBe(
        ConnectivityRecommendedAction.CHECK_DEVICE,
      );
    });

    it('WOB L 9755 — does not resurrect UNPLUGGED; NEEDS_VERIFICATION', async () => {
      const f = fixtureWobL9755();
      stubBatch({
        vehicles: [vehicleRow(f.vehicleId)],
        connectivity: new Map([[f.vehicleId, f.connectivity]]),
        health: [healthRow(f.vehicleId, { availability: 'unavailable', data_stale: true, generated_at: null })],
      });

      const projection = (
        await svc.getVehicleProjections({
          organizationId: FIXTURE_ORG_ID,
          vehicleIds: [f.vehicleId],
          now: NOW,
        })
      ).get(f.vehicleId)!;

      expect(projection.connectivity.physicalDeviceState).not.toBe(
        PhysicalDeviceState.UNPLUGGED_CONFIRMED,
      );
      expect(projection.operationalAvailability).toBe(
        OperationalAvailabilityState.NEEDS_VERIFICATION,
      );
    });
  });

  describe('synthetic service cases I–P', () => {
    it('CASE I — healthy connectivity + health unavailable → AVAILABLE + health UNKNOWN', async () => {
      stubBatch({
        vehicles: [vehicleRow('case-i')],
        health: [],
      });
      rentalHealthSummary.getFleetRowsBatch.mockRejectedValue(new Error('unavailable'));

      const p = (
        await svc.getVehicleProjections({
          organizationId: FIXTURE_ORG_ID,
          vehicleIds: ['case-i'],
          now: NOW,
        })
      ).get('case-i')!;

      expect(p.operationalAvailability).toBe(OperationalAvailabilityState.AVAILABLE);
      expect(p.healthEvaluability).toBe(HealthEvaluabilityState.UNKNOWN);
    });

    it('CASE J — IN_SERVICE business + healthy connectivity → UNAVAILABLE', async () => {
      stubBatch({
        vehicles: [vehicleRow('case-j', VehicleStatus.IN_SERVICE)],
        business: new Map([['case-j', operationalDto('MAINTENANCE')]]),
      });

      const p = (
        await svc.getVehicleProjections({
          organizationId: FIXTURE_ORG_ID,
          vehicleIds: ['case-j'],
          now: NOW,
        })
      ).get('case-j')!;

      expect(p.businessState).toBe(BusinessOperationalState.IN_SERVICE);
      expect(p.operationalAvailability).toBe(OperationalAvailabilityState.UNAVAILABLE);
    });

    it('CASE K — confirmed current unplug → NEEDS_VERIFICATION', async () => {
      stubBatch({
        vehicles: [vehicleRow('case-k')],
        connectivity: new Map([
          [
            'case-k',
            baseConnectivity({
              vehicleId: 'case-k',
              physicalDeviceState: PhysicalDeviceState.UNPLUGGED_CONFIRMED,
              overallState: OverallConnectivityState.DEVICE_UNPLUGGED,
              attentionState: AttentionState.ACTION_REQUIRED,
              activeEpisodeId: 'ep-open',
              reasonCodes: [ConnectivityReasonCode.DEVICE_UNPLUG_WEBHOOK],
              recommendedAction: ConnectivityRecommendedAction.CHECK_DEVICE,
            }),
          ],
        ]),
      });

      const p = (
        await svc.getVehicleProjections({
          organizationId: FIXTURE_ORG_ID,
          vehicleIds: ['case-k'],
          now: NOW,
        })
      ).get('case-k')!;

      expect(p.operationalAvailability).toBe(OperationalAvailabilityState.NEEDS_VERIFICATION);
      expect(p.operatorSummary.reasonCodes).toContain(
        OperationalProjectionReasonCode.CONNECTIVITY_CONFIRMED_INTERRUPTION,
      );
    });

    it('CASE L — DEVICE_CHECK_REQUIRED → NEEDS_VERIFICATION', async () => {
      stubBatch({
        vehicles: [vehicleRow('case-l')],
        connectivity: new Map([
          [
            'case-l',
            baseConnectivity({
              vehicleId: 'case-l',
              telemetryState: 'offline',
              physicalDeviceState: PhysicalDeviceState.UNKNOWN,
              overallState: OverallConnectivityState.OFFLINE,
              attentionState: AttentionState.ACTION_REQUIRED,
              reasonCodes: [
                ConnectivityReasonCode.TELEMETRY_OFFLINE,
                ConnectivityReasonCode.DEVICE_CHECK_REQUIRED,
              ],
              recommendedAction: ConnectivityRecommendedAction.CHECK_DEVICE,
            }),
          ],
        ]),
      });

      const p = (
        await svc.getVehicleProjections({
          organizationId: FIXTURE_ORG_ID,
          vehicleIds: ['case-l'],
          now: NOW,
        })
      ).get('case-l')!;

      expect(p.operationalAvailability).toBe(OperationalAvailabilityState.NEEDS_VERIFICATION);
    });

    it('CASE M — Health CRITICAL + rental blocked → UNAVAILABLE', async () => {
      stubBatch({
        vehicles: [vehicleRow('case-m')],
        health: [
          healthRow('case-m', {
            overall_state: 'critical',
            rental_blocked: true,
          }),
        ],
      });

      const p = (
        await svc.getVehicleProjections({
          organizationId: FIXTURE_ORG_ID,
          vehicleIds: ['case-m'],
          now: NOW,
        })
      ).get('case-m')!;

      expect(p.operationalAvailability).toBe(OperationalAvailabilityState.UNAVAILABLE);
      expect(p.healthEvaluability).toBe(HealthEvaluabilityState.EVALUABLE);
    });

    it('CASE N — Health CRITICAL without rental block does not auto UNAVAILABLE', async () => {
      stubBatch({
        vehicles: [vehicleRow('case-n')],
        health: [
          healthRow('case-n', {
            overall_state: 'critical',
            rental_blocked: false,
          }),
        ],
      });

      const p = (
        await svc.getVehicleProjections({
          organizationId: FIXTURE_ORG_ID,
          vehicleIds: ['case-n'],
          now: NOW,
        })
      ).get('case-n')!;

      expect(p.operationalAvailability).toBe(OperationalAvailabilityState.AVAILABLE);
      expect(p.healthEvaluability).toBe(HealthEvaluabilityState.EVALUABLE);
      expect(p.attention).toBe(AttentionState.ACTION_REQUIRED);
    });

    it('CASE O — episode reliability false + no active episode → insufficient cross-domain evidence', async () => {
      const lifecycleUnreliable = new VehicleOperationalProjectionService(
        prisma as any,
        vehiclesService as any,
        connectivityProjection as any,
        rentalHealthSummary as any,
        { automaticLifecycleReconciliationEnabled: false } as any,
      );
      stubBatch({
        vehicles: [vehicleRow('case-o')],
        connectivity: new Map([
          [
            'case-o',
            baseConnectivity({
              vehicleId: 'case-o',
              activeEpisodeId: null,
              overallState: OverallConnectivityState.TELEMETRY_ACTIVE,
            }),
          ],
        ]),
      });

      const p = (
        await lifecycleUnreliable.getVehicleProjections({
          organizationId: FIXTURE_ORG_ID,
          vehicleIds: ['case-o'],
          now: NOW,
        })
      ).get('case-o')!;

      expect(p.evidence.episodeEvidenceReliable).toBe(false);
      expect(p.operatorSummary.reasonCodes).toContain(
        OperationalProjectionReasonCode.INSUFFICIENT_CROSS_DOMAIN_EVIDENCE,
      );
      expect(p.operatorSummary.reasonCodes).not.toContain(
        OperationalProjectionReasonCode.CONNECTIVITY_CONFIRMED_INTERRUPTION,
      );
    });

    it('CASE P — foreign tenant vehicle returns no projection', async () => {
      prisma.vehicle.findMany.mockResolvedValue([]);
      const result = await svc.getVehicleProjections({
        organizationId: FIXTURE_ORG_ID,
        vehicleIds: ['foreign-tenant-vehicle'],
        now: NOW,
      });
      expect(result.size).toBe(0);
      expect(connectivityProjection.projectForVehicles).not.toHaveBeenCalled();
    });
  });

  describe('episode evidence reliability', () => {
    it('propagates lifecycle policy automatic reconciliation flag', () => {
      expect(svc.resolveEpisodeEvidenceReliability()).toBe(true);
      const unreliable = new VehicleOperationalProjectionService(
        prisma as any,
        vehiclesService as any,
        connectivityProjection as any,
        rentalHealthSummary as any,
        { automaticLifecycleReconciliationEnabled: false } as any,
      );
      expect(unreliable.resolveEpisodeEvidenceReliability()).toBe(false);
    });
  });
});
