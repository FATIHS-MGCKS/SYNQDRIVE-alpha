import { enrichVsiProfileWithCadenceIntelligence } from './vsi-profile-cadence.enricher';
import { analyzeEngineRpmCadence } from './vsi-profile-cadence-stats.util';
import type { VsiProfileEvaluationResult } from './vsi-profile.types';

function minimalEval(): VsiProfileEvaluationResult {
  return {
    contractVersion: 'vsi-signal-profile-v2',
    organizationId: 'o',
    vehicleId: 'v',
    providerSourceLinkId: 'l',
    providerIdentity: 'DIMO',
    verifiedModality: null,
    telemetrySourceFamily: null,
    evaluatedAt: new Date(),
    declaredCatalogCheckedAt: null,
    lastMaterializedSourceTimestamp: null,
    lastMaterializedProviderFetchAt: null,
    lastProvenStrictSourceAdvanceAt: null,
    profileLimitations: [],
    signals: [
      {
        canonicalSignalKey: 'engine_rpm',
        providerNativeSignalName: 'powertrainCombustionEngineSpeed',
        declaredSupport: 'UNKNOWN',
        empiricalObservation: 'NEVER_OBSERVED',
        lastValidObservationAt: null,
        lastSourceTimestamp: null,
        lastProviderFetchAt: null,
        lastProvenStrictSourceAdvanceAt: null,
        strictSourceAdvanced: 'UNKNOWN',
        freshnessClassification: 'UNKNOWN',
        evidenceProvenance: [],
        limitations: [],
        signalFingerprintContractVersion: 'vsi-signal-fingerprint-v1',
        qualityClassification: 'UNKNOWN',
        confidenceLevel: 'UNKNOWN',
        observedSamples: null,
        provenSourceAdvances: null,
        observedCadenceMedianSeconds: null,
        observedCadenceSampleCount: null,
        maxStaleIntervalSeconds: null,
        contentFingerprint: 'x',
      },
    ],
  };
}

describe('vsi-profile-cadence.enricher', () => {
  it('preserves prior RPM cadence when ClickHouse is unavailable', () => {
    const prior = analyzeEngineRpmCadence({
      iceRpmApplicability: 'APPLICABLE',
      tripWindows: [],
      points: [{ recordedAtMs: 1, value: 100 }],
      provenance: ['CLICKHOUSE_TELEMETRY_HF_POINTS'],
      hfReadStatus: 'SUCCESS',
    });
    const result = enrichVsiProfileWithCadenceIntelligence(minimalEval(), {
      rpmEvidence: {
        iceRpmApplicability: 'APPLICABLE',
        tripWindows: [],
        points: [],
        provenance: [],
        hfReadStatus: 'UNAVAILABLE',
      },
      lvEvidence: null,
      priorCadenceByKey: new Map([['engine_rpm', prior]]),
    });
    const rpm = result.signals[0]?.cadenceIntelligence;
    expect(rpm?.cadenceSemanticFingerprint).toBe(prior.cadenceSemanticFingerprint);
    expect(rpm?.observedSampleCount).toBe(prior.observedSampleCount);
  });
});
