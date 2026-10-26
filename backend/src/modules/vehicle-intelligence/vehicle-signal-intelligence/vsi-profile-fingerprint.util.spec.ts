import { enrichVsiProfileWithSignalFingerprints } from './vsi-signal-fingerprint.enricher';
import type { VsiProfileEvaluationDraft } from './vsi-profile.types';
import { VSI_PROFILE_CONTRACT_VERSION } from './vsi-profile.types';
import {
  areVsiProfileSemanticEvaluationsEquivalent,
  fingerprintVsiProfileSemanticEvaluation,
  fingerprintVsiProfileSemanticFromPersisted,
} from './vsi-profile-fingerprint.util';

function baseDraft(): VsiProfileEvaluationDraft {
  const ts = '2026-10-15T12:00:00.000Z';
  return {
    contractVersion: VSI_PROFILE_CONTRACT_VERSION,
    organizationId: 'org-1',
    vehicleId: 'veh-1',
    providerSourceLinkId: 'link-1',
    providerIdentity: 'DIMO',
    verifiedModality: 'HARDWARE_DEVICE',
    telemetrySourceFamily: 'RUPTELA_R1',
    evaluatedAt: new Date('2026-10-15T12:05:00.000Z'),
    declaredCatalogCheckedAt: new Date('2026-10-10T10:00:00.000Z'),
    lastMaterializedSourceTimestamp: new Date(ts),
    lastMaterializedProviderFetchAt: new Date('2026-10-15T12:00:01.000Z'),
    lastProvenStrictSourceAdvanceAt: new Date(ts),
    profileLimitations: [],
    signals: [
      {
        canonicalSignalKey: 'vehicle_speed',
        providerNativeSignalName: 'speed',
        declaredSupport: 'LISTED',
        empiricalObservation: 'OBSERVED',
        lastValidObservationAt: ts,
        lastSourceTimestamp: ts,
        lastProviderFetchAt: '2026-10-15T12:00:01.000Z',
        lastProvenStrictSourceAdvanceAt: null,
        strictSourceAdvanced: 'UNKNOWN',
        freshnessClassification: 'FRESH',
        evidenceProvenance: ['VEHICLE_LATEST_STATE'],
        limitations: [],
      },
      {
        canonicalSignalKey: 'provider_source_timestamp',
        providerNativeSignalName: 'provider_source_timestamp',
        declaredSupport: 'UNKNOWN',
        empiricalObservation: 'OBSERVED',
        lastValidObservationAt: ts,
        lastSourceTimestamp: ts,
        lastProviderFetchAt: '2026-10-15T12:00:01.000Z',
        lastProvenStrictSourceAdvanceAt: ts,
        strictSourceAdvanced: true,
        freshnessClassification: 'UNKNOWN',
        evidenceProvenance: ['VEHICLE_LATEST_STATE'],
        limitations: [],
      },
    ],
  };
}

describe('vsi-profile-fingerprint.util', () => {
  it('keeps semantic fingerprint stable when only provider fetch bookkeeping changes', () => {
    const draft = baseDraft();
    const enrichedA = enrichVsiProfileWithSignalFingerprints(draft, {
      bundleSourceTimestamps: [new Date('2026-10-15T12:00:00.000Z')],
    });
    const fpA = fingerprintVsiProfileSemanticEvaluation(enrichedA);

    const draftB = {
      ...draft,
      evaluatedAt: new Date('2026-10-15T18:00:00.000Z'),
      lastMaterializedProviderFetchAt: new Date('2026-10-15T18:00:05.000Z'),
      signals: draft.signals.map((signal) => ({
        ...signal,
        lastProviderFetchAt: '2026-10-15T18:00:05.000Z',
      })),
    };
    const enrichedB = enrichVsiProfileWithSignalFingerprints(draftB, {
      bundleSourceTimestamps: [new Date('2026-10-15T12:00:00.000Z')],
    });
    const fpB = fingerprintVsiProfileSemanticEvaluation(enrichedB);

    expect(fpA).toBe(fpB);
  });

  it('changes semantic fingerprint when empirical observation changes', () => {
    const draft = baseDraft();
    const enrichedA = enrichVsiProfileWithSignalFingerprints(draft, {
      bundleSourceTimestamps: [new Date('2026-10-15T12:00:00.000Z')],
    });
    const fpA = fingerprintVsiProfileSemanticEvaluation(enrichedA);

    const draftB = {
      ...draft,
      signals: draft.signals.map((signal) =>
        signal.canonicalSignalKey === 'vehicle_speed'
          ? {
              ...signal,
              empiricalObservation: 'NEVER_OBSERVED' as const,
              lastValidObservationAt: null,
              lastSourceTimestamp: null,
            }
          : signal,
      ),
    };
    const enrichedB = enrichVsiProfileWithSignalFingerprints(draftB, {
      bundleSourceTimestamps: [new Date('2026-10-15T12:00:00.000Z')],
    });
    const fpB = fingerprintVsiProfileSemanticEvaluation(enrichedB);

    expect(fpA).not.toBe(fpB);
  });

  it('ignores provider_last_successful_fetch wall-clock observation time in semantic fingerprint', () => {
    const draft = baseDraft();
    draft.signals.push({
      canonicalSignalKey: 'provider_last_successful_fetch',
      providerNativeSignalName: 'provider_last_successful_fetch',
      declaredSupport: 'UNKNOWN',
      empiricalObservation: 'OBSERVED',
      lastValidObservationAt: '2026-10-15T12:00:01.000Z',
      lastSourceTimestamp: null,
      lastProviderFetchAt: '2026-10-15T12:00:01.000Z',
      lastProvenStrictSourceAdvanceAt: null,
      strictSourceAdvanced: 'UNKNOWN',
      freshnessClassification: 'UNKNOWN',
      evidenceProvenance: ['VEHICLE_LATEST_STATE'],
      limitations: ['PROVIDER_FETCH_TIME_NOT_SOURCE_ADVANCE_PROOF'],
    });
    const enrichedA = enrichVsiProfileWithSignalFingerprints(draft, {
      bundleSourceTimestamps: [new Date('2026-10-15T12:00:00.000Z')],
    });
    const fpA = fingerprintVsiProfileSemanticEvaluation(enrichedA);

    const draftB = {
      ...draft,
      signals: draft.signals.map((signal) =>
        signal.canonicalSignalKey === 'provider_last_successful_fetch'
          ? {
              ...signal,
              lastValidObservationAt: '2026-10-15T18:00:05.000Z',
              lastProviderFetchAt: '2026-10-15T18:00:05.000Z',
            }
          : signal,
      ),
    };
    const enrichedB = enrichVsiProfileWithSignalFingerprints(draftB, {
      bundleSourceTimestamps: [new Date('2026-10-15T12:00:00.000Z')],
    });
    expect(fingerprintVsiProfileSemanticEvaluation(enrichedB)).toBe(fpA);
  });

  it('areVsiProfileSemanticEvaluationsEquivalent ignores fetch-only deltas', () => {
    const draft = baseDraft();
    const enrichedA = enrichVsiProfileWithSignalFingerprints(draft, {
      bundleSourceTimestamps: [new Date('2026-10-15T12:00:00.000Z')],
    });
    const enrichedB = enrichVsiProfileWithSignalFingerprints(
      {
        ...draft,
        evaluatedAt: new Date('2026-10-15T18:00:00.000Z'),
        lastMaterializedProviderFetchAt: new Date('2026-10-15T18:00:05.000Z'),
        signals: draft.signals.map((signal) => ({
          ...signal,
          lastProviderFetchAt: '2026-10-15T18:00:05.000Z',
        })),
      },
      { bundleSourceTimestamps: [new Date('2026-10-15T12:00:00.000Z')] },
    );
    expect(
      areVsiProfileSemanticEvaluationsEquivalent(
        {
          profileContractVersion: enrichedA.contractVersion,
          providerSourceLinkId: enrichedA.providerSourceLinkId,
          providerIdentity: enrichedA.providerIdentity,
          verifiedModality: enrichedA.verifiedModality,
          telemetrySourceFamily: enrichedA.telemetrySourceFamily,
          declaredCatalogCheckedAt: enrichedA.declaredCatalogCheckedAt,
          lastMaterializedSourceTimestamp: enrichedA.lastMaterializedSourceTimestamp,
          lastProvenStrictSourceAdvanceAt: enrichedA.lastProvenStrictSourceAdvanceAt,
          profileLimitations: enrichedA.profileLimitations,
          signalsSnapshot: enrichedA.signals,
        },
        enrichedB,
      ),
    ).toBe(true);
  });

  it('recomputes the same semantic fingerprint from persisted snapshots', () => {
    const enriched = enrichVsiProfileWithSignalFingerprints(baseDraft(), {
      bundleSourceTimestamps: [new Date('2026-10-15T12:00:00.000Z')],
    });
    const fromEval = fingerprintVsiProfileSemanticEvaluation(enriched);
    const fromPersisted = fingerprintVsiProfileSemanticFromPersisted({
      profileContractVersion: enriched.contractVersion,
      providerSourceLinkId: enriched.providerSourceLinkId,
      providerIdentity: enriched.providerIdentity,
      verifiedModality: enriched.verifiedModality,
      telemetrySourceFamily: enriched.telemetrySourceFamily,
      declaredCatalogCheckedAt: enriched.declaredCatalogCheckedAt,
      lastMaterializedSourceTimestamp: enriched.lastMaterializedSourceTimestamp,
      lastProvenStrictSourceAdvanceAt: enriched.lastProvenStrictSourceAdvanceAt,
      profileLimitations: enriched.profileLimitations,
      signalsSnapshot: enriched.signals,
    });
    expect(fromPersisted).toBe(fromEval);
  });
});
