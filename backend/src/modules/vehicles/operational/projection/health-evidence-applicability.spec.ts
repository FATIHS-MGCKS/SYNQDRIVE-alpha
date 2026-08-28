/**
 * P0.4 final gate — Health evidence applicability semantics (A1–A8).
 *
 * Uses canonical Rental Health → healthEvidenceFromVehicleHealth → deriveHealthEvaluability
 * (not synthetic snapshot shortcuts for applicability cases).
 */
import {
  computeOverallState,
  finalizeVehicleHealthAvailability,
  type ModuleHealth,
  type VehicleHealth,
} from '../../../rental-health/rental-health.types';
import { RENTAL_HEALTH_MODULE_KEYS } from '../../../rental-health/rental-health.types';
import { healthEvidenceFromVehicleHealth } from './health-evidence.adapter';
import {
  deriveHealthEvaluability,
  deriveHealthEvaluabilityFromHealthDomain,
} from './vehicle-operational-projection.builder';
import { HealthEvaluabilityState } from './vehicle-operational-projection.types';
import { fixtureHmueC215 } from './vehicle-operational-projection.fixtures';
import { buildVehicleOperationalProjection } from './vehicle-operational-projection.builder';
import {
  AttentionState,
  ConnectivityReasonCode,
  DataCoverageState,
  OverallConnectivityState,
  ProviderLinkState,
  type VehicleConnectivityRuntimeState,
} from '../../connectivity/domain/connectivity-domain.types';

const NOW = '2026-08-25T12:00:00.000Z';

function moduleHealth(
  state: ModuleHealth['state'],
  overrides: Partial<ModuleHealth> = {},
): ModuleHealth {
  return {
    state,
    reason: overrides.reason ?? 'test',
    last_updated_at: overrides.last_updated_at ?? NOW,
    data_stale: overrides.data_stale ?? false,
    ...overrides,
  };
}

function buildVehicleHealth(
  moduleOverrides: Partial<Record<(typeof RENTAL_HEALTH_MODULE_KEYS)[number], ModuleHealth>>,
  options: {
    loadFailures?: Partial<Record<(typeof RENTAL_HEALTH_MODULE_KEYS)[number], boolean>>;
    generatedAt?: string;
  } = {},
): VehicleHealth {
  const modules = Object.fromEntries(
    RENTAL_HEALTH_MODULE_KEYS.map((key) => [
      key,
      moduleOverrides[key] ??
        moduleHealth('good', {
          last_updated_at: options.generatedAt ?? NOW,
        }),
    ]),
  ) as VehicleHealth['modules'];

  const { modules: withAvailability, availability } = finalizeVehicleHealthAvailability(
    modules,
    options.loadFailures ?? {},
  );

  return {
    vehicle_id: 'veh-applicability',
    organization_id: 'org-applicability',
    overall_state: computeOverallState(Object.values(withAvailability)),
    availability,
    rental_blocked: availability === 'ready' ? false : null,
    blocking_reasons: [],
    modules: withAvailability,
    generated_at: options.generatedAt ?? NOW,
    evaluated_at: options.generatedAt ?? NOW,
  };
}

function healthyConnectivity(): VehicleConnectivityRuntimeState {
  return {
    vehicleId: 'veh-applicability',
    organizationId: 'org-applicability',
    providerLinkState: ProviderLinkState.ACTIVE,
    telemetryState: 'live',
    physicalDeviceState: 'PLUGGED_INFERRED' as VehicleConnectivityRuntimeState['physicalDeviceState'],
    dataCoverageState: DataCoverageState.GOOD,
    attentionState: AttentionState.NONE,
    overallState: OverallConnectivityState.TELEMETRY_ACTIVE,
    reasonCodes: [ConnectivityReasonCode.TELEMETRY_FRESH],
    lastTelemetryAt: NOW,
    lastProviderObservedAt: NOW,
    lastReceivedAt: NOW,
    lastRecoveryEvidenceAt: null,
    lastRecoveryReceivedAt: null,
    lastRecoveryResolvedAt: null,
    deviceBindingId: 'binding',
    activeEpisodeId: null,
    requiresAction: false,
    recommendedAction: 'NONE',
    evidence: {},
    diagnostic: {
      state: 'PROVIDER_REACHABLE_DATA_FRESH',
      providerReachable: true,
      observationAgeMs: 0,
      providerFetchAgeMs: 0,
      observationState: 'live',
    },
    calculatedAt: NOW,
    stateVersion: 1,
  };
}

function offlineConnectivity(): VehicleConnectivityRuntimeState {
  return {
    ...healthyConnectivity(),
    telemetryState: 'offline',
    overallState: OverallConnectivityState.OFFLINE,
    reasonCodes: [ConnectivityReasonCode.TELEMETRY_OFFLINE],
    lastTelemetryAt: '2026-07-01T12:00:00.000Z',
    dataCoverageState: DataCoverageState.INSUFFICIENT,
  };
}

/** ICE-like: all telemetry-dependent modules structurally n_a; service/complaints current. */
function iceTelemetryModulesNotApplicable(): VehicleHealth {
  return buildVehicleHealth({
    battery: moduleHealth('n_a', { reason: 'Nicht unterstützt' }),
    tires: moduleHealth('n_a', { reason: 'Nicht unterstützt' }),
    brakes: moduleHealth('n_a', { reason: 'Nicht unterstützt' }),
    error_codes: moduleHealth('n_a', { reason: 'Nicht unterstützt' }),
    vehicle_alerts: moduleHealth('n_a', { reason: 'Nicht unterstützt' }),
    service_compliance: moduleHealth('good'),
    complaints: moduleHealth('good'),
  });
}

describe('Health evidence applicability semantics (P0.4 final gate A1–A8)', () => {
  it('A1 — non-applicable telemetry modules do not reduce health-domain evaluability', () => {
    const health = healthEvidenceFromVehicleHealth(iceTelemetryModulesNotApplicable());
    expect(health.telemetryDependentModulesEvaluated).toBe(false);
    expect(deriveHealthEvaluabilityFromHealthDomain(health)).toBe(
      HealthEvaluabilityState.EVALUABLE,
    );
    expect(deriveHealthEvaluability(health, healthyConnectivity())).toBe(
      HealthEvaluabilityState.EVALUABLE,
    );
    // Offline + insufficient coverage may conservatively downgrade one step even when
    // telemetry modules are n_a — must not collapse to NOT_EVALUABLE from applicability alone.
    expect(deriveHealthEvaluability(health, offlineConnectivity())).toBe(
      HealthEvaluabilityState.PARTIALLY_EVALUABLE,
    );
  });

  it('A2 — applicable module load failure reduces pipeline coverage (partial → conservative evaluability)', () => {
    const health = healthEvidenceFromVehicleHealth(
      buildVehicleHealth(
        {
          battery: moduleHealth('unknown', {
            data_stale: true,
            last_updated_at: null,
          }),
        },
        { loadFailures: { battery: true } },
      ),
    );
    expect(health.pipelineAvailability).toBe('partial');
    expect(deriveHealthEvaluabilityFromHealthDomain(health)).toBe(
      HealthEvaluabilityState.NOT_EVALUABLE,
    );
  });

  it('A3 — applicable stale module with ready pipeline → PARTIALLY_EVALUABLE', () => {
    const health = healthEvidenceFromVehicleHealth(
      buildVehicleHealth({
        tires: moduleHealth('good', {
          data_stale: true,
          last_updated_at: '2026-07-01T00:00:00.000Z',
        }),
      }),
    );
    expect(health.anyModuleDataStale).toBe(true);
    expect(deriveHealthEvaluabilityFromHealthDomain(health)).toBe(
      HealthEvaluabilityState.PARTIALLY_EVALUABLE,
    );
  });

  it('A4 — healthy connectivity + absent health authority → UNKNOWN, not EVALUABLE', () => {
    expect(deriveHealthEvaluability(null, healthyConnectivity())).toBe(
      HealthEvaluabilityState.UNKNOWN,
    );
    expect(deriveHealthEvaluability(undefined, healthyConnectivity())).toBe(
      HealthEvaluabilityState.UNKNOWN,
    );
  });

  it('A5 — current CRITICAL with ready pipeline remains EVALUABLE + CRITICAL', () => {
    const health = healthEvidenceFromVehicleHealth(
      buildVehicleHealth({
        error_codes: moduleHealth('critical', { reason: 'Active fault' }),
      }),
    );
    expect(health.conditionState).toBe('critical');
    expect(deriveHealthEvaluabilityFromHealthDomain(health)).toBe(
      HealthEvaluabilityState.EVALUABLE,
    );
  });

  it('A6 — stale historical GOOD (unavailable pipeline) is NOT plain GOOD presentation input', () => {
    const health = healthEvidenceFromVehicleHealth(
      buildVehicleHealth(
        {
          tires: moduleHealth('good', {
            data_stale: true,
            last_updated_at: '2026-07-01T00:00:00.000Z',
          }),
        },
        { loadFailures: { battery: true, brakes: true, error_codes: true } },
      ),
    );
    expect(health.conditionState).toBe('good');
    expect(deriveHealthEvaluabilityFromHealthDomain(health)).toBe(
      HealthEvaluabilityState.NOT_EVALUABLE,
    );
  });

  it('A7 — pipeline unavailable must not be treated as evaluable GOOD', () => {
    const health = healthEvidenceFromVehicleHealth(
      buildVehicleHealth(
        {},
        {
          loadFailures: Object.fromEntries(
            RENTAL_HEALTH_MODULE_KEYS.map((key) => [key, true]),
          ) as Partial<Record<(typeof RENTAL_HEALTH_MODULE_KEYS)[number], boolean>>,
        },
      ),
    );
    expect(health.pipelineAvailability).toBe('unavailable');
    expect(deriveHealthEvaluabilityFromHealthDomain(health)).not.toBe(
      HealthEvaluabilityState.EVALUABLE,
    );
  });

  it('A8 — partial pipeline produces PARTIALLY_EVALUABLE when current', () => {
    const health = healthEvidenceFromVehicleHealth(
      buildVehicleHealth({}, { loadFailures: { vehicle_alerts: true } }),
    );
    expect(health.pipelineAvailability).toBe('partial');
    expect(deriveHealthEvaluabilityFromHealthDomain(health)).toBe(
      HealthEvaluabilityState.PARTIALLY_EVALUABLE,
    );
  });
});

describe('telemetryDependentModulesEvaluated semantics', () => {
  it('is true when any telemetry-dependent module is applicable (state !== n_a)', () => {
    const health = healthEvidenceFromVehicleHealth(
      buildVehicleHealth({
        battery: moduleHealth('n_a'),
        tires: moduleHealth('good'),
      }),
    );
    expect(health.telemetryDependentModulesEvaluated).toBe(true);
  });

  it('is false when all telemetry-dependent modules are n_a — not the same as missing', () => {
    const health = healthEvidenceFromVehicleHealth(iceTelemetryModulesNotApplicable());
    expect(health.telemetryDependentModulesEvaluated).toBe(false);
    expect(health.pipelineAvailability).toBe('ready');
  });
});

describe('Fleet health evaluation DTO does not use legacy healthStatus', () => {
  it('condition comes from Rental Health overall_state via projection evidence only', () => {
    const hmue = fixtureHmueC215();
    const projection = buildVehicleOperationalProjection({
      vehicleId: hmue.vehicleId,
      organizationId: 'org-fixture',
      businessState: hmue.businessState,
      connectivity: hmue.connectivity,
      health: healthEvidenceFromVehicleHealth(
        buildVehicleHealth({
          battery: moduleHealth('n_a'),
          tires: moduleHealth('n_a'),
          brakes: moduleHealth('n_a'),
          error_codes: moduleHealth('n_a'),
          vehicle_alerts: moduleHealth('n_a'),
        }),
      ),
      episodeEvidenceReliable: true,
      generatedAt: NOW,
    });
    expect(projection.evidence.healthConditionState).toBe('good');
    expect(projection.healthEvaluability).toBe(HealthEvaluabilityState.EVALUABLE);
  });
});
