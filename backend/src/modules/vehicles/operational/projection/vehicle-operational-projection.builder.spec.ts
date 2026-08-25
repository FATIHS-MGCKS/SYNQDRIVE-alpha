import {
  AttentionState,
  ConnectivityReasonCode,
  ConnectivityRecommendedAction,
  DataCoverageState,
  OverallConnectivityState,
  PhysicalDeviceState,
  ProviderLinkState,
} from '../../connectivity/domain/connectivity-domain.types';
import {
  buildVehicleOperationalProjection,
  buildVehicleOperationalProjectionBatch,
  deriveHealthEvaluability,
  deriveOperationalAvailability,
} from './vehicle-operational-projection.builder';
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

describe('VehicleOperationalProjection (P0.2 contract)', () => {
  const build = (input: Parameters<typeof buildVehicleOperationalProjection>[0]) =>
    buildVehicleOperationalProjection(input);

  describe('production reference fixtures', () => {
    it('HMÜ C 215 — recovered standby; not blocked by historical unplug', () => {
      const f = fixtureHmueC215();
      const projection = build({
        vehicleId: f.vehicleId,
        organizationId: FIXTURE_ORG_ID,
        generatedAt: FIXTURE_GENERATED_AT,
        businessState: f.businessState,
        connectivity: f.connectivity,
        health: f.health,
        episodeEvidenceReliable: f.episodeEvidenceReliable,
      });

      expect(projection.businessState).toBe(BusinessOperationalState.AVAILABLE);
      expect(projection.operationalAvailability).toBe(OperationalAvailabilityState.AVAILABLE);
      expect(projection.connectivity.physicalDeviceState).toBe(PhysicalDeviceState.PLUGGED_INFERRED);
      expect(projection.connectivity.overallState).not.toBe(OverallConnectivityState.DEVICE_UNPLUGGED);
      expect(projection.attention).toBe(AttentionState.NONE);
      expect(projection.healthEvaluability).toBe(HealthEvaluabilityState.EVALUABLE);
    });

    it('WOB L 7503 — business AVAILABLE but operational NEEDS_VERIFICATION', () => {
      const f = fixtureWobL7503();
      const projection = build({
        vehicleId: f.vehicleId,
        organizationId: FIXTURE_ORG_ID,
        generatedAt: FIXTURE_GENERATED_AT,
        businessState: f.businessState,
        connectivity: f.connectivity,
        health: f.health,
        episodeEvidenceReliable: f.episodeEvidenceReliable,
      });

      expect(projection.businessState).toBe(BusinessOperationalState.AVAILABLE);
      expect(projection.operationalAvailability).toBe(
        OperationalAvailabilityState.NEEDS_VERIFICATION,
      );
      expect(projection.operationalAvailability).not.toBe(OperationalAvailabilityState.AVAILABLE);
      expect(projection.healthEvaluability).toBe(HealthEvaluabilityState.NOT_EVALUABLE);
      expect(projection.attention).toBe(AttentionState.ACTION_REQUIRED);
      expect(projection.operatorSummary.primaryReason).toBe(
        ConnectivityReasonCode.DEVICE_CHECK_REQUIRED,
      );
      expect(projection.operatorSummary.recommendedAction).toBe(
        ConnectivityRecommendedAction.CHECK_DEVICE,
      );
    });

    it('WOB L 9755 — communication-only recovery; not UNPLUGGED from history', () => {
      const f = fixtureWobL9755();
      const projection = build({
        vehicleId: f.vehicleId,
        organizationId: FIXTURE_ORG_ID,
        generatedAt: FIXTURE_GENERATED_AT,
        businessState: f.businessState,
        connectivity: f.connectivity,
        health: f.health,
        episodeEvidenceReliable: f.episodeEvidenceReliable,
      });

      expect(projection.businessState).toBe(BusinessOperationalState.AVAILABLE);
      expect(projection.operationalAvailability).toBe(
        OperationalAvailabilityState.NEEDS_VERIFICATION,
      );
      expect(projection.connectivity.physicalDeviceState).toBe(PhysicalDeviceState.UNKNOWN);
      expect(projection.connectivity.physicalDeviceState).not.toBe(
        PhysicalDeviceState.UNPLUGGED_CONFIRMED,
      );
      expect(projection.healthEvaluability).toBe(HealthEvaluabilityState.NOT_EVALUABLE);
      expect(projection.evidence.episodeEvidenceReliable).toBe(false);
    });
  });

  describe('synthetic contract cases A–H', () => {
    it('CASE A — fresh telemetry, PLUGGED_INFERRED, business AVAILABLE → operational AVAILABLE', () => {
      const projection = build({
        vehicleId: 'case-a',
        organizationId: FIXTURE_ORG_ID,
        generatedAt: FIXTURE_GENERATED_AT,
        businessState: BusinessOperationalState.AVAILABLE,
        connectivity: baseConnectivity({ vehicleId: 'case-a' }),
        health: {
          overallState: 'good',
          pipelineAvailability: 'ready',
          rentalBlocked: false,
          generatedAt: FIXTURE_GENERATED_AT,
          anyModuleDataStale: false,
        },
      });
      expect(projection.operationalAvailability).toBe(OperationalAvailabilityState.AVAILABLE);
      expect(projection.attention).toBe(AttentionState.NONE);
    });

    it('CASE B — explicit current UNPLUG newer than snapshot → NEEDS_VERIFICATION + unplug attention', () => {
      const projection = build({
        vehicleId: 'case-b',
        organizationId: FIXTURE_ORG_ID,
        generatedAt: FIXTURE_GENERATED_AT,
        businessState: BusinessOperationalState.AVAILABLE,
        connectivity: baseConnectivity({
          vehicleId: 'case-b',
          physicalDeviceState: PhysicalDeviceState.UNPLUGGED_CONFIRMED,
          overallState: OverallConnectivityState.DEVICE_UNPLUGGED,
          attentionState: AttentionState.ACTION_REQUIRED,
          activeEpisodeId: 'ep-open',
          reasonCodes: [
            ConnectivityReasonCode.DEVICE_UNPLUG_WEBHOOK,
            ConnectivityReasonCode.TELEMETRY_FRESH,
          ],
          recommendedAction: ConnectivityRecommendedAction.CHECK_DEVICE,
          requiresAction: true,
        }),
      });
      expect(projection.operationalAvailability).toBe(
        OperationalAvailabilityState.NEEDS_VERIFICATION,
      );
      expect(projection.operatorSummary.reasonCodes).toContain(
        OperationalProjectionReasonCode.CONNECTIVITY_CONFIRMED_INTERRUPTION,
      );
      expect(projection.attention).toBe(AttentionState.ACTION_REQUIRED);
    });

    it('CASE C — no unplug, >48h silence → NEEDS_VERIFICATION', () => {
      const projection = build({
        vehicleId: 'case-c',
        organizationId: FIXTURE_ORG_ID,
        generatedAt: FIXTURE_GENERATED_AT,
        businessState: BusinessOperationalState.AVAILABLE,
        connectivity: baseConnectivity({
          vehicleId: 'case-c',
          telemetryState: 'offline',
          physicalDeviceState: PhysicalDeviceState.UNKNOWN,
          overallState: OverallConnectivityState.OFFLINE,
          attentionState: AttentionState.ACTION_REQUIRED,
          reasonCodes: [
            ConnectivityReasonCode.TELEMETRY_OFFLINE,
            ConnectivityReasonCode.DEVICE_CHECK_REQUIRED,
          ],
          lastTelemetryAt: '2026-07-01T12:00:00.000Z',
          recommendedAction: ConnectivityRecommendedAction.CHECK_DEVICE,
        }),
      });
      expect(projection.connectivity.physicalDeviceState).toBe(PhysicalDeviceState.UNKNOWN);
      expect(projection.operationalAvailability).toBe(
        OperationalAvailabilityState.NEEDS_VERIFICATION,
      );
    });

    it('CASE D — historical unplug superseded by newer positive snapshot + fresh telemetry', () => {
      const projection = build({
        vehicleId: 'case-d',
        organizationId: FIXTURE_ORG_ID,
        generatedAt: FIXTURE_GENERATED_AT,
        businessState: BusinessOperationalState.AVAILABLE,
        connectivity: baseConnectivity({
          vehicleId: 'case-d',
          physicalDeviceState: PhysicalDeviceState.PLUGGED_INFERRED,
          overallState: OverallConnectivityState.TELEMETRY_ACTIVE,
          reasonCodes: [
            ConnectivityReasonCode.DEVICE_RECONNECTED_SNAPSHOT,
            ConnectivityReasonCode.TELEMETRY_FRESH,
          ],
        }),
        episodeEvidenceReliable: true,
      });
      expect(projection.operationalAvailability).toBe(OperationalAvailabilityState.AVAILABLE);
      expect(projection.connectivity.overallState).not.toBe(
        OverallConnectivityState.DEVICE_UNPLUGGED,
      );
    });

    it('CASE E — historical unplug, positive snapshot, then >48h silence → NEEDS_VERIFICATION not UNPLUGGED', () => {
      const projection = build({
        vehicleId: 'case-e',
        organizationId: FIXTURE_ORG_ID,
        generatedAt: FIXTURE_GENERATED_AT,
        businessState: BusinessOperationalState.AVAILABLE,
        connectivity: baseConnectivity({
          vehicleId: 'case-e',
          telemetryState: 'offline',
          physicalDeviceState: PhysicalDeviceState.UNKNOWN,
          overallState: OverallConnectivityState.OFFLINE,
          attentionState: AttentionState.ACTION_REQUIRED,
          reasonCodes: [
            ConnectivityReasonCode.TELEMETRY_OFFLINE,
            ConnectivityReasonCode.DEVICE_CHECK_REQUIRED,
          ],
          lastTelemetryAt: '2026-07-18T13:42:28.000Z',
          recommendedAction: ConnectivityRecommendedAction.CHECK_DEVICE,
        }),
      });
      expect(projection.connectivity.physicalDeviceState).not.toBe(
        PhysicalDeviceState.UNPLUGGED_CONFIRMED,
      );
      expect(projection.operationalAvailability).toBe(
        OperationalAvailabilityState.NEEDS_VERIFICATION,
      );
    });

    it('CASE F — fresh communication with obdIsPluggedIn=false follows P0.1; projection does not invent stronger truth', () => {
      const projection = build({
        vehicleId: 'case-f',
        organizationId: FIXTURE_ORG_ID,
        generatedAt: FIXTURE_GENERATED_AT,
        businessState: BusinessOperationalState.AVAILABLE,
        connectivity: baseConnectivity({
          vehicleId: 'case-f',
          telemetryState: 'live',
          physicalDeviceState: PhysicalDeviceState.UNKNOWN,
          overallState: OverallConnectivityState.TELEMETRY_ACTIVE,
          attentionState: AttentionState.ACTION_REQUIRED,
          reasonCodes: [
            ConnectivityReasonCode.TELEMETRY_FRESH,
            ConnectivityReasonCode.DEVICE_CHECK_REQUIRED,
          ],
          recommendedAction: ConnectivityRecommendedAction.CHECK_DEVICE,
        }),
      });
      expect(projection.connectivity.physicalDeviceState).toBe(PhysicalDeviceState.UNKNOWN);
      expect(projection.operationalAvailability).toBe(
        OperationalAvailabilityState.NEEDS_VERIFICATION,
      );
      expect(projection.operationalAvailability).not.toBe(OperationalAvailabilityState.AVAILABLE);
    });

    it('CASE G — connectivity healthy but business IN_SERVICE → operational UNAVAILABLE', () => {
      const projection = build({
        vehicleId: 'case-g',
        organizationId: FIXTURE_ORG_ID,
        generatedAt: FIXTURE_GENERATED_AT,
        businessState: BusinessOperationalState.IN_SERVICE,
        connectivity: baseConnectivity({ vehicleId: 'case-g' }),
      });
      expect(projection.operationalAvailability).toBe(OperationalAvailabilityState.UNAVAILABLE);
      expect(projection.operatorSummary.reasonCodes).toContain(
        OperationalProjectionReasonCode.BUSINESS_WORKFLOW_BLOCKED,
      );
    });

    it('CASE H — connectivity healthy, health CRITICAL + rental blocked → operational UNAVAILABLE', () => {
      const projection = build({
        vehicleId: 'case-h',
        organizationId: FIXTURE_ORG_ID,
        generatedAt: FIXTURE_GENERATED_AT,
        businessState: BusinessOperationalState.AVAILABLE,
        connectivity: baseConnectivity({ vehicleId: 'case-h' }),
        health: {
          overallState: 'critical',
          pipelineAvailability: 'ready',
          rentalBlocked: true,
          generatedAt: FIXTURE_GENERATED_AT,
          anyModuleDataStale: false,
        },
      });
      expect(projection.operationalAvailability).toBe(OperationalAvailabilityState.UNAVAILABLE);
      expect(projection.attention).toBe(AttentionState.CRITICAL);
      expect(projection.operatorSummary.reasonCodes).toContain(
        OperationalProjectionReasonCode.HEALTH_RENTAL_BLOCKED,
      );
    });
  });

  describe('P0.1 consumption boundary', () => {
    it('does not mutate connectivity runtime state', () => {
      const connectivity = baseConnectivity({ vehicleId: 'immutable' });
      const snapshot = JSON.stringify(connectivity);
      build({
        vehicleId: 'immutable',
        organizationId: FIXTURE_ORG_ID,
        generatedAt: FIXTURE_GENERATED_AT,
        businessState: BusinessOperationalState.AVAILABLE,
        connectivity,
      });
      expect(JSON.stringify(connectivity)).toBe(snapshot);
    });

    it('references connectivity object without re-deriving thresholds', () => {
      const connectivity = baseConnectivity({
        vehicleId: 'ref',
        telemetryState: 'offline',
        reasonCodes: [ConnectivityReasonCode.TELEMETRY_OFFLINE],
      });
      const projection = build({
        vehicleId: 'ref',
        organizationId: FIXTURE_ORG_ID,
        generatedAt: FIXTURE_GENERATED_AT,
        businessState: BusinessOperationalState.AVAILABLE,
        connectivity,
      });
      expect(projection.connectivity).toBe(connectivity);
      expect(projection.connectivity.telemetryState).toBe('offline');
    });
  });

  describe('batch projection', () => {
    it('uses shared generatedAt for all vehicles in one request', () => {
      const batch = buildVehicleOperationalProjectionBatch({
        generatedAt: FIXTURE_GENERATED_AT,
        projections: [
          {
            vehicleId: 'v1',
            organizationId: FIXTURE_ORG_ID,
            generatedAt: 'ignored',
            businessState: BusinessOperationalState.AVAILABLE,
            connectivity: baseConnectivity({ vehicleId: 'v1' }),
          },
          {
            vehicleId: 'v2',
            organizationId: FIXTURE_ORG_ID,
            generatedAt: 'ignored',
            businessState: BusinessOperationalState.AVAILABLE,
            connectivity: baseConnectivity({ vehicleId: 'v2' }),
          },
        ],
      });
      expect(batch).toHaveLength(2);
      expect(batch[0]!.generatedAt).toBe(FIXTURE_GENERATED_AT);
      expect(batch[1]!.generatedAt).toBe(FIXTURE_GENERATED_AT);
    });
  });

  describe('health evaluability', () => {
    it('does not mark GOOD health evaluable when telemetry is offline and modules stale', () => {
      const connectivity = baseConnectivity({
        telemetryState: 'offline',
        lastTelemetryAt: '2026-07-01T12:00:00.000Z',
      });
      const result = deriveHealthEvaluability(
        {
          overallState: 'good',
          pipelineAvailability: 'ready',
          rentalBlocked: false,
          generatedAt: FIXTURE_GENERATED_AT,
          anyModuleDataStale: true,
        },
        connectivity,
      );
      expect(result).toBe(HealthEvaluabilityState.NOT_EVALUABLE);
    });
  });

  describe('operational availability invariants', () => {
    it('business AVAILABLE + offline telemetry + DEVICE_CHECK_REQUIRED ≠ operational AVAILABLE', () => {
      const f = fixtureWobL7503();
      const result = deriveOperationalAvailability(
        f.businessState,
        f.connectivity,
        f.health,
      );
      expect(f.businessState).toBe(BusinessOperationalState.AVAILABLE);
      expect(result).toBe(OperationalAvailabilityState.NEEDS_VERIFICATION);
      expect(result).not.toBe(OperationalAvailabilityState.AVAILABLE);
    });

    it('offline telemetry alone does not force UNAVAILABLE', () => {
      const connectivity = baseConnectivity({
        telemetryState: 'offline',
        overallState: OverallConnectivityState.OFFLINE,
        physicalDeviceState: PhysicalDeviceState.UNKNOWN,
        reasonCodes: [ConnectivityReasonCode.TELEMETRY_OFFLINE],
      });
      const result = deriveOperationalAvailability(
        BusinessOperationalState.AVAILABLE,
        connectivity,
        null,
      );
      expect(result).not.toBe(OperationalAvailabilityState.UNAVAILABLE);
    });
  });
});
