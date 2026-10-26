import type { VsiProfileEvaluationResult, VsiProfileSignalFingerprintV1 } from './vsi-profile.types';
import { VSI_PROFILE_CONTRACT_VERSION } from './vsi-profile.types';
import {
  buildOperationalProfileRefreshCasWhere,
  buildOperationalProfileRefreshUpdate,
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
