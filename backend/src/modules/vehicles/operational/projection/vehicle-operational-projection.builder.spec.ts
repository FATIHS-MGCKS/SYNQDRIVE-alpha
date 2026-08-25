import {
  AttentionState,
  ConnectivityReasonCode,
  ConnectivityRecommendedAction,
  DataCoverageState,
  OverallConnectivityState,
  PhysicalDeviceState,
} from '../../connectivity/domain/connectivity-domain.types';
import {
  applyConnectivityHealthEvaluabilityLimiter,
  buildVehicleOperationalProjection,
  buildVehicleOperationalProjectionBatch,
  deriveHealthEvaluability,
  deriveHealthEvaluabilityFromHealthDomain,
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
  syntheticCurrentHealthEvidence,
} from './vehicle-operational-projection.fixtures';

describe('VehicleOperationalProjection (P0.2 contract)', () => {
  const build = (input: Parameters<typeof buildVehicleOperationalProjection>[0]) =>
    buildVehicleOperationalProjection(input);

  describe('production reference fixtures', () => {
    it('HMÜ C 215 — recovered standby; health evaluability UNKNOWN without proven health evidence', () => {
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
      expect(projection.healthEvaluability).toBe(HealthEvaluabilityState.UNKNOWN);
      expect(projection.healthEvaluability).not.toBe(HealthEvaluabilityState.EVALUABLE);
    });

    it('WOB L 7503 — NOT_EVALUABLE from health pipeline unavailable, not connectivity offline alone', () => {
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
      expect(projection.healthEvaluability).toBe(HealthEvaluabilityState.NOT_EVALUABLE);
      expect(deriveHealthEvaluabilityFromHealthDomain(f.health)).toBe(
        HealthEvaluabilityState.NOT_EVALUABLE,
      );
      expect(projection.operatorSummary.reasonCodes).toContain(
        OperationalProjectionReasonCode.HEALTH_EVIDENCE_UNAVAILABLE,
      );
    });

    it('WOB L 9755 — NOT_EVALUABLE from health metadata; not UNPLUGGED from history', () => {
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

      expect(projection.connectivity.physicalDeviceState).toBe(PhysicalDeviceState.UNKNOWN);
      expect(projection.connectivity.physicalDeviceState).not.toBe(
        PhysicalDeviceState.UNPLUGGED_CONFIRMED,
      );
      expect(projection.healthEvaluability).toBe(HealthEvaluabilityState.NOT_EVALUABLE);
      expect(deriveHealthEvaluabilityFromHealthDomain(f.health)).toBe(
        HealthEvaluabilityState.NOT_EVALUABLE,
      );
    });
  });

  describe('synthetic contract cases A–H (operational availability)', () => {
    it('CASE A — fresh telemetry, PLUGGED_INFERRED, business AVAILABLE → operational AVAILABLE', () => {
      const projection = build({
        vehicleId: 'case-a',
        organizationId: FIXTURE_ORG_ID,
        generatedAt: FIXTURE_GENERATED_AT,
        businessState: BusinessOperationalState.AVAILABLE,
        connectivity: baseConnectivity({ vehicleId: 'case-a' }),
        health: syntheticCurrentHealthEvidence(),
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
      expect(projection.operationalAvailability).toBe(
        OperationalAvailabilityState.NEEDS_VERIFICATION,
      );
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
    });

    it('CASE H — health CRITICAL + rental blocked → UNAVAILABLE but health still EVALUABLE', () => {
      const projection = build({
        vehicleId: 'case-h',
        organizationId: FIXTURE_ORG_ID,
        generatedAt: FIXTURE_GENERATED_AT,
        businessState: BusinessOperationalState.AVAILABLE,
        connectivity: baseConnectivity({ vehicleId: 'case-h' }),
        health: syntheticCurrentHealthEvidence({
          conditionState: 'critical',
          rentalBlocked: true,
        }),
      });
      expect(projection.operationalAvailability).toBe(OperationalAvailabilityState.UNAVAILABLE);
      expect(projection.healthEvaluability).toBe(HealthEvaluabilityState.EVALUABLE);
      expect(projection.attention).toBe(AttentionState.CRITICAL);
    });
  });

  describe('health evaluability contract cases H1–H8', () => {
    const healthyConnectivity = () => baseConnectivity({ vehicleId: 'health-case' });

    it('H1 — no health input + healthy connectivity → UNKNOWN', () => {
      expect(
        deriveHealthEvaluability(null, healthyConnectivity()),
      ).toBe(HealthEvaluabilityState.UNKNOWN);
    });

    it('H2 — pipeline ready + current evidence → EVALUABLE', () => {
      expect(
        deriveHealthEvaluability(
          syntheticCurrentHealthEvidence(),
          healthyConnectivity(),
        ),
      ).toBe(HealthEvaluabilityState.EVALUABLE);
    });

    it('H3 — pipeline ready + some module stale → PARTIALLY_EVALUABLE', () => {
      expect(
        deriveHealthEvaluability(
          syntheticCurrentHealthEvidence({ anyModuleDataStale: true }),
          healthyConnectivity(),
        ),
      ).toBe(HealthEvaluabilityState.PARTIALLY_EVALUABLE);
    });

    it('H4 — stale health evidence + healthy connectivity → NOT_EVALUABLE (connectivity does not upgrade)', () => {
      expect(
        deriveHealthEvaluability(
          {
            conditionState: 'good',
            pipelineAvailability: 'unavailable',
            rentalBlocked: null,
            generatedAt: '2026-07-01T12:00:00.000Z',
            anyModuleDataStale: true,
          },
          healthyConnectivity(),
        ),
      ).toBe(HealthEvaluabilityState.NOT_EVALUABLE);
    });

    it('H5 — current health + offline telemetry for telemetry-dependent modules → downgraded', () => {
      const health = syntheticCurrentHealthEvidence({
        telemetryDependentModulesEvaluated: true,
      });
      const offline = baseConnectivity({
        telemetryState: 'offline',
        lastTelemetryAt: '2026-07-01T12:00:00.000Z',
      });
      expect(deriveHealthEvaluabilityFromHealthDomain(health)).toBe(
        HealthEvaluabilityState.EVALUABLE,
      );
      expect(deriveHealthEvaluability(health, offline)).toBe(
        HealthEvaluabilityState.PARTIALLY_EVALUABLE,
      );
    });

    it('H6 — health CRITICAL + current evidence → EVALUABLE (condition ≠ evaluability)', () => {
      expect(
        deriveHealthEvaluability(
          syntheticCurrentHealthEvidence({ conditionState: 'critical' }),
          healthyConnectivity(),
        ),
      ).toBe(HealthEvaluabilityState.EVALUABLE);
    });

    it('H7 — health GOOD + stale modules → not EVALUABLE', () => {
      expect(
        deriveHealthEvaluability(
          syntheticCurrentHealthEvidence({
            conditionState: 'good',
            anyModuleDataStale: true,
          }),
          healthyConnectivity(),
        ),
      ).toBe(HealthEvaluabilityState.PARTIALLY_EVALUABLE);
    });

    it('H8 — rentalBlocked + current evidence → operational UNAVAILABLE, health EVALUABLE', () => {
      const projection = build({
        vehicleId: 'h8',
        organizationId: FIXTURE_ORG_ID,
        generatedAt: FIXTURE_GENERATED_AT,
        businessState: BusinessOperationalState.AVAILABLE,
        connectivity: healthyConnectivity(),
        health: syntheticCurrentHealthEvidence({ rentalBlocked: true }),
      });
      expect(projection.operationalAvailability).toBe(OperationalAvailabilityState.UNAVAILABLE);
      expect(projection.healthEvaluability).toBe(HealthEvaluabilityState.EVALUABLE);
    });
  });

  describe('connectivity limiter asymmetry', () => {
    it('healthy connectivity cannot upgrade missing health to EVALUABLE', () => {
      expect(
        deriveHealthEvaluability(undefined, baseConnectivity()),
      ).toBe(HealthEvaluabilityState.UNKNOWN);
    });

    it('offline connectivity alone does not force NOT_EVALUABLE when health pipeline is ready and current', () => {
      const health = syntheticCurrentHealthEvidence({
        telemetryDependentModulesEvaluated: false,
      });
      const offline = baseConnectivity({
        telemetryState: 'offline',
        lastTelemetryAt: '2026-07-01T12:00:00.000Z',
      });
      expect(deriveHealthEvaluability(health, offline)).toBe(
        HealthEvaluabilityState.EVALUABLE,
      );
    });

    it('connectivity limiter only downgrades, never upgrades', () => {
      const health = syntheticCurrentHealthEvidence({
        telemetryDependentModulesEvaluated: true,
      });
      const limited = applyConnectivityHealthEvaluabilityLimiter(
        HealthEvaluabilityState.PARTIALLY_EVALUABLE,
        health,
        baseConnectivity({ telemetryState: 'offline' }),
      );
      expect(limited).not.toBe(HealthEvaluabilityState.EVALUABLE);
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
        ],
      });
      expect(batch[0]!.generatedAt).toBe(FIXTURE_GENERATED_AT);
    });
  });

  describe('operational availability invariants', () => {
    it('business AVAILABLE + offline telemetry + DEVICE_CHECK_REQUIRED ≠ operational AVAILABLE', () => {
      const f = fixtureWobL7503();
      expect(
        deriveOperationalAvailability(f.businessState, f.connectivity, f.health),
      ).toBe(OperationalAvailabilityState.NEEDS_VERIFICATION);
    });

    it('offline telemetry alone does not force UNAVAILABLE', () => {
      const connectivity = baseConnectivity({
        telemetryState: 'offline',
        overallState: OverallConnectivityState.OFFLINE,
        reasonCodes: [ConnectivityReasonCode.TELEMETRY_OFFLINE],
      });
      expect(
        deriveOperationalAvailability(
          BusinessOperationalState.AVAILABLE,
          connectivity,
          null,
        ),
      ).not.toBe(OperationalAvailabilityState.UNAVAILABLE);
    });
  });
});
