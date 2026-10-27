import type { VsiProfileEvaluationResult, VsiProfileSignalFingerprintV1 } from './vsi-profile.types';
import { VSI_PROFILE_CONTRACT_VERSION } from './vsi-profile.types';
import { VSI_SIGNAL_CADENCE_CONTRACT_VERSION } from './vsi-profile-cadence.types';
import {
  buildOperationalProfileRefreshCasWhere,
  buildOperationalProfileRefreshUpdate,
  mergeOperationalCadenceIntelligence,
  mergeOperationalSignalSnapshots,
} from './vsi-profile-operational-refresh.util';

function signalRow(
  key: VsiProfileSignalFingerprintV1['canonicalSignalKey'],
  overrides: Partial<VsiProfileSignalFingerprintV1> = {},
): VsiProfileSignalFingerprintV1 {
  return {
    canonicalSignalKey: key,
    providerNativeSignalName: key,
    declaredSupport: 'LISTED',
    empiricalObservation: 'OBSERVED',
    lastValidObservationAt: '2026-10-15T12:00:00.000Z',
    lastSourceTimestamp: '2026-10-15T12:00:00.000Z',
    lastProviderFetchAt: '2026-10-15T12:00:01.000Z',
    lastProvenStrictSourceAdvanceAt: null,
    strictSourceAdvanced: 'UNKNOWN',
    freshnessClassification: 'FRESH',
    evidenceProvenance: ['VEHICLE_LATEST_STATE'],
    limitations: [],
    signalFingerprintContractVersion: 'vsi-signal-fingerprint-v1',
    qualityClassification: 'OBSERVED_FRESH',
    confidenceLevel: 'MEDIUM',
    observedSamples: null,
    provenSourceAdvances: null,
    observedCadenceMedianSeconds: null,
    observedCadenceSampleCount: null,
    maxStaleIntervalSeconds: null,
    contentFingerprint: 'fp',
    ...overrides,
  };
}

function evaluation(
  signals: VsiProfileSignalFingerprintV1[],
  overrides: Partial<VsiProfileEvaluationResult> = {},
): VsiProfileEvaluationResult {
  return {
    contractVersion: VSI_PROFILE_CONTRACT_VERSION,
    organizationId: 'org',
    vehicleId: 'veh',
    providerSourceLinkId: 'link',
    providerIdentity: 'DIMO',
    verifiedModality: null,
    telemetrySourceFamily: null,
    evaluatedAt: new Date('2026-10-15T12:00:05.000Z'),
    declaredCatalogCheckedAt: new Date('2026-10-10T10:00:00.000Z'),
    lastMaterializedSourceTimestamp: new Date('2026-10-15T12:00:00.000Z'),
    lastMaterializedProviderFetchAt: new Date('2026-10-15T12:00:05.000Z'),
    lastProvenStrictSourceAdvanceAt: null,
    signals,
    profileLimitations: [],
    ...overrides,
  };
}

describe('vsi-profile-operational-refresh.util', () => {
  it('mergeOperationalSignalSnapshots keeps the later lastProviderFetchAt', () => {
    const persisted = [signalRow('lv_voltage', { lastProviderFetchAt: '2026-10-15T12:00:10.000Z' })];
    const incoming = [signalRow('lv_voltage', { lastProviderFetchAt: '2026-10-15T12:00:05.000Z' })];
    const merged = mergeOperationalSignalSnapshots(persisted, incoming);
    expect(merged[0]?.lastProviderFetchAt).toBe('2026-10-15T12:00:10.000Z');
  });

  it('buildOperationalProfileRefreshUpdate rejects stale semantic evaluation', () => {
    const persistedSignals = [signalRow('lv_voltage', { lastValidObservationAt: '2026-10-15T12:00:00.000Z' })];
    const staleSignals = [
      signalRow('lv_voltage', {
        lastValidObservationAt: '2026-10-14T12:00:00.000Z',
        lastSourceTimestamp: '2026-10-14T12:00:00.000Z',
      }),
    ];
    const update = buildOperationalProfileRefreshUpdate({
      persisted: {
        profileContractVersion: VSI_PROFILE_CONTRACT_VERSION,
        providerSourceLinkId: 'link',
        providerIdentity: 'DIMO',
        verifiedModality: null,
        telemetrySourceFamily: null,
        declaredCatalogCheckedAt: new Date('2026-10-10T10:00:00.000Z'),
        lastMaterializedSourceTimestamp: new Date('2026-10-15T12:00:00.000Z'),
        lastProvenStrictSourceAdvanceAt: null,
        profileLimitations: [],
        signalsSnapshot: persistedSignals,
        evaluatedAt: new Date('2026-10-15T12:00:01.000Z'),
        lastMaterializedProviderFetchAt: new Date('2026-10-15T12:00:01.000Z'),
      },
      evaluation: evaluation(staleSignals),
      semanticFingerprint: 'fp',
    });
    expect(update).toBeNull();
  });

  it('buildOperationalProfileRefreshUpdate does not move fetch timestamps backward', () => {
    const persistedSignals = [signalRow('lv_voltage', { lastProviderFetchAt: '2026-10-15T12:00:10.000Z' })];
    const incomingSignals = [signalRow('lv_voltage', { lastProviderFetchAt: '2026-10-15T12:00:05.000Z' })];
    const update = buildOperationalProfileRefreshUpdate({
      persisted: {
        profileContractVersion: VSI_PROFILE_CONTRACT_VERSION,
        providerSourceLinkId: 'link',
        providerIdentity: 'DIMO',
        verifiedModality: null,
        telemetrySourceFamily: null,
        declaredCatalogCheckedAt: new Date('2026-10-10T10:00:00.000Z'),
        lastMaterializedSourceTimestamp: new Date('2026-10-15T12:00:00.000Z'),
        lastProvenStrictSourceAdvanceAt: null,
        profileLimitations: [],
        signalsSnapshot: persistedSignals,
        evaluatedAt: new Date('2026-10-15T12:00:10.000Z'),
        lastMaterializedProviderFetchAt: new Date('2026-10-15T12:00:10.000Z'),
      },
      evaluation: evaluation(incomingSignals, {
        evaluatedAt: new Date('2026-10-15T12:00:05.000Z'),
        lastMaterializedProviderFetchAt: new Date('2026-10-15T12:00:05.000Z'),
      }),
      semanticFingerprint: 'fp',
    });
    expect(update).toBeNull();
  });

  it('mergeOperationalCadenceIntelligence refreshes activeRpmProfile when cadence fingerprint is stable', () => {
    const cadenceBase = {
      contractVersion: VSI_SIGNAL_CADENCE_CONTRACT_VERSION,
      evidenceConfidence: 'HIGH' as const,
      provenance: [],
      limitations: [],
      observedSampleCount: 100,
      distinctTimestampCount: 100,
      intervalMedianSeconds: 1,
      intervalP95Seconds: 2,
      maxIntraWindowGapSeconds: 2,
      activeWindowCoverageRatio: 0.5,
      finalizedTripCount: 5,
      regimes: [],
      observedDensityLabel: 'ONE_SECOND_BUCKETS_UNPROVEN' as const,
      cadenceSemanticFingerprint: 'cadence-fp-stable',
    };
    const persistedCadence = {
      ...cadenceBase,
      activeRpmProfile: {
        contractVersion: 'vsi-active-rpm-profile-v1' as const,
        activeProfile: 'RPM_1HZ' as const,
        evaluatedTripIds: ['trip-a', 'trip-b', 'trip-c', 'trip-d', 'trip-e'],
        qualifyingTripCount: 5,
        agreementRatio: 1,
        classificationDecisionCode: 'ROLLING_SUPERMAJORITY',
        classificationDecisionSummary: 'ok',
        tripClassifications: [],
        profileSemanticFingerprint: 'rpm-profile-fp',
      },
    };
    const incomingCadence = {
      ...cadenceBase,
      activeRpmProfile: {
        ...persistedCadence.activeRpmProfile!,
        evaluatedTripIds: ['trip-b', 'trip-c', 'trip-d', 'trip-e', 'trip-f'],
        classificationDecisionSummary: 'rolled',
      },
    };
    const merged = mergeOperationalCadenceIntelligence(persistedCadence, incomingCadence);
    expect(merged?.activeRpmProfile?.evaluatedTripIds).toEqual([
      'trip-b',
      'trip-c',
      'trip-d',
      'trip-e',
      'trip-f',
    ]);
    expect(merged?.cadenceSemanticFingerprint).toBe('cadence-fp-stable');
  });

  it('mergeOperationalCadenceIntelligence keeps persisted cadence when semantic fingerprint diverges', () => {
    const persisted = {
      contractVersion: VSI_SIGNAL_CADENCE_CONTRACT_VERSION,
      evidenceConfidence: 'HIGH' as const,
      provenance: [],
      limitations: [],
      observedSampleCount: 1,
      distinctTimestampCount: 1,
      intervalMedianSeconds: 6,
      intervalP95Seconds: 8,
      maxIntraWindowGapSeconds: 8,
      activeWindowCoverageRatio: null,
      finalizedTripCount: 5,
      regimes: [],
      observedDensityLabel: 'SUB_ONE_HZ' as const,
      cadenceSemanticFingerprint: 'cadence-fp-a',
    };
    const incoming = { ...persisted, cadenceSemanticFingerprint: 'cadence-fp-b' };
    expect(mergeOperationalCadenceIntelligence(persisted, incoming)?.cadenceSemanticFingerprint).toBe(
      'cadence-fp-a',
    );
  });

  it('buildOperationalProfileRefreshUpdate applies cadence operational refresh without fetch advance', () => {
    const cadence = (tripIds: string[]) => ({
      contractVersion: VSI_SIGNAL_CADENCE_CONTRACT_VERSION,
      evidenceConfidence: 'HIGH' as const,
      provenance: ['CLICKHOUSE_TELEMETRY_HF_POINTS'],
      limitations: [],
      observedSampleCount: 50,
      distinctTimestampCount: 50,
      intervalMedianSeconds: 1,
      intervalP95Seconds: 2,
      maxIntraWindowGapSeconds: 2,
      activeWindowCoverageRatio: 0.4,
      finalizedTripCount: tripIds.length,
      regimes: [],
      observedDensityLabel: 'ONE_SECOND_BUCKETS_UNPROVEN' as const,
      cadenceSemanticFingerprint: 'cadence-fp-stable',
      activeRpmProfile: {
        contractVersion: 'vsi-active-rpm-profile-v1' as const,
        activeProfile: 'RPM_1HZ' as const,
        evaluatedTripIds: tripIds,
        qualifyingTripCount: tripIds.length,
        agreementRatio: 1,
        classificationDecisionCode: 'ROLLING_SUPERMAJORITY',
        classificationDecisionSummary: 'ok',
        tripClassifications: [],
        profileSemanticFingerprint: 'rpm-profile-fp',
      },
    });
    const persistedSignals = [
      signalRow('engine_rpm', {
        cadenceIntelligence: cadence(['t1', 't2', 't3', 't4', 't5']),
      }),
    ];
    const incomingSignals = [
      signalRow('engine_rpm', {
        cadenceIntelligence: cadence(['t2', 't3', 't4', 't5', 't6']),
      }),
    ];
    const update = buildOperationalProfileRefreshUpdate({
      persisted: {
        profileContractVersion: VSI_PROFILE_CONTRACT_VERSION,
        providerSourceLinkId: 'link',
        providerIdentity: 'DIMO',
        verifiedModality: null,
        telemetrySourceFamily: null,
        declaredCatalogCheckedAt: new Date('2026-10-10T10:00:00.000Z'),
        lastMaterializedSourceTimestamp: new Date('2026-10-15T12:00:00.000Z'),
        lastProvenStrictSourceAdvanceAt: null,
        profileLimitations: [],
        signalsSnapshot: persistedSignals,
        evaluatedAt: new Date('2026-10-15T12:00:10.000Z'),
        lastMaterializedProviderFetchAt: new Date('2026-10-15T12:00:10.000Z'),
      },
      evaluation: evaluation(incomingSignals, {
        evaluatedAt: new Date('2026-10-15T12:00:10.000Z'),
        lastMaterializedProviderFetchAt: new Date('2026-10-15T12:00:10.000Z'),
      }),
      semanticFingerprint: 'profile-fp',
    });
    expect(update).not.toBeNull();
    const rpm = (update!.signalsSnapshot as VsiProfileSignalFingerprintV1[]).find(
      (s) => s.canonicalSignalKey === 'engine_rpm',
    );
    expect(rpm?.cadenceIntelligence?.activeRpmProfile?.evaluatedTripIds).toEqual([
      't2',
      't3',
      't4',
      't5',
      't6',
    ]);
  });

  it('buildOperationalProfileRefreshCasWhere includes revision, updatedAt, and nullable fetch', () => {
    const at = new Date('2026-10-15T12:00:00.000Z');
    expect(
      buildOperationalProfileRefreshCasWhere({
        id: 'pid',
        profileRevision: 3,
        updatedAt: at,
        lastMaterializedProviderFetchAt: null,
      }),
    ).toEqual({
      id: 'pid',
      profileRevision: 3,
      updatedAt: at,
      lastMaterializedProviderFetchAt: null,
    });
  });
});
