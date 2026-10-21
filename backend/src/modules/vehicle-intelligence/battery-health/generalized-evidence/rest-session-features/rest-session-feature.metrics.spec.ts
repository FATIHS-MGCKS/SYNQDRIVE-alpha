import {
  BatteryRestSessionFeatureComputationPhase,
  BatteryRestSessionFeatureSessionTrust,
} from '@prisma/client';
import { TripMetricsService } from '@modules/observability/trip-metrics.service';
import { RestSessionFeatureComputationService } from './rest-session-feature-computation.service';
import { RestSessionFeatureShadowTriggerService } from './rest-session-feature-shadow-trigger.service';
import { BATTERY_V2_REST_SESSION_FEATURES_SHADOW_ENABLED_ENV } from '@config/battery-health-v2.config';

function counterValue(
  metricsJson: Awaited<ReturnType<TripMetricsService['registry']['getMetricsAsJSON']>>,
  name: string,
  labels: Record<string, string>,
): number {
  const metric = metricsJson.find((m) => m.name === name);
  if (!metric?.values?.length) return 0;
  const hit = metric.values.find((v) =>
    Object.entries(labels).every(([k, val]) => v.labels?.[k] === val),
  );
  return hit?.value ?? 0;
}

describe('RestSessionFeatureShadowTrigger metrics (C5A)', () => {
  const shadowBackup = process.env[BATTERY_V2_REST_SESSION_FEATURES_SHADOW_ENABLED_ENV];

  afterEach(() => {
    if (shadowBackup === undefined) {
      delete process.env[BATTERY_V2_REST_SESSION_FEATURES_SHADOW_ENABLED_ENV];
    } else {
      process.env[BATTERY_V2_REST_SESSION_FEATURES_SHADOW_ENABLED_ENV] = shadowBackup;
    }
  });

  function buildHarness(flagOn: boolean) {
    process.env[BATTERY_V2_REST_SESSION_FEATURES_SHADOW_ENABLED_ENV] = flagOn ? 'true' : 'false';
    const metrics = new TripMetricsService();
    const computeAndPersist = jest.fn();
    const computation = { computeAndPersist } as unknown as RestSessionFeatureComputationService;
    const trigger = new RestSessionFeatureShadowTriggerService(computation, metrics);
    return { trigger, computeAndPersist, metrics };
  }

  const baseInput = {
    organizationId: 'org-1',
    vehicleId: 'veh-1',
    restSessionId: 'sess-1',
  };

  it('TEST_M1: CREATED → trigger counter once with reason + CREATED', async () => {
    const { trigger, computeAndPersist, metrics } = buildHarness(true);
    computeAndPersist.mockResolvedValue({
      status: 'CREATED',
      row: {
        id: 'row-1',
        computationPhase: BatteryRestSessionFeatureComputationPhase.INCREMENTAL,
        sessionTrust: BatteryRestSessionFeatureSessionTrust.VALID,
      },
    });
    await trigger.triggerFeatureComputation({
      ...baseInput,
      reason: 'VALID_REST_OBSERVATION_LINKED',
    });
    const json = await metrics.registry.getMetricsAsJSON();
    expect(
      counterValue(json, 'synqdrive_battery_rest_session_feature_trigger_total', {
        reason: 'VALID_REST_OBSERVATION_LINKED',
        outcome: 'CREATED',
      }),
    ).toBe(1);
  });

  it('TEST_M2: DUPLICATE_EXISTING → trigger once; row-created unchanged', async () => {
    const { trigger, computeAndPersist, metrics } = buildHarness(true);
    computeAndPersist.mockResolvedValue({ status: 'DUPLICATE_EXISTING', row: { id: 'row-1' } });
    await trigger.triggerFeatureComputation({
      ...baseInput,
      reason: 'REST_SESSION_TERMINAL',
    });
    const json = await metrics.registry.getMetricsAsJSON();
    expect(
      counterValue(json, 'synqdrive_battery_rest_session_feature_trigger_total', {
        reason: 'REST_SESSION_TERMINAL',
        outcome: 'DUPLICATE_EXISTING',
      }),
    ).toBe(1);
    const createdMetric = json.find(
      (m) => m.name === 'synqdrive_battery_rest_session_feature_row_created_total',
    );
    expect(createdMetric?.values?.length ?? 0).toBe(0);
  });

  it('TEST_M3: FAILED_ISOLATED → failure outcome counter once', async () => {
    const { trigger, computeAndPersist, metrics } = buildHarness(true);
    computeAndPersist.mockRejectedValue(new Error('boom'));
    await trigger.triggerFeatureComputation({
      ...baseInput,
      reason: 'LATE_TRIP_ASSOCIATION',
    });
    const json = await metrics.registry.getMetricsAsJSON();
    expect(
      counterValue(json, 'synqdrive_battery_rest_session_feature_trigger_total', {
        reason: 'LATE_TRIP_ASSOCIATION',
        outcome: 'FAILED_ISOLATED',
      }),
    ).toBe(1);
  });

  it('TEST_M4: SKIPPED_FLAG_OFF → trigger counter; C3 calls=0', async () => {
    const { trigger, computeAndPersist, metrics } = buildHarness(false);
    await trigger.triggerFeatureComputation({
      ...baseInput,
      reason: 'VALID_REST_OBSERVATION_LINKED',
    });
    expect(computeAndPersist).not.toHaveBeenCalled();
    const json = await metrics.registry.getMetricsAsJSON();
    expect(
      counterValue(json, 'synqdrive_battery_rest_session_feature_trigger_total', {
        reason: 'VALID_REST_OBSERVATION_LINKED',
        outcome: 'SKIPPED_FLAG_OFF',
      }),
    ).toBe(1);
  });

  it('TEST_M5: CREATED INCREMENTAL VALID → row-created phase/trust labels', async () => {
    const { trigger, computeAndPersist, metrics } = buildHarness(true);
    computeAndPersist.mockResolvedValue({
      status: 'CREATED',
      row: {
        id: 'row-1',
        computationPhase: BatteryRestSessionFeatureComputationPhase.INCREMENTAL,
        sessionTrust: BatteryRestSessionFeatureSessionTrust.VALID,
      },
    });
    await trigger.triggerFeatureComputation({
      ...baseInput,
      reason: 'VALID_REST_OBSERVATION_LINKED',
    });
    const json = await metrics.registry.getMetricsAsJSON();
    expect(
      counterValue(json, 'synqdrive_battery_rest_session_feature_row_created_total', {
        phase: 'INCREMENTAL',
        trust: 'VALID',
      }),
    ).toBe(1);
  });

  it('TEST_M6: CREATED FINAL INVALIDATED → row-created FINAL/INVALIDATED', async () => {
    const { trigger, computeAndPersist, metrics } = buildHarness(true);
    computeAndPersist.mockResolvedValue({
      status: 'CREATED',
      row: {
        id: 'row-2',
        computationPhase: BatteryRestSessionFeatureComputationPhase.FINAL,
        sessionTrust: BatteryRestSessionFeatureSessionTrust.INVALIDATED,
      },
    });
    await trigger.triggerFeatureComputation({
      ...baseInput,
      reason: 'REST_SESSION_TERMINAL',
    });
    const json = await metrics.registry.getMetricsAsJSON();
    expect(
      counterValue(json, 'synqdrive_battery_rest_session_feature_row_created_total', {
        phase: 'FINAL',
        trust: 'INVALIDATED',
      }),
    ).toBe(1);
  });

  it('TEST_M7: duration histogram observed once per trigger call', async () => {
    const { trigger, computeAndPersist, metrics } = buildHarness(true);
    computeAndPersist.mockResolvedValue({
      status: 'CREATED',
      row: {
        id: 'row-1',
        computationPhase: BatteryRestSessionFeatureComputationPhase.INCREMENTAL,
        sessionTrust: BatteryRestSessionFeatureSessionTrust.VALID,
      },
    });
    await trigger.triggerFeatureComputation({
      ...baseInput,
      reason: 'VALID_REST_OBSERVATION_LINKED',
    });
    const text = await metrics.getMetrics();
    expect(text).toContain('synqdrive_battery_rest_session_feature_trigger_duration_seconds_bucket');
    expect(text).toContain('reason="VALID_REST_OBSERVATION_LINKED"');
    expect(text).toContain('outcome="CREATED"');
  });

  it('TEST_M8: metric labelNames remain bounded (no id/uuid labels)', async () => {
    const { trigger, computeAndPersist, metrics } = buildHarness(true);
    computeAndPersist.mockResolvedValue({
      status: 'CREATED',
      row: {
        id: 'row-1',
        computationPhase: BatteryRestSessionFeatureComputationPhase.INCREMENTAL,
        sessionTrust: BatteryRestSessionFeatureSessionTrust.VALID,
      },
    });
    await trigger.triggerFeatureComputation({
      ...baseInput,
      reason: 'VALID_REST_OBSERVATION_LINKED',
    });
    const text = await metrics.getMetrics();
    const forbiddenInFeatureMetrics = [
      'organization_id',
      'vehicle_id',
      'rest_session_id',
      'input_digest',
      'feature_row_id',
    ];
    for (const fragment of [
      'synqdrive_battery_rest_session_feature_trigger_total',
      'synqdrive_battery_rest_session_feature_trigger_duration_seconds',
      'synqdrive_battery_rest_session_feature_row_created_total',
    ]) {
      expect(text).toContain(fragment);
      const block = text.split(fragment)[1]?.split('\n# HELP')[0] ?? '';
      for (const label of forbiddenInFeatureMetrics) {
        expect(block).not.toContain(`${label}=`);
      }
    }
    expect(text).toContain('reason="VALID_REST_OBSERVATION_LINKED"');
    expect(text).toContain('phase="INCREMENTAL"');
  });
});
