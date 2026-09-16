import { DeviceConnectionPhysicalAuthorityMode } from '@prisma/client';
import { TripMetricsService } from '@modules/observability/trip-metrics.service';
import { PhysicalStateCanonicalGate } from './physical-state-authority.types';
import { PhysicalStateShadowClassification } from './physical-state-shadow.classification';
import { PhysicalStateShadowObservabilityService } from './physical-state-shadow-observability.service';
import type { PhysicalStateShadowComparisonResult } from './physical-state-shadow-comparator.types';

describe('PhysicalStateShadowObservabilityService', () => {
  function createMetricsStub() {
    const evaluationInc = jest.fn();
    const classificationInc = jest.fn();
    const blockerInc = jest.fn();
    return {
      connectivityPhysicalStateShadowEvaluationTotal: { inc: evaluationInc },
      connectivityPhysicalStateShadowClassificationTotal: { inc: classificationInc },
      connectivityPhysicalStateShadowCorrectnessBlockerTotal: { inc: blockerInc },
      evaluationInc,
      classificationInc,
      blockerInc,
    } as unknown as TripMetricsService & {
      evaluationInc: jest.Mock;
      classificationInc: jest.Mock;
      blockerInc: jest.Mock;
    };
  }

  function sampleResult(
    overrides: Partial<PhysicalStateShadowComparisonResult> = {},
  ): PhysicalStateShadowComparisonResult {
    return {
      classification: PhysicalStateShadowClassification.MATCH,
      correctnessBlocking: false,
      authorityMode: DeviceConnectionPhysicalAuthorityMode.LEGACY,
      legacyDecision: {
        accepted: true,
        reason: null,
        gate: PhysicalStateCanonicalGate.LEGACY,
      },
      physicalDecision: {
        accepted: true,
        reason: null,
        gate: PhysicalStateCanonicalGate.PHYSICAL,
      },
      scope: { organizationId: 'org-1', vehicleId: 'veh-1', provider: 'DIMO' },
      bindingKey: 'binding-1',
      legacyReason: null,
      physicalReason: null,
      legacyEffectivePlugState: 'plugged',
      physicalEffectiveState: null,
      evidenceObservedAt: null,
      legacyEvidenceObservedAt: null,
      correlationId: 'corr-1',
      evidenceReferenceId: 'evidence-1',
      observedAt: new Date().toISOString(),
      ...overrides,
    };
  }

  it('PSG-T shadow structured log is scope-bound', () => {
    const metrics = createMetricsStub();
    const service = new PhysicalStateShadowObservabilityService(metrics);
    const logSpy = jest.spyOn((service as unknown as { logger: { log: jest.Mock } }).logger, 'log');
    service.recordShadowComparison(sampleResult());
    expect(logSpy).toHaveBeenCalled();
    const payload = logSpy.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(payload.event).toBe('physical_state_shadow_comparison');
    expect(payload.organizationId).toBe('org-1');
    expect(payload.vehicleId).toBe('veh-1');
    expect(payload.provider).toBe('DIMO');
  });

  it('PSG-U shadow metrics do not use high-cardinality vehicle/binding IDs as label dimensions', () => {
    const metrics = createMetricsStub();
    const service = new PhysicalStateShadowObservabilityService(metrics);
    service.recordShadowComparison(sampleResult());

    const labelKeys = new Set<string>();
    for (const call of metrics.evaluationInc.mock.calls) {
      const labels = call[0] as Record<string, string>;
      Object.keys(labels).forEach((key) => labelKeys.add(key));
    }

    expect(labelKeys.has('vehicleId')).toBe(false);
    expect(labelKeys.has('bindingKey')).toBe(false);
    expect(labelKeys.has('organizationId')).toBe(false);
    expect(labelKeys.has('classification')).toBe(true);
    expect(labelKeys.has('provider')).toBe(true);
    expect(labelKeys.has('authority_mode')).toBe(true);
  });

  it('records correctness blocker metric for blocking classifications', () => {
    const metrics = createMetricsStub();
    const service = new PhysicalStateShadowObservabilityService(metrics);
    service.recordShadowComparison(
      sampleResult({
        classification: PhysicalStateShadowClassification.UNEXPLAINED_OLD_REJECT_NEW_ACCEPT,
        correctnessBlocking: true,
      }),
    );

    expect(metrics.blockerInc).toHaveBeenCalled();
  });

  it('PSG-U pilot gate metrics remain low-cardinality', () => {
    const pilotGateInc = jest.fn();
    const metrics = {
      connectivityPhysicalStateShadowPilotScopeGateTotal: { inc: pilotGateInc },
    } as unknown as TripMetricsService;
    const { recordShadowPilotScopeGateObservability } = require('./physical-state-shadow-pilot-scope.observability');
    recordShadowPilotScopeGateObservability(metrics, {
      organizationId: 'org-1',
      vehicleId: 'veh-1',
      provider: 'DIMO',
    }, { allowed: false, reason: 'DENIED_SCOPE_NOT_ALLOWLISTED' });
    const labels = pilotGateInc.mock.calls[0]?.[0] as Record<string, string>;
    expect(labels.organizationId).toBeUndefined();
    expect(labels.vehicleId).toBeUndefined();
    expect(labels.provider).toBe('DIMO');
  });
});
