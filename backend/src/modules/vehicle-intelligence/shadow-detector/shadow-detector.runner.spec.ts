import { runShadowDetectorFramework } from './shadow-detector.runner';
import type { ShadowDetectorImplementation } from './shadow-detector.port';
import { SHADOW_DETECTOR_FRAMEWORK_VERSION } from './shadow-detector.types';

describe('shadow-detector.runner', () => {
  const trip = {
    tripId: 'trip-1',
    vehicleId: 'veh-1',
    organizationId: 'org-1',
    analysisRunId: 'run-1',
    startTime: new Date('2026-07-16T10:00:00Z'),
    endTime: new Date('2026-07-16T10:30:00Z'),
    frameworkVersion: SHADOW_DETECTOR_FRAMEWORK_VERSION,
    resolvedAt: new Date().toISOString(),
  };

  const executingImpl: ShadowDetectorImplementation = {
    detectorId: 'cold_engine_load',
    modelVersion: 'cold-engine-shadow-v1',
    detect: () => ({
      detectorId: 'cold_engine_load',
      modelVersion: 'cold-engine-shadow-v1',
      capabilityStatus: 'SHADOW',
      assessability: 'LIMITED',
      candidateEvents: [
        {
          eventType: 'COLD_ENGINE_HIGH_RPM',
          occurredAt: '2026-07-16T10:05:00.000Z',
          severity: 'MEDIUM',
        },
      ],
      context: { shadowMode: true },
      confidence: 0.4,
      coverage: 0.6,
      rejectionReasons: [],
      comparisonWithNativeEvents: null,
      skipped: false,
    }),
  };

  it('does not execute detectors with UNSUPPORTED capability', async () => {
    const detectSpy = jest.fn();
    const impl: ShadowDetectorImplementation = {
      detectorId: 'cold_engine_load',
      modelVersion: 'v1',
      detect: detectSpy,
    };

    const outcome = await runShadowDetectorFramework({
      trip,
      capabilities: [
        {
          detectorKey: 'cold_engine_load',
          label: 'Cold Engine Load',
          status: 'UNSUPPORTED',
          reasons: [],
          requiredSignals: ['obdEngineLoad'],
          requiredNativeEvents: [],
          requiredSegmentDetectors: [],
          missingRequirements: ['obdEngineLoad'],
          capabilityVersion: 'cap-v1',
          effectiveCadenceMs: null,
          p95CadenceMs: null,
          coverage: null,
          hardwareType: 'LTE_R1',
        },
      ],
      implementations: [impl],
      nativeEvents: [],
      engineShadowEnabled: true,
      hfShadowEnabled: true,
    });

    expect(detectSpy).not.toHaveBeenCalled();
    expect(outcome.results[0]?.skipped).toBe(true);
    expect(outcome.results[0]?.skipReason).toBe('capability_unsupported');
  });

  it('executes SHADOW detectors and attaches native comparison', async () => {
    const outcome = await runShadowDetectorFramework({
      trip,
      capabilities: [
        {
          detectorKey: 'cold_engine_load',
          label: 'Cold Engine Load',
          status: 'SHADOW',
          reasons: [],
          requiredSignals: ['obdEngineLoad'],
          requiredNativeEvents: [],
          requiredSegmentDetectors: [],
          missingRequirements: [],
          capabilityVersion: 'cap-v1',
          effectiveCadenceMs: 5000,
          p95CadenceMs: 8000,
          coverage: 0.8,
          hardwareType: 'LTE_R1',
        },
      ],
      implementations: [executingImpl],
      nativeEvents: [],
      engineShadowEnabled: true,
      hfShadowEnabled: true,
    });

    expect(outcome.results[0]?.skipped).toBe(false);
    expect(outcome.results[0]?.candidateEvents).toHaveLength(1);
    expect(outcome.results[0]?.comparisonWithNativeEvents?.shadowCandidateCount).toBe(1);
  });
});
